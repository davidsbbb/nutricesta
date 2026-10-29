import { db, omieIndex, pricesFor, parseManual } from "./data.js";
import { optimizeDay, flatPlan, plantDerived, powerOf } from "./hydro.js";
import { xyChart, legend, tipRow, hideTip } from "./charts.js";
import { num, eur, pct, esc, addDays, todayKey, fmtDayLong, fmtDayShort, fmtHM, downloadFile, mean, clamp } from "./util.js";

const C = { brand: "var(--brand)", s1: "var(--series-1)", s2: "var(--series-2)", s3: "var(--series-3)", neg: "var(--critical)", muted: "var(--muted)" };
const view = document.getElementById("view");
const TOMORROW = addDays(todayKey(), 1);
let ui = { date: TOMORROW };
let cleanup = null;

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

// ---------- shell ----------
const sel = document.getElementById("plantSelect");
function fillPlants() {
  const s = db.get();
  sel.innerHTML = s.plants.map((p) => `<option value="${esc(p.id)}" ${p.id === s.activeId ? "selected" : ""}>${esc(p.name)} · ${num(p.pmax, 1)} MW</option>`).join("");
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
  const idx = await omieIndex();
  const has = idx.days?.includes(TOMORROW);
  const pill = document.getElementById("pillOmie");
  pill.querySelector("b").textContent = idx.offline ? "Sin conexión" : has ? "Publicado" : "Pendiente (≈13:00)";
  const r = await pricesFor(has ? TOMORROW : todayKey());
  document.querySelector("#pillAvg small").textContent = has ? "Media mañana" : r.source === "omie" ? "Media hoy" : "Media (ejemplo)";
  document.querySelector("#pillAvg b").textContent = `${num(mean(r.prices), 1)} €/MWh`;
}

const routes = { plan: renderPlan, precios: renderPrices, historial: renderSaved, centrales: renderPlants };
function render() {
  const r = (location.hash.replace("#/", "") || "plan").split("?")[0];
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
  if (cleanup) cleanup();
  cleanup = null;
  hideTip();
  view.innerHTML = "";
  document.getElementById("app").classList.remove("nav-open");
  (routes[r] || renderPlan)(view);
}
window.addEventListener("hashchange", render);
db.on(fillPlants);
applyTheme();
fillPlants();
render();
headerPills();
setInterval(() => omieIndex(true).then(headerPills), 15 * 60 * 1000);

// ---------- entradas del plan ----------
function inputKey(p, date) {
  return `${p.id}|${date}`;
}
function defaultInputs(p, date) {
  // arrastra el volumen final del plan guardado del día anterior, si existe
  const prev = db.get().saved.find((s) => s.plantId === p.id && s.date === addDays(date, -1));
  const v0 = prev ? prev.vEnd : +((p.vmin + p.vmax) / 2).toFixed(3);
  const d = plantDerived(p);
  const q = +(p.type === "fluyente" ? d.qmax * 0.6 : d.qmax * 0.25).toFixed(2);
  return { v0, vTarget: v0, inflowMode: "const", inflow: q, hourly: new Array(24).fill(q), wvMode: "auto", wv: 60, blocked: new Array(24).fill(false), startOn: false, strict: false };
}
function getInputs(p, date) {
  return { ...defaultInputs(p, date), ...(db.get().inputs[inputKey(p, date)] || {}) };
}
function setInputs(p, date, patch) {
  const all = { ...db.get().inputs };
  all[inputKey(p, date)] = { ...getInputs(p, date), ...patch };
  db.set({ inputs: all });
}

