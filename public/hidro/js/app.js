import { db, loadTeamPlants, parseOmieExcel, dateFromName, storePrices, parseManual, autoPrices } from "./data.js";
import { optimizeDay, totals, inflowSeries, observedAport, estimatePrices, samplePrices } from "./hydro.js";
import { xyChart, legend, tipRow, hideTip } from "./charts.js";
import { num, eur, esc, addDays, todayKey, fmtDayLong, fmtDayShort, fmtHM, downloadFile, mean } from "./util.js";

const C = { brand: "var(--brand)", s1: "var(--series-1)", s2: "var(--series-2)", s3: "var(--series-3)", neg: "var(--critical)", muted: "var(--muted)" };
const GCOL = [C.s1, C.s2, C.s3, "var(--series-4)"];
const view = document.getElementById("view");
const TODAY = todayKey();
const TOMORROW = addDays(TODAY, 1);
const ui = { date: TOMORROW };

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2800);
}
const cmFmt = (v) => `${v >= 0 ? "+" : ""}${num(v, 1)} cm`;
const cota = (v) => (v == null || Number.isNaN(v) ? "–" : num(v, 2));
const inSeason = (date, from, to) => {
  const md = date.slice(5);
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
};

// ---------- cálculo con memoria ----------
const memo = new Map();
const autoCache = new Map();
db.on(() => memo.clear());

async function pricesInfo(date) {
  const p = db.get().prices[date];
  if (p) return { prices: p.es, source: p.source, file: p.file };
  if (!autoCache.has(date)) autoCache.set(date, await autoPrices(date));
  const auto = autoCache.get(date);
  if (auto) return { prices: auto, source: "auto" };
  const est = estimatePrices(date, db.get().prices);
  if (est) return { prices: est.prices, source: "estimado", note: `${est.how}: ${fmtDayLong(est.from)}` };
  return { prices: samplePrices(date), source: "ejemplo" };
}

const ikey = (p, d) => `${p.id}|${d}`;
function savedInputs(p, d) {
  return db.get().inputs[ikey(p, d)] || {};
}
function setInputs(p, d, patch) {
  const all = { ...db.get().inputs };
  const cur = { ...(all[ikey(p, d)] || {}), ...patch };
  for (const k of Object.keys(cur)) if (cur[k] === "" || cur[k] == null) delete cur[k];
  all[ikey(p, d)] = cur;
  db.set({ inputs: all });
}
function logOf(p) {
  return db.get().log[p.id] || {};
}
// cm que aporta la central de arriba un día concreto según el diario
function upstreamCmFromLog(p, d) {
  if (!p.cascade?.from) return 0;
  const up = db.plant(p.cascade.from);
  if (!up || up.id !== p.cascade.from) return 0;
  const t = totals(up);
  const hours = logOf(up)[d]?.hours || {};
  return (up.groups || []).reduce((s, g) => s + (+hours[g.id] || 0) * ((+g.pmax || 0) / (t.pmax || 1)) * (+p.cascade.cmhFull || 0), 0);
}
// Aportación natural observada (cm/día) de los últimos días según el diario
export function observedSeries(p, endDate, days = 14) {
  const log = logOf(p);
  const out = [];
  for (let i = days; i >= 1; i--) {
    const d = addDays(endDate, -i);
    const a = log[d];
    const b = log[addDays(d, 1)];
    out.push({ d, v: a && b ? observedAport(p, a.cota, b.cota, a.hours, upstreamCmFromLog(p, d)) : null });
  }
  return out;
}
function suggestedAport(p, date) {
  const vals = observedSeries(p, date, 10).map((x) => x.v).filter((v) => v != null && Number.isFinite(v));
  return vals.length ? { value: mean(vals.slice(-3)), n: Math.min(3, vals.length) } : null;
}
function anchorBefore(p, date) {
  const log = logOf(p);
  for (let i = 1; i <= 14; i++) {
    const d = addDays(date, -i);
    if (log[d]?.cota != null && log[d].cota !== "") return d;
    if (savedInputs(p, d).cota0 != null) return d;
  }
  return null;
}

async function computePlan(p, date, depth = 0) {
  const k = ikey(p, date);
  if (memo.has(k)) return memo.get(k);
  const promise = (async () => {
    const inp = savedInputs(p, date);
    const log = logOf(p);
    let cota0;
    let cotaOrigin;
    if (inp.cota0 != null) [cota0, cotaOrigin] = [+inp.cota0, "introducida"];
    else if (log[date]?.cota != null && log[date].cota !== "") [cota0, cotaOrigin] = [+log[date].cota, "diario"];
    else if (depth < 15 && anchorBefore(p, date)) {
      const prev = await computePlan(p, addDays(date, -1), depth + 1);
      [cota0, cotaOrigin] = [prev.plan.cotaEnd, `fin del plan del ${fmtDayShort(addDays(date, -1))}`];
    } else [cota0, cotaOrigin] = [(+p.cotaMin + +p.cotaMax) / 2, "sin dato (mitad del rango)"];

    const sug = suggestedAport(p, date);
    const aport = inp.aport != null ? +inp.aport : sug ? sug.value : 0;
    const aportOrigin = inp.aport != null ? "introducida" : sug ? `media diario (${sug.n} d)` : "sin dato";
    const target = inp.target != null ? +inp.target : cota0;
    const pinfo = await pricesInfo(date);
    const n = pinfo.prices.length;
    const perH = n / 24;
    let upstream = null;
    if (p.cascade?.from && db.get().plants.some((x) => x.id === p.cascade.from)) {
      const up = db.plant(p.cascade.from);
      const upr = await computePlan(up, date, depth);
      upstream = { plan: upr.plan, delayMin: +p.cascade.delayMin || 0, cmhFull: +p.cascade.cmhFull || 0, pmaxTotal: totals(up).pmax, name: up.name };
    }
    const inflow = inflowSeries(n, aport, upstream);
    const hourOf = (t) => Math.min(23, Math.floor(t / perH));
    const riegoOn = p.riego?.on && inSeason(date, p.riego.from || "06-01", p.riego.to || "09-15");
    const forcedH = inp.forced || (riegoOn ? p.riego.hours || [] : []);
    const blockedH = inp.blocked || [];
    const blocked = Array.from({ length: n }, (_, t) => !!blockedH[hourOf(t)]);
    const forced = Array.from({ length: n }, (_, t) => !!forcedH[hourOf(t)]);
    const avg = mean(pinfo.prices);
    const wv = inp.wvMode === "manual" && inp.wv != null ? +inp.wv : avg;
    const plan = optimizeDay(p, pinfo.prices, { cota0, aportCmH: inflow, target, waterValue: wv, strict: !!inp.strict, blocked, forced, startOn: !!inp.startOn });
    return { p, date, plan, pinfo, inflow, upstream, avg, wv, cota0, cotaOrigin, aport, aportOrigin, target, blockedH, forcedH, riegoOn, inp };
  })();
  memo.set(k, promise);
  return promise;
}