// ---------- vista: plan del día ----------
function renderPlan(root) {
  const p = db.plant();
  const d = plantDerived(p);
  const date = ui.date;
  const inp = getInputs(p, date);
  const isRes = p.type !== "fluyente";
  root.innerHTML = `
    <div class="view-head">
      <div><h1>Plan del día · ${fmtDayLong(date)}</h1><div class="sub">${esc(p.name)} · ${isRes ? "Embalse" : "Fluyente"} · ${num(d.pmax, 2)} MW · ${num(d.kwhm3, 3)} kWh/m³</div></div>
      <div class="spacer"></div>
      <div class="period no-print">
        <div class="seg"><button data-d="${todayKey()}">Hoy</button><button data-d="${TOMORROW}">Mañana</button></div>
        <input type="date" id="date" value="${date}" aria-label="Fecha" />
      </div>
    </div>
    <div id="srcBox"></div>
    <div class="card mb no-print">
      <div class="card-head"><h2>Datos de partida</h2><span class="meta">Se guardan por central y día</span></div>
      <div class="inputs">
        <label class="field">Volumen inicial (hm³)<input type="number" step="0.001" id="v0" value="${inp.v0}" /><small>${isRes ? `Útil entre ${num(p.vmin, 2)} y ${num(p.vmax, 2)} hm³` : "Volumen de la cámara de carga"}</small></label>
        <label class="field">Volumen final objetivo (hm³)<input type="number" step="0.001" id="vT" value="${inp.vTarget}" /><small>Lo que quieres conservar al acabar el día</small></label>
        <label class="field">Aportación prevista
          <select id="inMode"><option value="const" ${inp.inflowMode === "const" ? "selected" : ""}>Constante todo el día</option><option value="hourly" ${inp.inflowMode === "hourly" ? "selected" : ""}>Por horas</option></select></label>
        <label class="field" id="inConstWrap">Caudal entrante (m³/s)<input type="number" step="0.01" id="inC" value="${inp.inflow}" /><small>Ecológico: ${num(p.qeco, 2)} m³/s · máx. turbinable: ${num(d.qmax, 2)} m³/s</small></label>
        <label class="field">Valor del agua al final del día
          <select id="wvMode"><option value="auto" ${inp.wvMode === "auto" ? "selected" : ""}>Automático (precio medio del día)</option><option value="manual" ${inp.wvMode === "manual" ? "selected" : ""}>Fijo (€/MWh)</option></select></label>
        <label class="field" id="wvWrap">€/MWh del agua guardada<input type="number" step="1" id="wv" value="${inp.wv}" /><small>Si mañana esperas precios altos, súbelo para guardar agua</small></label>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <label class="toggle"><input type="checkbox" id="strict" ${inp.strict ? "checked" : ""} /> Volumen final obligatorio</label>
        <label class="toggle"><input type="checkbox" id="startOn" ${inp.startOn ? "checked" : ""} /> Empieza el día en marcha</label>
      </div>
      <div id="hourlyWrap" style="margin-top:12px"></div>
      <div class="mini-title" style="margin-top:12px">Horas indisponibles (mantenimiento, limitación prevista…) · marca las horas en que no se puede turbinar</div>
      <div class="hours" id="blocked"></div>
    </div>
    <div class="grid kpis" id="kpis"></div>
    <div class="grid two mb">
      <div class="card"><div class="card-head"><h2>Precio y programa</h2><span class="meta" id="resMeta"></span></div>
        <div class="mini-title">Precio mercado diario (€/MWh)</div><div id="chPrice"></div>
        <div class="mini-title">Programa de potencia (MW)</div><div id="chP"></div>
        <p class="note">Arrastra sobre un gráfico para ampliar; doble clic para volver.</p>
      </div>
      <div class="card"><div class="card-head"><h2>Evolución del embalse</h2><span class="meta">hm³ al final de cada periodo</span></div>
        <div id="chV"></div>
        <div id="explain" class="note" style="margin-top:8px"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Programa para W2M</h2><span class="meta">Resumen horario · el CSV incluye los 96 cuartos de hora</span></div>
      <div class="btn-row no-print" style="margin-bottom:10px">
        <button class="btn primary" id="csv15">Descargar CSV cuarto‑horario</button>
        <button class="btn" id="csv60">CSV horario</button>
        <button class="btn" id="copy">Copiar para Excel</button>
        <button class="btn" id="savePlan">Guardar plan</button>
        <button class="btn" id="print">Imprimir / PDF</button>
      </div>
      <div class="table-wrap" id="tbl"></div>
    </div>`;

  const $ = (q) => root.querySelector(q);
  root.querySelectorAll("[data-d]").forEach((b) => {
    b.classList.toggle("on", b.dataset.d === date);
    b.onclick = () => {
      ui.date = b.dataset.d;
      render();
    };
  });
  $("#date").onchange = (e) => {
    if (e.target.value) {
      ui.date = e.target.value;
      render();
    }
  };

  // horas bloqueadas y aportación horaria
  $("#blocked").innerHTML = inp.blocked.map((b, h) => `<label><input type="checkbox" data-h="${h}" ${b ? "checked" : ""}/>${String(h).padStart(2, "0")}h</label>`).join("");
  const drawHourly = () => {
    const cur = getInputs(p, date);
    $("#hourlyWrap").innerHTML = cur.inflowMode === "hourly" ? `<div class="mini-title">Caudal entrante por hora (m³/s)</div><div class="hours">${cur.hourly.map((v, h) => `<label>${String(h).padStart(2, "0")}h<input type="number" step="0.01" data-qh="${h}" value="${v}"/></label>`).join("")}</div>` : "";
    $("#inConstWrap").style.display = cur.inflowMode === "hourly" ? "none" : "";
    $("#wvWrap").style.display = cur.wvMode === "manual" ? "" : "none";
  };
  drawHourly();

  const readNum = (id, fallback) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : fallback;
  };
  let timer;
  const onInput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const blocked = [...root.querySelectorAll("[data-h]")].map((c) => c.checked);
      const hourly = getInputs(p, date).hourly.slice();
      root.querySelectorAll("[data-qh]").forEach((i) => (hourly[+i.dataset.qh] = parseFloat(i.value) || 0));
      setInputs(p, date, {
        v0: readNum("#v0", inp.v0),
        vTarget: readNum("#vT", inp.vTarget),
        inflowMode: $("#inMode").value,
        inflow: readNum("#inC", inp.inflow),
        hourly,
        wvMode: $("#wvMode").value,
        wv: readNum("#wv", inp.wv),
        blocked,
        strict: $("#strict").checked,
        startOn: $("#startOn").checked,
      });
      drawHourly();
      compute();
    }, 250);
  };
  root.querySelector(".card.mb").addEventListener("input", onInput);
  root.querySelector(".card.mb").addEventListener("change", onInput);

  let result = null;
  async function compute() {
    const { prices, source } = await pricesFor(date);
    const cur = getInputs(p, date);
    const n = prices.length;
    const perH = n / 24;
    const hourOf = (t) => clamp(Math.floor(t / perH), 0, 23);
    const inflow = Array.from({ length: n }, (_, t) => (cur.inflowMode === "hourly" ? cur.hourly[hourOf(t)] : cur.inflow));
    const blocked = Array.from({ length: n }, (_, t) => !!cur.blocked[hourOf(t)]);
    const avg = mean(prices);
    const wv = cur.wvMode === "auto" ? avg : cur.wv;
    const v0 = clamp(cur.v0, Math.min(p.vmin, cur.v0), p.vmax);
    const r = optimizeDay(p, prices, { v0, vTarget: clamp(cur.vTarget, p.vmin, p.vmax), inflow, waterValue: wv, strictTarget: cur.strict, blocked, startOn: cur.startOn });
    const flat = flatPlan(p, prices, r.water, inflow, { blocked });
    result = { r, prices, source, n, perH, flat, avg, wv, inflow, cur };

    // origen de precios
    const srcTxt = { omie: "Precios oficiales OMIE", manual: "Precios introducidos a mano", ejemplo: "Precios de EJEMPLO" };
    $("#srcBox").innerHTML =
      source === "ejemplo"
        ? `<div class="warn-box"><b>Aún no hay precios oficiales para el ${fmtDayLong(date)}.</b> El plan usa precios de ejemplo. OMIE publica el día siguiente hacia las 13:00 y la web los descarga sola; también puedes pegarlos en <a href="#/precios">Precios OMIE</a>.</div>`
        : `<div class="chips"><span class="src-badge ${source}"><i></i>${srcTxt[source]} · ${n} periodos · media ${num(avg, 2)} €/MWh</span></div>`;

    // KPIs
    const gain = flat.revenue > 0 ? ((r.revenue - flat.revenue) / flat.revenue) * 100 : null;
    const fill = (x) => (p.vmax > p.vmin ? ((x - p.vmin) / (p.vmax - p.vmin)) * 100 : 0);
    $("#kpis").innerHTML = [
      kpi("Ingreso previsto", eur(r.revenue), `${num(r.energy, 1)} MWh a ${num(r.captured ?? 0, 1)} €/MWh`, "accent"),
      kpi("Precio capturado", r.captured != null ? `${num(r.captured, 1)} <small>€/MWh</small>` : "–", `Media del día ${num(avg, 1)} €/MWh${r.captured ? ` (${r.captured >= avg ? "+" : ""}${num(((r.captured - avg) / avg) * 100, 0)} %)` : ""}`),
      kpi("Mejora vs turbinar plano", gain != null ? `${gain >= 0 ? "+" : ""}${num(gain, 1)} %` : "–", `Mismo agua repartida igual: ${eur(flat.revenue)}`),
      kpi("Agua turbinada", `${num(r.water, 3)} <small>hm³</small>`, `Vertido: ${num(r.spilled, 3)} hm³${r.spilled > 0.0005 ? " ⚠" : ""}`, r.spilled > 0.0005 ? "neg" : ""),
      kpi("Volumen final", `${num(r.vEnd, 3)} <small>hm³</small>`, `${num(fill(r.vEnd), 0)} % útil · objetivo ${num(cur.vTarget, 3)} · arranques ${r.starts}`, r.vEnd < cur.vTarget - 0.001 ? "neg" : ""),
    ].join("");
    $("#resMeta").textContent = `${r.starts} arranque(s) · máx. ${p.maxStarts}`;

    const x = prices.map((_, t) => fmtHM(t * r.dt * 60));
    const tip = (t) => `${fmtHM(t * r.dt * 60)}–${fmtHM((t + 1) * r.dt * 60)}`;
    xyChart($("#chPrice"), {
      x,
      tipTitle: tip,
      zoom: true,
      xLabelWidth: 56,
      series: [{ name: "Precio", values: prices, color: C.s1, step: true, markers: false, fmt: (v) => num(v, 2) + " €/MWh" }],
      refLines: [{ value: wv, label: `Valor agua ${num(wv, 0)}` }],
      height: 160,
    });
    xyChart($("#chP"), {
      x,
      tipTitle: tip,
      zoom: true,
      xLabelWidth: 56,
      series: [{ name: "Potencia", type: "bar", values: r.p, color: (v, i) => (blocked[i] ? C.neg : C.brand), fmt: (v) => num(v, 2) + " MW" }],
      tipExtra: (t) => tipRow("", "Caudal", num(r.q[t], 2) + " m³/s") + tipRow("", "Ingreso", eur(r.rev[t], 0)) + (blocked[t] ? `<div class="tip-note">Hora indisponible</div>` : ""),
      y: { min: 0, max: Math.max(d.pmax * 1.05, 0.1), fmt: (v) => num(v, d.pmax < 5 ? 1 : 0) },
      height: 170,
    });
    xyChart($("#chV"), {
      x: ["00:00", ...x.slice(1), "24:00"],
      zoom: true,
      xLabelWidth: 56,
      series: [{ name: "Volumen", values: r.v, color: C.brand, markers: false, fmt: (v) => num(v, 3) + " hm³" }],
      y: { min: Math.min(p.vmin, ...r.v) * 0.98, max: p.vmax * 1.02, fmt: (v) => num(v, p.vmax < 1 ? 3 : 1), zero: false },
      refLines: [
        { value: p.vmax, label: "Máximo" },
        { value: p.vmin, label: "Mínimo" },
        { value: cur.vTarget, label: "Objetivo" },
      ],
      height: 250,
    });
    // explicación en lenguaje llano
    const onH = r.p.filter((v) => v > 0).length * r.dt;
    const hrs = [];
    let st = null;
    r.p.forEach((v, t) => {
      if (v > 0 && st == null) st = t;
      if ((v === 0 || t === r.p.length - 1) && st != null) {
        const end = v === 0 ? t : t + 1;
        hrs.push(`${fmtHM(st * r.dt * 60)}–${fmtHM(end * r.dt * 60)}`);
        st = null;
      }
    });
    $("#explain").innerHTML = onH
      ? `Turbinar <b>${num(onH, 2)} h</b> en: <b>${hrs.join(", ")}</b>. El resto del día compensa guardar el agua (vale ${num(wv, 0)} €/MWh al final del día)${result.cur.blocked.some(Boolean) ? " o la hora está marcada como indisponible" : ""}. Si entra mucho caudal, el plan turbina también en horas baratas para no verter.`
      : `Con estos precios no compensa turbinar: el precio no supera el valor del agua (${num(wv, 0)} €/MWh). Baja el valor del agua o el volumen objetivo si necesitas producir.`;

    // tabla horaria
    const rows = [];
    for (let h = 0; h < 24; h++) {
      const idx = Array.from({ length: Math.round(perH) }, (_, j) => h * Math.round(perH) + j).filter((t) => t < n);
      const pr = mean(idx.map((t) => prices[t]));
      const mw = mean(idx.map((t) => r.p[t]));
      const mwh = idx.reduce((s, t) => s + r.p[t] * r.dt, 0);
      const e = idx.reduce((s, t) => s + r.rev[t], 0);
      rows.push(`<tr class="${mwh > 0 ? "row-hl" : ""}"><td>${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00</td><td>${num(pr, 2)}</td><td>${num(mw, 2)}</td><td>${num(mwh, 2)}</td><td>${num(mean(idx.map((t) => r.q[t])), 2)}</td><td>${eur(e)}</td><td>${num(r.v[idx[idx.length - 1] + 1], 3)}</td></tr>`);
    }
    $("#tbl").innerHTML = `<table class="data"><thead><tr><th>Hora</th><th>Precio €/MWh</th><th>MW medio</th><th>MWh</th><th>Caudal m³/s</th><th>Ingreso</th><th>Vol. final hm³</th></tr></thead><tbody>${rows.join("")}</tbody><tfoot><tr><th>Total</th><th>${num(avg, 2)}</th><th></th><th>${num(r.energy, 2)}</th><th></th><th>${eur(r.revenue)}</th><th>${num(r.vEnd, 3)}</th></tr></tfoot></table>`;
  }

  const csvNum = (v, dec = 3) => (Math.round(v * 10 ** dec) / 10 ** dec).toString().replace(".", ",");
  $("#csv15").onclick = () => {
    if (!result) return;
    const { r, prices } = result;
    const lines = r.p.map((mw, t) => [date, t + 1, fmtHM(t * r.dt * 60), fmtHM((t + 1) * r.dt * 60), csvNum(mw), csvNum(mw * r.dt), csvNum(prices[t], 2)].join(";"));
    downloadFile(`programa_${p.name.replace(/\W+/g, "_")}_${date}.csv`, "﻿Fecha;Periodo;Inicio;Fin;Potencia_MW;Energia_MWh;Precio_EUR_MWh\n" + lines.join("\n"));
  };
  $("#csv60").onclick = () => {
    if (!result) return;
    const { r, prices, perH } = result;
    const k = Math.round(perH);
    const lines = Array.from({ length: 24 }, (_, h) => {
      const idx = Array.from({ length: k }, (_, j) => h * k + j).filter((t) => t < r.p.length);
      return [date, h + 1, csvNum(idx.reduce((s, t) => s + r.p[t] * r.dt, 0)), csvNum(mean(idx.map((t) => prices[t])), 2)].join(";");
    });
    downloadFile(`programa_horario_${p.name.replace(/\W+/g, "_")}_${date}.csv`, "﻿Fecha;Hora;Energia_MWh;Precio_medio_EUR_MWh\n" + lines.join("\n"));
  };
  $("#copy").onclick = async () => {
    if (!result) return;
    const { r } = result;
    const txt = "Periodo\tInicio\tPotencia MW\n" + r.p.map((mw, t) => `${t + 1}\t${fmtHM(t * r.dt * 60)}\t${csvNum(mw)}`).join("\n");
    try {
      await navigator.clipboard.writeText(txt);
      toast("Programa copiado: pégalo en Excel.");
    } catch {
      toast("No se pudo copiar; usa la descarga CSV.");
    }
  };
  $("#savePlan").onclick = () => {
    if (!result) return;
    const { r, source, avg, cur } = result;
    const note = prompt("Nota para este plan (opcional):", "") ?? "";
    const entry = { id: Date.now().toString(36), plantId: p.id, plantName: p.name, date, savedAt: Date.now(), source, avg, energy: r.energy, revenue: r.revenue, captured: r.captured, water: r.water, vEnd: r.vEnd, starts: r.starts, p: r.p, dt: r.dt, inputs: cur, note };
    const saved = [entry, ...db.get().saved.filter((s) => !(s.plantId === p.id && s.date === date))].slice(0, 400);
    db.set({ saved });
    toast("Plan guardado. El volumen final se usará como inicial del día siguiente.");
  };
  $("#print").onclick = () => window.print();
  compute();
}

function kpi(label, value, sub, cls = "") {
  return `<div class="card kpi ${cls}"><div class="k-label">${esc(label)}</div><div class="k-val">${value}</div><div class="k-sub" style="text-transform:none;letter-spacing:0;font-size:11.5px">${esc(sub)}</div></div>`;
}

// ---------- vista: precios ----------
async function renderPrices(root) {
  root.innerHTML = `<div class="view-head"><div><h1>Precios OMIE</h1><div class="sub">Mercado diario · zona España</div></div><div class="spacer"></div><button class="btn small" id="refresh">Actualizar</button></div><div id="pbody"><p class="muted">Cargando…</p></div>`;
  const draw = async (force) => {
    const idx = await omieIndex(force);
    const days = (idx.days || []).slice(-60);
    const series = await Promise.all(days.map(async (k) => ({ k, ...(await pricesFor(k)) })));
    const today = await pricesFor(todayKey());
    const tom = await pricesFor(TOMORROW);
    const body = root.querySelector("#pbody");
    const status = idx.offline
      ? `<div class="warn-box">No se pudo leer el archivo de precios publicado. Si estás viendo la herramienta fuera de la web publicada, los precios automáticos estarán disponibles al publicarla. Mientras, usa precios pegados a mano o de ejemplo.</div>`
      : `<div class="chips"><span class="src-badge omie"><i></i>Descarga automática · ${days.length} días · actualizado ${idx.updated ? new Date(idx.updated).toLocaleString("es-ES") : "–"}</span></div>`;
    body.innerHTML = `${status}
      <div class="grid two mb">
        <div class="card"><div class="card-head"><h2>Hoy y mañana</h2><span class="meta">€/MWh por periodo</span></div><div id="chTT"></div>
          ${legend([{ label: `Hoy (${today.source === "omie" ? "OMIE" : today.source})`, color: C.muted, line: true }, { label: `Mañana (${tom.source === "omie" ? "OMIE" : tom.source === "ejemplo" ? "pendiente: ejemplo" : tom.source})`, color: C.s1, line: true }])}</div>
        <div class="card"><div class="card-head"><h2>Últimos ${days.length || 0} días</h2><span class="meta">Media diaria y spread (máx − mín)</span></div><div id="chHist"></div>
          ${legend([{ label: "Precio medio", color: C.s1, line: true }, { label: "Spread", color: C.s2, line: true }])}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Introducir precios a mano</h2><span class="meta">Solo si faltan los oficiales</span></div>
        <p class="note">Pega 24 precios horarios o 96 cuarto‑horarios (una línea por periodo; vale "hora;precio" o solo el precio).</p>
        <div class="inputs"><label class="field">Fecha<input type="date" id="mDate" value="${TOMORROW}" /></label></div>
        <label class="field" style="margin-top:10px">Precios<textarea id="mText" rows="6" placeholder="1;72,5&#10;2;70,1&#10;…"></textarea></label>
        <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="mSave">Guardar precios</button><button class="btn" id="mDel">Borrar precios manuales de esa fecha</button></div>
      </div>`;
    const n = Math.max(today.prices.length, tom.prices.length);
    xyChart(body.querySelector("#chTT"), {
      x: Array.from({ length: n }, (_, t) => fmtHM((t * 24 * 60) / n)),
      zoom: true,
      xLabelWidth: 56,
      series: [
        { name: "Hoy", values: today.prices, color: C.muted, markers: false, step: true, fmt: (v) => num(v, 2) + " €/MWh" },
        { name: "Mañana", values: tom.prices, color: C.s1, markers: false, step: true, fmt: (v) => num(v, 2) + " €/MWh" },
      ],
      height: 230,
    });
    if (series.length) {
      xyChart(body.querySelector("#chHist"), {
        x: series.map((s) => fmtDayShort(s.k)),
        tipTitle: (i) => fmtDayLong(series[i].k),
        series: [
          { name: "Precio medio", values: series.map((s) => mean(s.prices)), color: C.s1, fmt: (v) => num(v, 2) + " €/MWh" },
          { name: "Spread", values: series.map((s) => Math.max(...s.prices) - Math.min(...s.prices)), color: C.s2, fmt: (v) => num(v, 2) + " €/MWh" },
        ],
        height: 230,
      });
    } else body.querySelector("#chHist").innerHTML = `<p class="muted">Sin histórico todavía.</p>`;
    body.querySelector("#mSave").onclick = () => {
      const k = body.querySelector("#mDate").value;
      const vals = parseManual(body.querySelector("#mText").value);
      if (!k || !vals) return toast("Necesito una fecha y 24 o 96 precios.");
      db.set({ manualPrices: { ...db.get().manualPrices, [k]: vals } });
      toast(`Precios guardados para el ${fmtDayLong(k)}.`);
      headerPills();
    };
    body.querySelector("#mDel").onclick = () => {
      const k = body.querySelector("#mDate").value;
      const mp = { ...db.get().manualPrices };
      delete mp[k];
      db.set({ manualPrices: mp });
      toast("Precios manuales borrados.");
    };
  };
  root.querySelector("#refresh").onclick = () => draw(true).then(headerPills);
  draw(false);
}