// ---------- shell ----------
const sel = document.getElementById("plantSelect");
function fillPlants() {
  const s = db.get();
  sel.innerHTML = s.plants.map((p) => `<option value="${esc(p.id)}" ${p.id === s.activeId ? "selected" : ""}>${esc(p.name)}${p.pending ? " (datos de ejemplo)" : ""}</option>`).join("");
}
sel.onchange = () => {
  db.set({ activeId: sel.value });
  render();
};
function applyTheme() {
  const t = db.get().theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
document.getElementById("themeBtn").onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  db.set({ theme: dark ? "light" : "dark" });
  applyTheme();
  render();
};
document.getElementById("menuBtn").onclick = () => document.getElementById("app").classList.toggle("nav-open");
document.getElementById("scrim").onclick = () => document.getElementById("app").classList.remove("nav-open");

async function headerPills() {
  const has = db.get().prices[TOMORROW];
  const pill = document.getElementById("pillOmie");
  pill.querySelector("b").textContent = has ? "Cargado" : "Pendiente";
  pill.classList.toggle("warn", !has);
  const r = await pricesInfo(has ? TOMORROW : TODAY);
  document.querySelector("#pillAvg small").textContent = has ? "Media mañana" : "Media hoy" + (r.source === "excel" || r.source === "manual" || r.source === "auto" ? "" : " (estim.)");
  document.querySelector("#pillAvg b").textContent = `${num(mean(r.prices), 1)} €/MWh`;
}

const routes = { resumen: renderSummary, central: renderPlant, precios: renderPrices, diario: renderLog, centrales: renderConfig };
let cleanup = null;
function render() {
  const r = (location.hash.replace("#/", "") || "resumen").split("?")[0];
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
  if (cleanup) cleanup();
  cleanup = null;
  hideTip();
  view.innerHTML = "";
  document.getElementById("app").classList.remove("nav-open");
  (routes[r] || renderSummary)(view);
}

// selector de fecha común
function dateBar(onChange) {
  const opts = [
    [TODAY, "Hoy"],
    [TOMORROW, "Mañana"],
    [addDays(TODAY, 2), fmtDayShort(addDays(TODAY, 2))],
  ];
  return `<div class="period no-print"><div class="seg">${opts.map(([d, l]) => `<button data-d="${d}" class="${d === ui.date ? "on" : ""}">${l}</button>`).join("")}</div><input type="date" id="dateIn" value="${ui.date}" aria-label="Fecha" /></div>`;
}
function bindDateBar(root, onChange) {
  root.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => ((ui.date = b.dataset.d), onChange())));
  const di = root.querySelector("#dateIn");
  if (di) di.onchange = () => di.value && ((ui.date = di.value), onChange());
}
const SRC = { excel: "Excel OMIE", manual: "Precios a mano", auto: "OMIE (descarga automática)", estimado: "Precio ESTIMADO", ejemplo: "Precio de EJEMPLO" };
function priceBadge(pinfo) {
  const ok = ["excel", "manual", "auto"].includes(pinfo.source);
  if (ok) return `<div class="chips"><span class="src-badge ${pinfo.source}"><i></i>${SRC[pinfo.source]}${pinfo.file ? ` · ${esc(pinfo.file)}` : ""} · media ${num(mean(pinfo.prices), 2)} €/MWh</span></div>`;
  return `<div class="warn-box"><b>${SRC[pinfo.source]}</b> para el ${fmtDayLong(ui.date)}${pinfo.note ? ` (${esc(pinfo.note)})` : ""}. Carga el Excel de OMIE en <a href="#/precios">Precios</a> para el plan definitivo.</div>`;
}