// ---------- vista: planes guardados ----------
function renderSaved(root) {
  const draw = () => {
    const list = db.get().saved;
    root.innerHTML = `<div class="view-head"><div><h1>Planes guardados</h1><div class="sub">${list.length} plan(es)</div></div><div class="spacer"></div><button class="btn small" id="exp" ${list.length ? "" : "disabled"}>Exportar todo (CSV)</button></div>
      <div class="card plan-list">${
        list.length
          ? list
              .map(
                (s) => `<div class="alarm"><div><b>${fmtDayLong(s.date)} · ${esc(s.plantName)}</b><div class="muted" style="font-size:12px">${num(s.energy, 1)} MWh · ${eur(s.revenue)} · ${num(s.captured ?? 0, 1)} €/MWh · vol. final ${num(s.vEnd, 3)} hm³${s.source !== "omie" ? ` · precios ${s.source}` : ""}${s.note ? " · " + esc(s.note) : ""}</div></div>
                <span class="when">${new Date(s.savedAt).toLocaleString("es-ES")}</span>
                <button class="btn small" data-open="${s.id}">Abrir</button><button class="btn small" data-del="${s.id}">Borrar</button></div>`
              )
              .join("")
          : `<p class="muted">Aún no has guardado ningún plan. Calcula uno en <a href="#/plan">Plan del día</a> y pulsa "Guardar plan".</p>`
      }</div>`;
    root.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => {
      const s = db.get().saved.find((x) => x.id === b.dataset.open);
      if (!s) return;
      if (db.get().plants.some((p) => p.id === s.plantId)) db.set({ activeId: s.plantId });
      setInputs(db.plant(), s.date, s.inputs);
      ui.date = s.date;
      location.hash = "#/plan";
    }));
    root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
      db.set({ saved: db.get().saved.filter((x) => x.id !== b.dataset.del) });
      draw();
    }));
    const exp = root.querySelector("#exp");
    if (exp)
      exp.onclick = () => {
        const lines = list.map((s) => [s.date, `"${s.plantName}"`, s.energy.toFixed(3), s.revenue.toFixed(2), (s.captured ?? 0).toFixed(2), s.water.toFixed(4), s.vEnd.toFixed(4), s.starts, s.source, `"${(s.note || "").replace(/"/g, "'")}"`].join(";").replace(/\./g, ","));
        downloadFile("planes_guardados.csv", "﻿Fecha;Central;MWh;Ingreso_EUR;Precio_capturado;Agua_hm3;Vol_final_hm3;Arranques;Fuente_precios;Nota\n" + lines.join("\n"));
      };
  };
  draw();
}