// ---------- RESUMEN: todas las centrales ----------
function renderSummary(root) {
  const plants = db.get().plants;
  root.innerHTML = `
    <div class="view-head"><div><h1>Resumen del día · ${fmtDayLong(ui.date)}</h1><div class="sub">${plants.length} centrales · cambia los datos de partida y el plan se recalcula</div></div><div class="spacer"></div>${dateBar()}</div>
    <div id="src"></div>
    <div class="card mb"><div class="table-wrap"><table class="data sum">
      <thead><tr><th>Central</th><th>Cota inicio (m)</th><th>Aportación (cm/día)</th><th>Cota objetivo (m)</th><th>MWh</th><th>Ingreso</th><th>€/MWh</th><th>Horas</th><th>Cota final</th><th>Maniobras</th></tr></thead>
      <tbody id="rows"></tbody><tfoot id="foot"></tfoot></table></div>
      <p class="note">Los campos vacíos usan el valor sugerido (en gris): cota del diario o fin del plan anterior, y aportación media de los últimos días del diario. Escribe encima para cambiarlo; borra el número para volver al sugerido.</p>
    </div>
    <div class="card mb">
      <div class="card-head"><h2>Programa para W2M · todas las centrales</h2><span class="meta">Cuarto‑horario, MW</span></div>
      <div class="btn-row no-print">
        <button class="btn primary" id="csvAll">CSV por central</button>
        <button class="btn" id="csvGroups">CSV por grupo</button>
        <button class="btn" id="copyAll">Copiar para Excel</button>
        <button class="btn" id="sentAll">Marcar como enviado</button>
        <button class="btn" id="print">Imprimir</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Próximos días (orientativo)</h2><span class="meta">Con precios estimados si no están publicados</span></div>
      <p class="note">Encadena la cota final de cada día con el siguiente. Útil para ver la tendencia del embalse; el plan bueno es siempre el de D+1 con el Excel de OMIE.</p>
      <div class="btn-row no-print"><div class="seg" id="horizon"><button data-h="0" class="on">Ocultar</button><button data-h="3">3 días</button><button data-h="7">7 días</button><button data-h="14">14 días</button></div></div>
      <div id="fc" class="table-wrap" style="margin-top:10px"></div>
    </div>`;
  bindDateBar(root, () => renderSummary(root));

  const rowsEl = root.querySelector("#rows");
  rowsEl.innerHTML = plants
    .map(
      (p) => `<tr data-p="${p.id}"><td><a href="#/central" data-go="${p.id}"><b>${esc(p.name)}</b></a>${p.pending ? `<div class="muted" style="font-size:11px">datos de ejemplo</div>` : ""}${p.cascade?.from ? `<div class="muted" style="font-size:11px">recibe de ${esc(db.plant(p.cascade.from).name)}</div>` : ""}</td>
      <td><input class="cell-in" data-f="cota0" type="number" step="0.01" /></td>
      <td><input class="cell-in" data-f="aport" type="number" step="0.5" /></td>
      <td><input class="cell-in" data-f="target" type="number" step="0.01" /></td>
      <td data-o="mwh">…</td><td data-o="eur"></td><td data-o="cap"></td><td data-o="h"></td><td data-o="cf"></td><td data-o="ev" style="text-align:left;white-space:normal;min-width:180px"></td></tr>`
    )
    .join("");
  rowsEl.querySelectorAll("[data-go]").forEach((a) => (a.onclick = () => db.set({ activeId: a.dataset.go })));

  let results = [];
  const fillRow = (r) => {
    const tr = rowsEl.querySelector(`[data-p="${r.p.id}"]`);
    const set = (f, v, ph) => {
      const i = tr.querySelector(`[data-f="${f}"]`);
      if (document.activeElement !== i) i.value = v ?? "";
      i.placeholder = ph;
    };
    set("cota0", r.inp.cota0, cota(r.cota0));
    set("aport", r.inp.aport, num(r.aport, 1));
    set("target", r.inp.target, cota(r.target));
    tr.querySelector(`[data-f="cota0"]`).title = `Origen: ${r.cotaOrigin}`;
    tr.querySelector(`[data-f="aport"]`).title = `Origen: ${r.aportOrigin}`;
    const pl = r.plan;
    const o = (k, v) => (tr.querySelector(`[data-o="${k}"]`).innerHTML = v);
    o("mwh", num(pl.energy, 1));
    o("eur", eur(pl.revenue));
    o("cap", pl.captured ? num(pl.captured, 1) : "–");
    o("h", num(pl.hoursOn, 2));
    const warn = pl.spilledCm > 0.5 ? ` <span class="neg-txt" title="Vertido previsto">⚠ vierte ${num(pl.spilledCm, 0)} cm</span>` : pl.cotaEnd < r.target - 0.005 ? ` <span class="neg-txt" title="Por debajo del objetivo">⚠</span>` : "";
    o("cf", cota(pl.cotaEnd) + warn);
    o("ev", runsText(r.p, pl) || `<span class="muted">parada</span>`);
  };
  async function computeAll() {
    const pinfo = await pricesInfo(ui.date);
    root.querySelector("#src").innerHTML = priceBadge(pinfo);
    results = [];
    for (const p of plants) {
      const r = await computePlan(p, ui.date);
      results.push(r);
      fillRow(r);
    }
    const T = (f) => results.reduce((s, r) => s + f(r), 0);
    const E = T((r) => r.plan.energy);
    const R = T((r) => r.plan.revenue);
    root.querySelector("#foot").innerHTML = `<tr><th>Total</th><th></th><th></th><th></th><th>${num(E, 1)}</th><th>${eur(R)}</th><th>${E ? num(R / E, 1) : "–"}</th><th></th><th></th><th></th></tr>`;
  }
  let tm;
  rowsEl.addEventListener("input", (e) => {
    const i = e.target.closest("[data-f]");
    if (!i) return;
    const p = db.plant(i.closest("tr").dataset.p);
    clearTimeout(tm);
    tm = setTimeout(() => {
      setInputs(p, ui.date, { [i.dataset.f]: i.value === "" ? null : parseFloat(i.value) });
      computeAll();
    }, 400);
  });
  computeAll();

  root.querySelector("#csvAll").onclick = () => exportCsv(results, false);
  root.querySelector("#csvGroups").onclick = () => exportCsv(results, true);
  root.querySelector("#copyAll").onclick = () => copyTable(results);
  root.querySelector("#sentAll").onclick = () => {
    markSent(results);
    toast("Programa marcado como enviado. Sus horas se usarán como referencia en el diario.");
  };
  root.querySelector("#print").onclick = () => window.print();

  // previsión multi-día
  root.querySelectorAll("#horizon button").forEach((b) => (b.onclick = async () => {
    root.querySelectorAll("#horizon button").forEach((x) => x.classList.toggle("on", x === b));
    const h = +b.dataset.h;
    const fc = root.querySelector("#fc");
    if (!h) return (fc.innerHTML = "");
    fc.innerHTML = `<p class="muted">Calculando…</p>`;
    const days = Array.from({ length: h }, (_, i) => addDays(ui.date, i));
    const head = `<tr><th>Central</th>${days.map((d) => `<th>${fmtDayShort(d)}</th>`).join("")}</tr>`;
    const rows = [];
    const srcRow = [];
    for (const d of days) srcRow.push((await pricesInfo(d)).source);
    for (const p of plants) {
      const cells = [];
      for (const d of days) {
        const r = await computePlan(p, d);
        cells.push(`<td title="${num(r.plan.energy, 1)} MWh · ${eur(r.plan.revenue)}">${num(r.plan.energy, 0)} MWh<br><span class="muted">${cota(r.plan.cotaEnd)} m</span></td>`);
      }
      rows.push(`<tr><td><b>${esc(p.name)}</b></td>${cells.join("")}</tr>`);
    }
    fc.innerHTML = `<table class="data">${head}<tr><td class="muted">Precio</td>${srcRow.map((s) => `<td class="muted">${s === "excel" || s === "manual" || s === "auto" ? "real" : "estimado"}</td>`).join("")}</tr>${rows.join("")}</table>`;
  }));
}

function runsText(p, pl) {
  const parts = [];
  for (const g of p.groups || []) {
    let st = null;
    const runs = [];
    pl.gp.forEach((gp, t) => {
      const on = gp[g.id] > 0;
      if (on && st == null) st = t;
      if ((!on || t === pl.gp.length - 1) && st != null) {
        runs.push(`${fmtHM(st * pl.dt * 60)}–${fmtHM((on ? t + 1 : t) * pl.dt * 60)}`);
        st = null;
      }
    });
    if (runs.length) parts.push(`<b>${esc(g.id)}</b> ${runs.join(", ")}`);
  }
  return parts.join("<br>");
}

const csvN = (v, d = 3) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace(".", ",");
function exportCsv(results, byGroup) {
  if (!results.length) return;
  const n = results[0].plan.p.length;
  const dt = results[0].plan.dt;
  const cols = [];
  for (const r of results)
    if (byGroup) for (const g of r.p.groups) cols.push({ h: `${r.p.name} ${g.name} (MW)`, v: (t) => r.plan.gp[t][g.id] || 0 });
    else cols.push({ h: `${r.p.name} (MW)`, v: (t) => r.plan.p[t] });
  const lines = Array.from({ length: n }, (_, t) => [ui.date, t + 1, fmtHM(t * dt * 60), fmtHM((t + 1) * dt * 60), ...cols.map((c) => csvN(c.v(t)))].join(";"));
  downloadFile(`programa_${ui.date}${byGroup ? "_grupos" : ""}.csv`, "﻿Fecha;Periodo;Inicio;Fin;" + cols.map((c) => c.h).join(";") + "\n" + lines.join("\n"));
}
async function copyTable(results) {
  const n = results[0]?.plan.p.length || 0;
  const dt = results[0]?.plan.dt || 0.25;
  const txt = ["Periodo\tInicio\t" + results.map((r) => r.p.name).join("\t"), ...Array.from({ length: n }, (_, t) => `${t + 1}\t${fmtHM(t * dt * 60)}\t` + results.map((r) => csvN(r.plan.p[t])).join("\t"))].join("\n");
  try {
    await navigator.clipboard.writeText(txt);
    toast("Copiado: pégalo en Excel.");
  } catch {
    toast("No se pudo copiar; usa el CSV.");
  }
}
function markSent(results) {
  const sent = { ...db.get().sent };
  for (const r of results) {
    const hours = {};
    for (const g of r.p.groups) hours[g.id] = r.plan.gp.filter((x) => x[g.id] > 0).length * r.plan.dt;
    sent[ikey(r.p, r.date)] = { energy: r.plan.energy, revenue: r.plan.revenue, cotaEnd: r.plan.cotaEnd, hours, ts: Date.now() };
  }
  db.set({ sent });
}