// ---------- vista: centrales ----------
const FIELDS = [
  ["name", "Nombre", "text"],
  ["type", "Tipo", "select", [["embalse", "Embalse (regulación)"], ["fluyente", "Fluyente (sin apenas regulación)"]]],
  ["pmax", "Potencia máxima (MW)", "number", "0.01"],
  ["pmin", "Potencia mínima técnica (MW)", "number", "0.01"],
  ["head", "Salto neto (m)", "number", "0.1"],
  ["eta", "Rendimiento global (%)", "number", "0.1", "Turbina + generador + transformador"],
  ["qmax", "Caudal máx. turbinable (m³/s)", "number", "0.01"],
  ["qeco", "Caudal ecológico (m³/s)", "number", "0.01"],
  ["vmin", "Volumen mínimo útil (hm³)", "number", "0.001"],
  ["vmax", "Volumen máximo (hm³)", "number", "0.001", "En fluyentes: volumen de la cámara de carga"],
  ["maxStarts", "Arranques máximos/día", "number", "1"],
  ["startCost", "Coste por arranque (€)", "number", "1", "Desgaste; evita arrancar y parar por poco"],
];
function renderPlants(root) {
  const draw = () => {
    const p = db.plant();
    const d = plantDerived(p);
    root.innerHTML = `<div class="view-head"><div><h1>Centrales</h1><div class="sub">Datos técnicos que usa el cálculo. Se guardan en este navegador.</div></div></div>
      <div class="card mb"><div class="card-head"><h2>${esc(p.name)}</h2><span class="meta">${db.get().plants.length} central(es)</span></div>
        <form id="f" class="form-grid">${FIELDS.map(([k, l, t, a, hint]) => `<label class="field">${esc(l)}${t === "select" ? `<select name="${k}">${a.map(([v, x]) => `<option value="${v}" ${p[k] === v ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>` : `<input name="${k}" type="${t}" ${t === "number" ? `step="${a}"` : ""} value="${esc(p[k] ?? "")}" required/>`}${hint ? `<small>${esc(hint)}</small>` : ""}</label>`).join("")}</form>
        <p class="note" style="margin-top:12px">Con estos datos: <b>${num(d.kwhm3, 3)} kWh por m³</b> (${num(d.mwhHm3, 0)} MWh por hm³) · a plena carga turbina <b>${num(d.qmax, 2)} m³/s</b> y da <b>${num(d.pmax, 2)} MW</b>${d.pmax < p.pmax - 0.01 ? " (limitado por el caudal máximo)" : ""} · a potencia mínima, ${num(d.qmin, 2)} m³/s · comprobación: ${num(powerOf(d.qmax, p.head, d.eta), 2)} MW.</p>
        <div class="btn-row" style="margin-top:12px"><button class="btn primary" id="save">Guardar</button><button class="btn" id="add">Nueva central</button><button class="btn danger" id="del" ${db.get().plants.length <= 1 ? "disabled" : ""}>Eliminar</button></div>
      </div>
      <div class="card"><div class="card-head"><h2>Copia de seguridad</h2></div><div class="btn-row">
        <button class="btn" id="exp">Exportar configuración</button>
        <label class="btn">Importar configuración<input type="file" id="imp" accept=".json" hidden /></label>
        <button class="btn danger" id="reset">Restablecer todo</button></div></div>`;
    const $ = (q) => root.querySelector(q);
    $("#save").onclick = () => {
      const fd = new FormData($("#f"));
      const patch = {};
      for (const [k, , t] of FIELDS) patch[k] = t === "number" ? parseFloat(fd.get(k)) : fd.get(k);
      const bad = !(patch.pmax > 0) || !(patch.head > 0) || !(patch.eta > 20 && patch.eta <= 100) || !(patch.qmax > 0) || patch.pmin < 0 || patch.pmin >= patch.pmax || !(patch.vmax > patch.vmin) || patch.vmin < 0;
      if (bad) return toast("Revisa los datos: potencias, salto, rendimiento, caudal y volúmenes.");
      db.updatePlant(p.id, patch);
      toast("Central guardada.");
      draw();
    };
    $("#add").onclick = () => {
      const np = { ...p, id: "c" + Date.now().toString(36), name: "Nueva central" };
      db.set({ plants: [...db.get().plants, np], activeId: np.id });
      draw();
    };
    $("#del").onclick = () => {
      if (!confirm(`¿Eliminar ${p.name}?`)) return;
      const rest = db.get().plants.filter((x) => x.id !== p.id);
      db.set({ plants: rest, activeId: rest[0].id });
      draw();
    };
    $("#exp").onclick = () => downloadFile("plan-hidraulico-config.json", JSON.stringify({ plants: db.get().plants, saved: db.get().saved, manualPrices: db.get().manualPrices }, null, 2), "application/json");
    $("#imp").onchange = async (e) => {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        if (!Array.isArray(j.plants) || !j.plants.length) throw new Error();
        db.set({ plants: j.plants, saved: j.saved || [], manualPrices: j.manualPrices || {}, activeId: j.plants[0].id });
        toast("Configuración importada.");
        draw();
      } catch {
        toast("Archivo no válido.");
      }
    };
    $("#reset").onclick = () => {
      if (!confirm("Se borrarán centrales, planes y precios manuales. ¿Continuar?")) return;
      db.reset();
      draw();
    };
  };
  draw();
}