// ---------- CENTRAL: detalle ----------
function hourGrid(id, vals, label) {
  return `<div class="mini-title" style="margin-top:12px">${label}</div><div class="hours" id="${id}">${Array.from({ length: 24 }, (_, h) => `<label><input type="checkbox" data-h="${h}" ${vals[h] ? "checked" : ""}/>${String(h).padStart(2, "0")}h</label>`).join("")}</div>`;
}
async function renderPlant(root) {
  const p = db.plant();
  const r0 = await computePlan(p, ui.date);
  const t = totals(p);
  root.innerHTML = `
    <div class="view-head"><div><h1>${esc(p.name)} · ${fmtDayLong(ui.date)}</h1><div class="sub">${p.groups.length} grupo(s) · ${num(t.pmax, 2)} MW · cota ${cota(p.cotaMin)}–${cota(p.cotaMax)} m${p.cascade?.from ? ` · recibe de ${esc(db.plant(p.cascade.from).name)} con ${p.cascade.delayMin} min de retraso` : ""}</div></div><div class="spacer"></div>${dateBar()}</div>
    ${p.pending ? `<div class="warn-box">Esta central tiene <b>datos de ejemplo</b>. Complétalos en <a href="#/centrales">Centrales</a> para que el plan sea fiable.</div>` : ""}
    <div id="src"></div>
    <div class="card mb no-print" id="form">
      <div class="card-head"><h2>Datos de partida</h2><span class="meta">Vacío = valor sugerido</span></div>
      <div class="inputs">
        <label class="field">Cota al inicio del día (m)<input type="number" step="0.01" data-f="cota0" value="${r0.inp.cota0 ?? ""}" placeholder="${cota(r0.cota0)}" /><small>Sugerida: ${esc(r0.cotaOrigin)}</small></label>
        <label class="field">Aportación natural (cm/día)<input type="number" step="0.5" data-f="aport" value="${r0.inp.aport ?? ""}" placeholder="${num(r0.aport, 1)}" /><small>Lo que subiría la cota sin turbinar. Sugerida: ${esc(r0.aportOrigin)}</small></label>
        <label class="field">Cota objetivo al final (m)<input type="number" step="0.01" data-f="target" value="${r0.inp.target ?? ""}" placeholder="${cota(r0.target)}" /><small>Por defecto, acabar como empiezas</small></label>
        <label class="field">Valor del agua<select data-f="wvMode"><option value="auto" ${r0.inp.wvMode !== "manual" ? "selected" : ""}>Precio medio del día</option><option value="manual" ${r0.inp.wvMode === "manual" ? "selected" : ""}>Fijo (€/MWh)</option></select></label>
        <label class="field" id="wvWrap" style="${r0.inp.wvMode === "manual" ? "" : "display:none"}">€/MWh<input type="number" step="1" data-f="wv" value="${r0.inp.wv ?? Math.round(r0.avg)}" /><small>Súbelo si esperas mejores precios los próximos días</small></label>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <label class="toggle"><input type="checkbox" data-f="strict" ${r0.inp.strict ? "checked" : ""}/> Cota objetivo obligatoria</label>
        <label class="toggle"><input type="checkbox" data-f="startOn" ${r0.inp.startOn ? "checked" : ""}/> Empieza el día en marcha</label>
      </div>
      ${hourGrid("blocked", r0.blockedH, "Horas sin turbinar (mantenimiento, limitación…)")}
      ${hourGrid("forced", r0.forcedH, `Horas obligatorias de turbinado${r0.riegoOn ? " · riego en temporada" : ""}`)}
    </div>
    <div class="grid kpis" id="kpis"></div>
    <div class="grid two mb">
      <div class="card"><div class="card-head"><h2>Precio y programa</h2><span class="meta" id="meta"></span></div>
        <div class="mini-title">Precio (€/MWh)</div><div id="chPrice"></div>
        <div class="mini-title">Potencia por grupo (MW)</div><div id="chP"></div>
        ${legend(p.groups.map((g, i) => ({ label: g.name, color: GCOL[i % 4] })))}
      </div>
      <div class="card"><div class="card-head"><h2>Cota del embalse</h2><span class="meta">m s.n.m.</span></div><div id="chC"></div>
        <div class="mini-title" style="margin-top:12px">Hoja de maniobras</div><div id="man"></div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Programa cuarto‑horario</h2><span class="meta">Resumen por horas</span></div>
      <div class="btn-row no-print" style="margin-bottom:10px"><button class="btn primary" id="csv">CSV para W2M</button><button class="btn" id="csvG">CSV por grupo</button><button class="btn" id="sent">Marcar como enviado</button><button class="btn" id="print">Imprimir</button></div>
      <div class="table-wrap" id="tbl"></div>
    </div>`;
  bindDateBar(root, () => renderPlant(root));
  const form = root.querySelector("#form");
  let tm;
  const onChange = (e) => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      const f = e.target.dataset.f;
      if (f) {
        const v = e.target.type === "checkbox" ? e.target.checked : e.target.tagName === "SELECT" ? e.target.value : e.target.value === "" ? null : parseFloat(e.target.value);
        setInputs(p, ui.date, { [f]: v });
        if (f === "wvMode") root.querySelector("#wvWrap").style.display = v === "manual" ? "" : "none";
      } else if (e.target.dataset.h != null) {
        const grid = e.target.closest(".hours").id;
        setInputs(p, ui.date, { [grid]: [...root.querySelectorAll(`#${grid} [data-h]`)].map((c) => c.checked) });
      }
      draw();
    }, 350);
  };
  form.addEventListener("input", onChange);
  form.addEventListener("change", onChange);

  let res;
  async function draw() {
    res = await computePlan(p, ui.date);
    const { plan, pinfo, avg, wv } = res;
    root.querySelector("#src").innerHTML = priceBadge(pinfo);
    form.querySelectorAll("[data-f]").forEach((i) => {
      if (i.dataset.f === "cota0") i.placeholder = cota(res.cota0);
      if (i.dataset.f === "aport") i.placeholder = num(res.aport, 1);
      if (i.dataset.f === "target") i.placeholder = cota(res.target);
    });
    const dc = (plan.cotaEnd - res.cota0) * 100;
    root.querySelector("#kpis").innerHTML = [
      kpi("Ingreso previsto", eur(plan.revenue), `${num(plan.energy, 1)} MWh`, "accent"),
      kpi("Precio capturado", plan.captured ? `${num(plan.captured, 1)}<small>€/MWh</small>` : "–", `Media del día ${num(avg, 1)} €/MWh`),
      kpi("Horas de turbinado", num(plan.hoursOn, 2), `${plan.starts} arranque(s) · máx. ${p.maxStarts}`),
      kpi("Cota final", `${cota(plan.cotaEnd)}<small>m</small>`, `${cmFmt(dc)} en el día · objetivo ${cota(res.target)} · ${num((+p.cotaMax - Math.max(...plan.cota)) * 100, 0)} cm hasta la máxima`, plan.cotaEnd < res.target - 0.005 ? "neg" : ""),
      kpi("Vertido previsto", plan.spilledCm > 0.5 ? `${num(plan.spilledCm, 0)}<small>cm</small>` : "No", plan.spilledCm > 0.5 ? "La cota llega al máximo: turbinar más" : "Cota por debajo del máximo", plan.spilledCm > 0.5 ? "neg" : ""),
    ].join("");
    root.querySelector("#meta").textContent = res.upstream ? `Incluye agua de ${res.upstream.name}` : "";
    const n = plan.p.length;
    const x = Array.from({ length: n }, (_, t) => fmtHM(t * plan.dt * 60));
    const tip = (t) => `${fmtHM(t * plan.dt * 60)}–${fmtHM((t + 1) * plan.dt * 60)}`;
    xyChart(root.querySelector("#chPrice"), { x, tipTitle: tip, zoom: true, xLabelWidth: 56, series: [{ name: "Precio", values: pinfo.prices, color: C.s1, step: true, markers: false, fmt: (v) => num(v, 2) + " €/MWh" }], refLines: [{ value: wv, label: `Valor agua ${num(wv, 0)}` }], height: 150 });
    xyChart(root.querySelector("#chP"), {
      x,
      tipTitle: tip,
      zoom: true,
      xLabelWidth: 56,
      series: p.groups.map((g, i) => ({ name: g.name, values: plan.gp.map((gp) => gp[g.id] || 0), color: GCOL[i % 4], step: true, markers: false, fmt: (v) => num(v, 2) + " MW" })),
      tipExtra: (t) => tipRow("", "Total", num(plan.p[t], 2) + " MW") + tipRow("", "Ingreso", eur(plan.rev[t])) + (res.blockedH[Math.floor(t / (n / 24))] ? `<div class="tip-note">Hora bloqueada</div>` : "") + (res.forcedH[Math.floor(t / (n / 24))] ? `<div class="tip-note">Hora obligatoria</div>` : ""),
      y: { min: 0, max: Math.max(t.pmax * 1.05, 0.1), fmt: (v) => num(v, t.pmax < 5 ? 1 : 0) },
      height: 170,
    });
    xyChart(root.querySelector("#chC"), {
      x: [...x, "24:00"],
      zoom: true,
      xLabelWidth: 56,
      series: [{ name: "Cota", values: plan.cota, color: C.brand, markers: false, fmt: (v) => num(v, 2) + " m" }],
      tipExtra: (t) => (t < n ? tipRow("", "Entrada", num(res.inflow[t], 2) + " cm/h") : ""),
      y: (() => {
        const lo = Math.min(...plan.cota, res.target);
        const hi = Math.max(...plan.cota, res.target);
        const pad = Math.max(0.15, (hi - lo) * 0.25);
        return { min: Math.max(+p.cotaMin - 0.05, lo - pad), max: Math.min(+p.cotaMax + 0.05, hi + pad), fmt: (v) => num(v, 2), zero: false };
      })(),
      refLines: [{ value: +p.cotaMax, label: "Máxima" }, { value: +p.cotaMin, label: "Mínima" }, { value: res.target, label: "Objetivo" }],
      height: 230,
    });
    root.querySelector("#man").innerHTML = plan.events.length
      ? `<table class="data"><thead><tr><th>Dar orden</th><th>Grupo</th><th>Maniobra</th><th>Efectivo</th></tr></thead><tbody>${plan.events.map((e) => `<tr><td><b>${fmtHM(((e.order % 1440) + 1440) % 1440)}${e.order < 0 ? " (día anterior)" : ""}</b></td><td>${esc(e.group)}</td><td style="text-align:left">${e.kind}${e.mw ? ` a ${num(e.mw, 2)} MW` : ""}</td><td>${fmtHM(e.t)}</td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">Sin maniobras: la central no turbina este día.</p>`;
    const perH = n / 24;
    const rows = [];
    for (let h = 0; h < 24; h++) {
      const idx = Array.from({ length: Math.round(perH) }, (_, j) => h * Math.round(perH) + j).filter((q) => q < n);
      const mwh = idx.reduce((s, q) => s + plan.p[q] * plan.dt, 0);
      rows.push(`<tr class="${mwh > 0 ? "row-hl" : ""}"><td>${String(h).padStart(2, "0")}:00</td><td>${num(mean(idx.map((q) => pinfo.prices[q])), 2)}</td>${p.groups.map((g) => `<td>${num(mean(idx.map((q) => plan.gp[q][g.id] || 0)), 2)}</td>`).join("")}<td>${num(mwh, 2)}</td><td>${eur(idx.reduce((s, q) => s + plan.rev[q], 0))}</td><td>${cota(plan.cota[idx[idx.length - 1] + 1])}</td></tr>`);
    }
    root.querySelector("#tbl").innerHTML = `<table class="data"><thead><tr><th>Hora</th><th>€/MWh</th>${p.groups.map((g) => `<th>${esc(g.name)} MW</th>`).join("")}<th>MWh</th><th>Ingreso</th><th>Cota fin</th></tr></thead><tbody>${rows.join("")}</tbody><tfoot><tr><th>Total</th><th>${num(avg, 2)}</th>${p.groups.map(() => "<th></th>").join("")}<th>${num(plan.energy, 2)}</th><th>${eur(plan.revenue)}</th><th>${cota(plan.cotaEnd)}</th></tr></tfoot></table>`;
  }
  root.querySelector("#csv").onclick = () => exportCsv([res], false);
  root.querySelector("#csvG").onclick = () => exportCsv([res], true);
  root.querySelector("#sent").onclick = () => (markSent([res]), toast("Marcado como enviado."));
  root.querySelector("#print").onclick = () => window.print();
  draw();
}
function kpi(label, value, sub, cls = "") {
  return `<div class="card kpi ${cls}"><div class="k-label">${esc(label)}</div><div class="k-val">${value}</div><div class="k-sub" style="text-transform:none;letter-spacing:0;font-size:11.5px">${esc(sub)}</div></div>`;
}

// ---------- PRECIOS ----------
function renderPrices(root) {
  const draw = async () => {
    const prices = db.get().prices;
    const days = Object.keys(prices).sort().reverse();
    root.innerHTML = `
      <div class="view-head"><div><h1>Precios OMIE</h1><div class="sub">${days.length} día(s) cargados en este ordenador</div></div></div>
      <div class="card mb">
        <div class="card-head"><h2>Cargar Excel de OMIE</h2><span class="meta">Archivo "Precio del mercado diario" (.XLS)</span></div>
        <label class="drop" id="drop"><input type="file" id="file" accept=".xls,.xlsx,.csv" multiple hidden /><b>Arrastra aquí el Excel</b> o pulsa para elegirlo<br><span class="muted">Puedes subir varios a la vez. La fecha se lee del nombre del archivo.</span></label>
        <div id="msg" class="note"></div>
      </div>
      <div class="grid two mb">
        <div class="card"><div class="card-head"><h2>Precio cuarto‑horario</h2><span class="meta" id="selDay"></span></div><div id="ch"></div></div>
        <div class="card"><div class="card-head"><h2>Días cargados</h2></div><div class="table-wrap"><table class="data"><thead><tr><th>Fecha</th><th>Media</th><th>Mín.</th><th>Máx.</th><th>Origen</th><th></th></tr></thead><tbody>${
          days.map((d) => {
            const v = prices[d].es;
            return `<tr data-row="${d}" style="cursor:pointer"><td><b>${fmtDayLong(d)}</b></td><td>${num(mean(v), 2)}</td><td>${num(Math.min(...v), 2)}</td><td>${num(Math.max(...v), 2)}</td><td style="text-align:left">${SRC[prices[d].source] || prices[d].source}</td><td><button class="btn small" data-del="${d}">Borrar</button></td></tr>`;
          }).join("") || `<tr><td colspan="6" class="muted">Aún no hay precios cargados.</td></tr>`
        }</tbody></table></div></div>
      </div>
      <div class="card"><div class="card-head"><h2>Pegar precios a mano</h2><span class="meta">Si no tienes el Excel</span></div>
        <div class="inputs"><label class="field">Fecha<input type="date" id="mDate" value="${TOMORROW}" /></label></div>
        <label class="field" style="margin-top:10px">24 o 96 precios, uno por línea<textarea id="mText" rows="5"></textarea></label>
        <div class="btn-row" style="margin-top:10px"><button class="btn" id="mSave">Guardar</button></div></div>`;
    const msg = root.querySelector("#msg");
    const handle = async (files) => {
      const out = [];
      for (const f of files) {
        try {
          let date = dateFromName(f.name);
          const { es } = await parseOmieExcel(f);
          if (!date) date = prompt(`No encuentro la fecha en "${f.name}". Escríbela (AAAA-MM-DD):`, TOMORROW);
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("fecha no válida");
          storePrices(date, es, "excel", f.name);
          out.push(`✔ ${fmtDayLong(date)}: ${es.length} precios, media ${num(mean(es), 2)} €/MWh`);
        } catch (e) {
          out.push(`✖ ${esc(f.name)}: ${esc(e.message)}`);
        }
      }
      memo.clear();
      headerPills();
      await draw();
      root.querySelector("#msg").innerHTML = out.join("<br>");
    };
    const drop = root.querySelector("#drop");
    root.querySelector("#file").onchange = (e) => handle([...e.target.files]);
    drop.ondragover = (e) => (e.preventDefault(), drop.classList.add("over"));
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      handle([...e.dataTransfer.files]);
    };
    void msg;
    const showDay = (d) => {
      if (!d) return;
      const v = prices[d].es;
      root.querySelector("#selDay").textContent = fmtDayLong(d);
      xyChart(root.querySelector("#ch"), { x: v.map((_, t) => fmtHM((t * 1440) / v.length)), zoom: true, xLabelWidth: 56, series: [{ name: "Precio España", values: v, color: C.s1, step: true, markers: false, fmt: (x) => num(x, 2) + " €/MWh" }], height: 240 });
    };
    showDay(days[0]);
    root.querySelectorAll("[data-row]").forEach((tr) => (tr.onclick = (e) => !e.target.closest("[data-del]") && showDay(tr.dataset.row)));
    root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
      const pr = { ...db.get().prices };
      delete pr[b.dataset.del];
      db.set({ prices: pr });
      headerPills();
      draw();
    }));
    root.querySelector("#mSave").onclick = () => {
      const d = root.querySelector("#mDate").value;
      const v = parseManual(root.querySelector("#mText").value);
      if (!d || !v) return toast("Necesito una fecha y 24 o 96 precios.");
      storePrices(d, v, "manual");
      headerPills();
      draw();
    };
  };
  draw();
}

// ---------- DIARIO de cotas ----------
function renderLog(root) {
  const p = db.plant();
  const days = Array.from({ length: 15 }, (_, i) => addDays(TODAY, -14 + i));
  const draw = () => {
    const log = logOf(p);
    const obs = Object.fromEntries(observedSeries(p, addDays(TODAY, 1), 15).map((o) => [o.d, o.v]));
    const sug = suggestedAport(p, TOMORROW);
    root.innerHTML = `
      <div class="view-head"><div><h1>Diario · ${esc(p.name)}</h1><div class="sub">Cota de cada mañana y horas de cada grupo. Con esto se calcula la aportación real.</div></div></div>
      <div class="grid kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        ${kpi("Aportación sugerida", sug ? `${num(sug.value, 1)}<small>cm/día</small>` : "–", sug ? `Media de los últimos ${sug.n} días con datos` : "Faltan dos cotas seguidas", "accent")}
        ${kpi("Última cota", (() => { const k = days.slice().reverse().find((d) => log[d]?.cota != null && log[d].cota !== ""); return k ? `${cota(+log[k].cota)}<small>m</small>` : "–"; })(), "Registrada en el diario")}
      </div>
      <div class="card">
        <div class="table-wrap"><table class="data"><thead><tr><th>Día</th><th>Cota mañana (m)</th>${p.groups.map((g) => `<th>Horas ${esc(g.name)}</th>`).join("")}<th>Aportación (cm/día)</th><th>Nota</th></tr></thead><tbody>${days
          .slice()
          .reverse()
          .map((d) => {
            const e = log[d] || {};
            const sent = db.get().sent[ikey(p, d)];
            return `<tr data-d="${d}"><td><b>${fmtDayShort(d)}</b>${d === TODAY ? " (hoy)" : ""}</td><td><input class="cell-in" data-f="cota" type="number" step="0.01" value="${e.cota ?? ""}" /></td>${p.groups.map((g) => `<td><input class="cell-in" data-g="${g.id}" type="number" step="0.25" min="0" max="24" value="${e.hours?.[g.id] ?? ""}" placeholder="${sent?.hours?.[g.id] != null ? num(sent.hours[g.id], 2) : ""}" /></td>`).join("")}<td>${obs[d] != null ? cmFmt(obs[d]) : `<span class="muted">–</span>`}</td><td><input class="cell-in" data-f="nota" type="text" value="${esc(e.nota || "")}" style="min-width:140px;text-align:left" /></td></tr>`;
          })
          .join("")}</tbody></table></div>
        <p class="note">La aportación de un día = subida de cota hasta la mañana siguiente + lo que bajaron los grupos (horas × cm/h de cada grupo)${p.cascade?.from ? ` − lo que aportó ${esc(db.plant(p.cascade.from).name)} (según su diario)` : ""}. Si la ves rara, revisa los cm/h de los grupos en Centrales. En gris, las horas del programa marcado como enviado.</p>
      </div>`;
    let tm;
    root.querySelector("tbody").addEventListener("input", (e) => {
      const tr = e.target.closest("tr");
      const d = tr.dataset.d;
      clearTimeout(tm);
      tm = setTimeout(() => {
        if (e.target.dataset.g) {
          const hours = { ...(logOf(p)[d]?.hours || {}) };
          hours[e.target.dataset.g] = e.target.value === "" ? null : parseFloat(e.target.value);
          db.setLog(p.id, d, { hours });
        } else if (e.target.dataset.f === "cota") db.setLog(p.id, d, { cota: e.target.value === "" ? null : parseFloat(e.target.value) });
        else db.setLog(p.id, d, { nota: e.target.value });
        const focusSel = `[data-d="${d}"] [${e.target.dataset.g ? `data-g="${e.target.dataset.g}"` : `data-f="${e.target.dataset.f}"`}]`;
        draw();
        const el = root.querySelector(focusSel);
        if (el) {
          el.focus();
          if (el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 600);
    });
  };
  draw();
}

// ---------- CENTRALES (configuración) ----------
function renderConfig(root) {
  const draw = () => {
    const p = db.plant();
    const others = db.get().plants.filter((x) => x.id !== p.id);
    const r = p.riego || { on: false, from: "06-01", to: "09-15", hours: new Array(24).fill(false) };
    root.innerHTML = `
      <div class="view-head"><div><h1>Centrales · ${esc(p.name)}</h1><div class="sub">Cambia de central en el selector de la izquierda.</div></div></div>
      <div class="card mb"><div class="card-head"><h2>Embalse</h2></div>
        <div class="inputs">
          <label class="field">Nombre<input id="name" value="${esc(p.name)}" /></label>
          <label class="field">Cota mínima de explotación (m)<input id="cmin" type="number" step="0.01" value="${p.cotaMin}" /></label>
          <label class="field">Cota máxima normal (m)<input id="cmax" type="number" step="0.01" value="${p.cotaMax}" /><small>Por encima se vierte</small></label>
          <label class="field">Arranques máximos al día<input id="starts" type="number" step="1" min="1" value="${p.maxStarts}" /></label>
          <label class="field">Evitar marchas de menos de (min)<input id="minRun" type="number" step="15" min="0" value="${p.minRunMin ?? 30}" /><small>0 = sin penalizar arranques</small></label>
        </div></div>
      <div class="card mb"><div class="card-head"><h2>Grupos</h2><span class="meta">cm/h = cuánto baja la cota con el grupo a plena carga</span></div>
        <div class="table-wrap"><table class="data cfg"><thead><tr><th>Nombre</th><th>P máx (MW)</th><th>Funcionamiento</th><th>P mín (MW)</th><th>Baja cota (cm/h)</th><th>Necesita</th><th>Arranque (min)</th><th></th></tr></thead><tbody>${p.groups
          .map(
            (g, i) => `<tr data-i="${i}"><td><input class="cell-in" data-k="name" value="${esc(g.name)}" style="text-align:left;min-width:90px"/></td><td><input class="cell-in" data-k="pmax" type="number" step="0.01" value="${g.pmax}"/></td><td><select class="cell-in" data-k="mode"><option value="fijo" ${g.mode !== "regulable" ? "selected" : ""}>Todo/nada</option><option value="regulable" ${g.mode === "regulable" ? "selected" : ""}>Regulable</option></select></td><td><input class="cell-in" data-k="pmin" type="number" step="0.01" value="${g.pmin || 0}" ${g.mode === "regulable" ? "" : "disabled"}/></td><td><input class="cell-in" data-k="cmh" type="number" step="0.1" value="${g.cmh}"/></td><td><select class="cell-in" data-k="requires"><option value="">Puede ir solo</option>${p.groups.filter((x) => x.id !== g.id).map((x) => `<option value="${x.id}" ${g.requires === x.id ? "selected" : ""}>Necesita ${esc(x.name)}</option>`).join("")}</select></td><td><input class="cell-in" data-k="startMin" type="number" step="5" value="${g.startMin || 0}"/></td><td><button class="btn small" data-delg="${i}" ${p.groups.length <= 1 ? "disabled" : ""}>Quitar</button></td></tr>`
          )
          .join("")}</tbody></table></div>
        <div class="btn-row" style="margin-top:10px"><button class="btn small" id="addG">Añadir grupo</button></div>
        <details class="tbl" style="margin-top:12px"><summary>Calcular los cm/h de un grupo a partir de una observación del SCADA</summary>
          <div class="inputs" style="margin-top:10px">
            <label class="field">Grupo<select id="calG">${p.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></label>
            <label class="field">Cota al empezar (m)<input id="calA" type="number" step="0.01"/></label>
            <label class="field">Cota al terminar (m)<input id="calB" type="number" step="0.01"/></label>
            <label class="field">Horas a plena carga<input id="calH" type="number" step="0.25"/></label>
            <label class="field">Aportación natural (cm/día)<input id="calN" type="number" step="0.5" value="${Math.round((suggestedAport(p, TOMORROW)?.value || 0) * 10) / 10}"/><small>Del diario; 0 si no lo sabes</small></label>
          </div>
          <div class="btn-row" style="margin-top:8px"><button class="btn small" id="calc">Calcular</button><span id="calR" class="note"></span></div>
        </details>
      </div>
      <div class="grid two mb">
        <div class="card"><div class="card-head"><h2>Cascada</h2></div>
          <div class="inputs">
            <label class="field">Recibe el agua turbinada de<select id="cFrom"><option value="">Ninguna</option>${others.map((x) => `<option value="${x.id}" ${p.cascade?.from === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
            <label class="field">Tiempo que tarda en llegar (min)<input id="cDelay" type="number" step="5" value="${p.cascade?.delayMin ?? 90}"/></label>
            <label class="field">Cuánto sube esta cota con la de arriba a plena carga (cm/h)<input id="cCm" type="number" step="0.1" value="${p.cascade?.cmhFull ?? 0}"/></label>
          </div>
          <p class="note">La aportación propia (por ejemplo, la de invierno) se mete aparte cada día como aportación natural.</p></div>
        <div class="card"><div class="card-head"><h2>Riego</h2></div>
          <label class="toggle"><input type="checkbox" id="rOn" ${r.on ? "checked" : ""}/> Hay horas obligatorias de suministro</label>
          <div class="inputs" style="margin-top:8px">
            <label class="field">Desde (MM-DD)<input id="rFrom" value="${r.from}" pattern="\\d{2}-\\d{2}"/></label>
            <label class="field">Hasta (MM-DD)<input id="rTo" value="${r.to}" pattern="\\d{2}-\\d{2}"/></label>
          </div>
          ${hourGrid("rHours", r.hours || [], "Horas en que hay que turbinar")}
        </div>
      </div>
      <div class="btn-row mb"><button class="btn primary" id="save">Guardar central</button><button class="btn" id="addP">Nueva central</button><button class="btn danger" id="delP" ${db.get().plants.length <= 1 ? "disabled" : ""}>Eliminar central</button></div>
      <div class="card"><div class="card-head"><h2>Compartir y copias</h2><span class="meta">${{ team: "Configuración común", local: "Cambios en este ordenador", default: "Datos de ejemplo" }[db.get().plantsSource] || ""}</span></div>
        <p class="note">Todo se guarda en este navegador. Para pasárselo a un compañero: exporta y que él lo importe. <b>centrales.json</b> solo lleva las centrales; la <b>copia completa</b> lleva también precios, diario y planes.</p>
        <div class="btn-row">
          <button class="btn" id="expT">Exportar centrales.json</button>
          <button class="btn" id="expAll">Exportar copia completa</button>
          <label class="btn">Importar archivo<input type="file" id="imp" accept=".json" hidden /></label>
          <button class="btn danger" id="reset">Borrar todo</button>
        </div></div>`;
    const $ = (q) => root.querySelector(q);
    // recoger grupos editados
    const readGroups = () =>
      [...root.querySelectorAll(".cfg tbody tr")].map((tr) => {
        const g = { ...p.groups[+tr.dataset.i] };
        tr.querySelectorAll("[data-k]").forEach((i) => {
          const k = i.dataset.k;
          g[k] = ["pmax", "pmin", "cmh", "startMin"].includes(k) ? parseFloat(i.value) || 0 : i.value || null;
        });
        if (g.mode !== "regulable") g.pmin = 0;
        return g;
      });
    root.querySelectorAll('.cfg [data-k="mode"]').forEach((s) => (s.onchange = () => (s.closest("tr").querySelector('[data-k="pmin"]').disabled = s.value !== "regulable")));
    $("#addG").onclick = () => {
      const gs = readGroups();
      let k = gs.length + 1;
      while (gs.some((g) => g.id === "G" + k)) k++;
      gs.push({ id: "G" + k, name: "Grupo " + k, pmax: gs[0]?.pmax || 1, pmin: 0, mode: "fijo", cmh: gs[0]?.cmh || 1, requires: null, startMin: 0 });
      db.updatePlant(p.id, { groups: gs });
      draw();
    };
    root.querySelectorAll("[data-delg]").forEach((b) => (b.onclick = () => {
      const gs = readGroups();
      const gone = gs.splice(+b.dataset.delg, 1)[0];
      gs.forEach((g) => g.requires === gone.id && (g.requires = null));
      db.updatePlant(p.id, { groups: gs });
      draw();
    }));
    $("#calc").onclick = () => {
      const a = parseFloat($("#calA").value);
      const b2 = parseFloat($("#calB").value);
      const h = parseFloat($("#calH").value);
      const nat = parseFloat($("#calN").value) || 0;
      if (![a, b2, h].every(Number.isFinite) || h <= 0) return ($("#calR").textContent = "Rellena cotas y horas.");
      const cmh = ((a - b2) * 100 + (nat / 24) * h) / h;
      $("#calR").innerHTML = `Resultado: <b>${num(cmh, 2)} cm/h</b> <button class="btn small" id="calUse">Usar este valor</button>`;
      $("#calUse").onclick = () => {
        const gs = readGroups();
        const g = gs.find((x) => x.id === $("#calG").value);
        g.cmh = Math.round(cmh * 100) / 100;
        db.updatePlant(p.id, { groups: gs });
        toast(`${g.name}: ${num(g.cmh, 2)} cm/h guardado.`);
        draw();
      };
    };
    $("#save").onclick = () => {
      const groups = readGroups();
      const cmin = parseFloat($("#cmin").value);
      const cmax = parseFloat($("#cmax").value);
      if (!(cmax > cmin)) return toast("La cota máxima debe ser mayor que la mínima.");
      if (groups.some((g) => !(g.pmax > 0) || !(g.cmh > 0))) return toast("Cada grupo necesita potencia y cm/h mayores que 0.");
      if (groups.some((g) => g.mode === "regulable" && !(g.pmin > 0 && g.pmin < g.pmax))) return toast("En grupos regulables, P mín debe estar entre 0 y P máx.");
      const from = $("#cFrom").value;
      const rFrom = $("#rFrom").value.trim();
      const rTo = $("#rTo").value.trim();
      if ($("#rOn").checked && !(/^\d{2}-\d{2}$/.test(rFrom) && /^\d{2}-\d{2}$/.test(rTo))) return toast("Fechas de riego en formato MM-DD (por ejemplo 06-01).");
      db.updatePlant(p.id, {
        name: $("#name").value.trim() || p.name,
        cotaMin: cmin,
        cotaMax: cmax,
        maxStarts: Math.max(1, parseInt($("#starts").value) || 1),
        minRunMin: Math.max(0, parseInt($("#minRun").value) || 0),
        groups,
        cascade: from ? { from, delayMin: parseFloat($("#cDelay").value) || 0, cmhFull: parseFloat($("#cCm").value) || 0 } : null,
        riego: { on: $("#rOn").checked, from: rFrom, to: rTo, hours: [...root.querySelectorAll("#rHours [data-h]")].map((c) => c.checked) },
        pending: false,
      });
      toast("Central guardada.");
      draw();
    };
    $("#addP").onclick = () => {
      const np = { ...structuredClone(p), id: "c" + Date.now().toString(36), name: "Nueva central", cascade: null, pending: true };
      db.set({ plants: [...db.get().plants, np], activeId: np.id, plantsSource: "local" });
      draw();
    };
    $("#delP").onclick = () => {
      if (!confirm(`¿Eliminar ${p.name}?`)) return;
      const rest = db.get().plants.filter((x) => x.id !== p.id).map((x) => (x.cascade?.from === p.id ? { ...x, cascade: null } : x));
      db.set({ plants: rest, activeId: rest[0].id, plantsSource: "local" });
      draw();
    };
    $("#expT").onclick = () => downloadFile("centrales.json", JSON.stringify({ actualizado: TODAY, centrales: db.get().plants }, null, 2), "application/json");
    $("#expAll").onclick = () => downloadFile(`plan-hidraulico-copia-${TODAY}.json`, JSON.stringify({ tipo: "copia-completa", ...db.get() }, null, 2), "application/json");
    $("#imp").onchange = async (e) => {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        if (j.tipo === "copia-completa" && Array.isArray(j.plants)) {
          if (!confirm("Esto sustituye todo lo de este ordenador por la copia. ¿Continuar?")) return;
          const { tipo, ...rest } = j;
          void tipo;
          db.replace(rest);
        } else if (Array.isArray(j.centrales) && j.centrales.length) db.set({ plants: j.centrales, plantsSource: "team", activeId: j.centrales[0].id });
        else throw new Error();
        toast("Importado.");
        fillPlants();
        draw();
      } catch {
        toast("Archivo no válido.");
      }
    };
    $("#reset").onclick = () => {
      if (!confirm("Se borrará todo lo guardado en este ordenador. ¿Continuar?")) return;
      db.reset();
      draw();
    };
  };
  draw();
}

// ---------- arranque ----------
window.addEventListener("hashchange", render);
db.on(fillPlants);
applyTheme();
fillPlants();
render();
headerPills();
loadTeamPlants().then((ok) => ok && render());
