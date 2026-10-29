import { store } from "../store.js";
import { live, rackValues } from "../live.js";
import { simulateDay, N } from "../model.js";
import { xyChart, scatter, ring, legend, showTip, hideTip, tipRow } from "../charts.js";
import { num, pct, esc, fmtHM, addDays, todayKey, clamp } from "../util.js";
import { toast } from "../period.js";
import { C } from "./common.js";

const ICON = {
  mode: '<path d="M4 7h16M4 12h10M4 17h6"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  grid: '<path d="M12 3v6M8 9h8l-2 12h-4zM5 21h14"/>',
  dc: '<path d="M4 9h16M4 15h16"/>',
  bms: '<rect x="5" y="7" width="14" height="10" rx="2"/><path d="M19 10h2v4h-2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  q: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 3"/>',
  v: '<path d="M4 4l8 16 8-16"/>',
  pf: '<path d="M3 12c3-6 6-6 9 0s6 6 9 0"/>',
};
const ic = (k) => `<span class="ic"><svg viewBox="0 0 24 24">${ICON[k]}</svg></span>`;

const METRICS = [
  { k: "soc", label: "SOC", unit: "%", dec: 1, fmt: (v) => num(v, 1) + " %" },
  { k: "cur", label: "Intensidad", unit: "A", dec: 1, fmt: (v) => num(v, 1) + " A" },
  { k: "v", label: "Tensión", unit: "V", dec: 1, fmt: (v) => num(v, 1) + " V" },
  { k: "t", label: "Temperatura", unit: "ºC", dec: 1, fmt: (v) => num(v, 1) + " ºC" },
];

export function renderRealtime(root) {
  const a = store.asset();
  const dp = a.powerMW < 10 ? 3 : 2;
  root.innerHTML = `
    <div class="view-head">
      <div><h1>Tiempo real</h1><div class="sub">${esc(a.name)} · fuente: <b id="src"></b></div></div>
      <div class="spacer"></div>
      <div class="seg no-print" id="speed" title="Velocidad de simulación">
        <button data-s="1">1×</button><button data-s="60">60×</button><button data-s="600">600×</button>
      </div>
    </div>
    <div class="chips" id="chips"></div>
    <div class="grid kpis six">
      <div class="card kpi accent"><div class="k-label">Energía producida hoy</div><div class="k-sub">Exportada a red</div><div class="k-val" id="kExp"></div></div>
      <div class="card kpi"><div class="k-label">Energía importada hoy</div><div class="k-sub">Desde red/sitio</div><div class="k-val" id="kImp"></div></div>
      <div class="card kpi"><div class="k-label">Descarga disponible</div><div class="k-sub">Hasta SOC mín. (${a.socMin} %)</div><div class="k-val" id="kDis"></div></div>
      <div class="card kpi"><div class="k-label">Carga disponible</div><div class="k-sub">Hasta SOC máx. (${a.socMax} %)</div><div class="k-val" id="kChg"></div></div>
      <div class="card kpi"><div class="k-label">Round-trip ayer</div><div class="k-sub">RTE técnico AC-AC</div><div class="k-val" id="kRte"></div></div>
      <div class="card kpi"><div class="k-label">Ciclos hoy</div><div class="k-sub">Equivalentes acumulados</div><div class="k-val" id="kCyc"></div></div>
    </div>
    <div class="section-title">Operación <span class="tag" id="tagOp"></span></div>
    <div class="status-grid" id="ops"></div>
    <div class="section-title">Control PPC <span class="tag" id="tagPpc"></span></div>
    <div class="status-grid" id="ppc"></div>
    <div class="grid side-layout" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><h2>Flujo de potencia hoy</h2><span class="meta">Arrastra para ampliar · doble clic o Esc para restablecer</span></div>
        <div class="mini-title">Potencia (MW, + descarga / − carga)</div><div id="chP"></div>
        ${legend([{ label: "Medida", color: C.s1, line: true }, { label: "Consigna / programa", color: C.s2, line: true, dash: true }])}
        <div class="mini-title">Estado de carga (%)</div><div id="chS"></div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card">
          <div class="card-head"><h2>Estado de carga</h2><span class="meta">SOC</span></div>
          <div id="ringSoc"></div>
          <div class="stats" style="grid-template-columns:1fr 1fr">
            <div class="stat"><span>SOH</span><b id="sSoh"></b></div>
            <div class="stat"><span>Temp. celda media</span><b id="sTemp"></b></div>
            <div class="stat"><span>Capacidad descarga</span><b id="sCd"></b></div>
            <div class="stat"><span>Capacidad carga</span><b id="sCc"></b></div>
          </div>
        </div>
        <div class="card control no-print">
          <div class="card-head"><h2>Control</h2><span class="meta" id="modeTxt"></span></div>
          <div class="seg" id="modeSeg"><button data-m="auto">Automático</button><button data-m="manual">Manual</button><button data-m="standby">Standby</button></div>
          <div>
            <div class="mini-title">Consigna P manual</div>
            <div class="slider-row"><input type="range" id="spP" min="${-a.powerMW}" max="${a.powerMW}" step="${a.powerMW / 100}" value="0" /><output id="spPo"></output></div>
            <div class="btn-row">
              <button class="btn small" data-q="-1">Cargar 100 %</button><button class="btn small" data-q="-0.5">Cargar 50 %</button>
              <button class="btn small" data-q="0">Parar</button>
              <button class="btn small" data-q="0.5">Descargar 50 %</button><button class="btn small" data-q="1">Descargar 100 %</button>
            </div>
          </div>
          <div>
            <div class="mini-title">Consigna Q (requiere control Q habilitado)</div>
            <div class="slider-row"><input type="range" id="spQ" min="${-a.powerMW * 0.5}" max="${a.powerMW * 0.5}" step="${a.powerMW / 100}" value="0" /><output id="spQo"></output></div>
          </div>
          <div class="btn-row">
            <button class="btn small" id="brk"></button>
            <button class="btn small danger" id="estop">Paro de emergencia</button>
            <button class="btn small" id="rearm">Rearmar</button>
          </div>
          <div class="btn-row">
            <button class="btn small" id="tFire">Probar alarma incendio</button>
            <button class="btn small" id="tIntr">Probar intrusión</button>
            <button class="btn small" id="tH2">Simular fuga H₂</button>
          </div>
        </div>
      </div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="card-head"><h2>Potencia activa / reactiva (ayer)</h2><span class="meta">MW · MVAr</span></div><div id="chPQy"></div>
        ${legend([{ label: "P real", color: C.s1, line: true }, { label: "P consigna", color: C.s1, line: true, dash: true }, { label: "Q real", color: C.s2, line: true }, { label: "Q consigna", color: C.s2, line: true, dash: true }])}</div>
      <div class="card"><div class="card-head"><h2>Diagrama P‑Q</h2><span class="meta">Valores normalizados a potencia nominal</span></div><div id="chPQ"></div>
        ${legend([{ label: "Operación real (hoy)", color: C.s1 }, { label: "Consigna", color: C.s2 }, { label: "Último punto", color: C.neg }])}
        <p class="note">Círculo discontinuo: envolvente nominal |S| = 1 pu.</p></div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Mapa de calor por rack</h2><span class="meta">Tiempo real · desviación respecto a la media de cada métrica</span></div>
      <p class="note">El color indica cuánto se aleja cada rack de la media, sobre un umbral fijo por métrica (SOC ±3 pp, intensidad ±10 % nominal, tensión ±5 V, temperatura ±3 ºC), así el ruido a corriente casi nula no se marca como crítico.</p>
      <div class="table-wrap"><div id="heat" class="heat"></div></div>
      <div class="heat-scale"><span>Normal</span><i></i><span>Crítico</span></div>
      <div class="stats" id="imb" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"></div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Medidores</h2><span class="meta">Climatización y seguridad · tiempo real</span></div>
      <div class="meters" id="meters"></div>
    </div></div>`;

  const $ = (s) => root.querySelector(s);
  const yKey = addDays(todayKey(), -1);
  const yday = simulateDay(a, yKey, store.get().prices[yKey]);
  $("#kRte").innerHTML = yday.eff.rteCorr != null ? `${num(yday.eff.rteCorr, 1)}<small>%</small>` : "–";

  // P/Q de ayer
  const xq = Array.from({ length: N }, (_, i) => fmtHM(i * 15));
  const qY = yday.meas.map((p, i) => Math.sin(i / 7) * 0.01 * a.powerMW);
  xyChart($("#chPQy"), {
    x: xq,
    zoom: true,
    xLabelWidth: 56,
    series: [
      { name: "P real", values: yday.meas, color: C.s1, fmt: (v) => num(v, dp) + " MW" },
      { name: "P consigna", values: yday.sched, color: C.s1, dash: true, step: true, fmt: (v) => num(v, dp) + " MW" },
      { name: "Q real", values: qY, color: C.s2, fmt: (v) => num(v, dp) + " MVAr" },
      { name: "Q consigna", values: yday.sched.map(() => 0), color: C.s2, dash: true, fmt: (v) => num(v, dp) + " MVAr" },
    ],
    height: 220,
  });

  // controles
  const speedSeg = $("#speed");
  speedSeg.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    store.set({ realtime: { ...store.get().realtime, speed: +b.dataset.s } });
    paintSpeed();
  };
  const paintSpeed = () => speedSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.s === (store.get().realtime.speed || 1)));
  paintSpeed();
  $("#modeSeg").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) live.setMode(b.dataset.m);
  };
  const spP = $("#spP");
  spP.oninput = () => live.setManual(+spP.value);
  root.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => {
    live.setManual(+b.dataset.q * a.powerMW);
    spP.value = +b.dataset.q * a.powerMW;
  }));
  const spQ = $("#spQ");
  spQ.oninput = () => live.setQ(+spQ.value);
  $("#brk").onclick = () => {
    const s = live.state();
    if (!live.setBreaker(!s.breaker)) toast("No se puede cerrar: rearma primero el sistema.");
  };
  $("#estop").onclick = () => {
    live.emergencyStop();
    toast("Paro de emergencia: interruptor abierto, potencia a 0.");
  };
  $("#rearm").onclick = () => {
    live.rearm();
    toast("Sistema rearmado.");
  };
  $("#tFire").onclick = () => {
    live.testAlarm("fire");
    toast("Prueba: temperatura forzada a 61 ºC.");
  };
  $("#tIntr").onclick = () => live.testAlarm("intrusion");
  $("#tH2").onclick = () => {
    const leak = !live.state().h2Leak;
    live.testAlarm("h2");
    $("#tH2").textContent = leak ? "Detener fuga H₂" : "Simular fuga H₂";
    toast(leak ? "Simulando fuga de hidrógeno: observa el medidor." : "Fuga detenida.");
  };

  // mapa de calor
  const heatEl = $("#heat");
  let rackCache = [];
  heatEl.addEventListener("pointermove", (ev) => {
    const c = ev.target.closest("[data-r]");
    if (!c) return hideTip();
    const m = METRICS[+c.dataset.m];
    const r = rackCache[+c.dataset.r];
    if (!r) return;
    const avg = rackCache.reduce((x, y) => x + y[m.k], 0) / rackCache.length;
    const d = r[m.k] - avg;
    showTip(`<div class="tip-head">${esc(r.id)} · ${esc(m.label)}</div>${tipRow("", "Valor", m.fmt(r[m.k]))}${tipRow("", "Media", m.fmt(avg))}${tipRow("", "Desviación", (d >= 0 ? "+" : "") + num(d, m.dec) + " " + m.unit)}`, ev.clientX, ev.clientY);
  });
  heatEl.addEventListener("pointerleave", hideTip);

  // medidores: delegación para consignas
  const metersEl = $("#meters");
  metersEl.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-hv]");
    if (!b) return;
    const st = live.state();
    const i = +b.dataset.hv;
    const h = st.hvac[i];
    const k = b.dataset.k;
    lastMeters = 0;
    live.setHvac(i, { [k]: Math.round((h[k] + +b.dataset.d) * 10) / 10 });
  });
  let lastHeat = 0;
  let lastMeters = 0;
  const nomI = (a.powerMW * 1e6) / 1180;

  let lastHist = -1;
  let lastDraw = 0;
  const update = (st) => {
    const src = store.get().realtime;
    $("#src").textContent = st.source === "api" ? `API REST (${src.url || "sin URL"})` : `simulador${(src.speed || 1) > 1 ? ` · ${src.speed}× acelerado` : ""}`;
    const E = a.energyMWh * (st.plan.soh / 100);
    const etaD = Math.sqrt(a.rte / 100);
    $("#kExp").innerHTML = `${num(st.exp, dp)}<small>MWh</small>`;
    $("#kImp").innerHTML = `${num(st.imp, dp)}<small>MWh</small>`;
    $("#kDis").innerHTML = `${num(Math.max(0, ((st.soc - a.socMin) / 100) * E * etaD), dp)}<small>MWh</small>`;
    $("#kChg").innerHTML = `${num(Math.max(0, ((a.socMax - st.soc) / 100) * E / etaD), dp)}<small>MWh</small>`;
    $("#kCyc").innerHTML = `${num(st.exp / (E * etaD), 2)}<small>ciclos</small>`;

    const al = st.alarms;
    $("#chips").innerHTML = [
      ["Alarma de incendios", al.fire],
      ["Alarma de intrusión", al.intrusion],
      ["Mínimo de SOC", al.minSoc],
      ["Temperatura alta", al.maxTemp],
      ["Hidrógeno", al.h2],
    ]
      .map(([l, on]) => `<span class="chip ${on ? "on" : ""}"><i></i>${esc(l)}${on ? " · ACTIVA" : ""}</span>`)
      .join("");

    const charging = st.p < -1e-3;
    const discharging = st.p > 1e-3;
    const opMode = st.estop ? "Paro emergencia" : st.mode === "standby" ? "Standby" : st.mode === "manual" ? "Manual" : "Automático";
    const offline = st.connection === "offline";
    const ops = [
      ["mode", "Modo de operación", offline ? "–" : opMode, st.estop ? "bad" : "ok"],
      ["link", "Estado general", offline ? "Sin datos" : st.estop ? "Fallo" : charging ? "Cargando" : discharging ? "Descargando" : "En reposo", st.estop ? "bad" : "ok"],
      ["grid", "Conexión a red", st.breaker ? "Cerrado" : "Abierto", st.breaker ? "ok" : "bad"],
      ["dc", "Estado DC", st.breaker ? "Cerrado" : "Abierto", st.breaker ? "ok" : "bad"],
      ["bms", "Estado BMS", al.fire ? "Fallo" : "Activo", al.fire ? "bad" : "ok"],
    ];
    $("#ops").innerHTML = ops.map(([k, l, v, c]) => `<div class="status ${c}" title="${esc(l)}">${ic(k)}<div><small>${esc(l)}</small><b>${esc(v)}</b></div></div>`).join("");
    $("#tagOp").textContent = offline ? "Sin datos" : "En línea";
    const ppc = [
      ["p", "bolt", "Potencia activa"],
      ["q", "q", "Potencia reactiva"],
      ["v", "v", "Voltaje"],
      ["pf", "pf", "Power factor"],
    ];
    const ppcEl = $("#ppc");
    if (!ppcEl.childElementCount) {
      ppcEl.innerHTML = ppc.map(([k, i, l]) => `<button class="status" data-k="${k}" style="cursor:pointer;text-align:left" title="Clic para habilitar/deshabilitar">${ic(i)}<div><small>${esc(l)}</small><b></b></div></button>`).join("");
      ppcEl.onclick = (e) => {
        const b = e.target.closest("[data-k]");
        if (b) live.togglePpc(b.dataset.k);
      };
    }
    ppcEl.querySelectorAll("[data-k]").forEach((b) => {
      const on = st.ppc[b.dataset.k];
      b.className = "status " + (on ? "ok" : "bad");
      b.querySelector("b").textContent = on ? "Habilitado" : "Deshabilitado";
    });
    $("#tagPpc").textContent = st.connection === "online" ? "En línea" : st.connection === "connecting" ? "Conectando" : "Sin conexión";

    ring($("#ringSoc"), { value: st.soc, max: 100, label: `${num(st.soc, 1)}%`, sub: charging ? "cargando" : discharging ? "descargando" : "reposo", color: st.soc <= a.socMin + 1 ? C.neg : C.brand, size: 170 });
    $("#sSoh").textContent = pct(st.plan.soh, 1);
    $("#sTemp").textContent = `${num(st.temp, 1)} ºC`;
    const ah = (mwh) => (mwh * 1e6) / 768; // tensión nominal DC 768 V
    $("#sCd").textContent = `${num(ah(((st.soc - a.socMin) / 100) * E), 1)} Ah`;
    $("#sCc").textContent = `${num(ah(((a.socMax - st.soc) / 100) * E), 1)} Ah`;
    $("#modeTxt").textContent = `${opMode} · consigna ${num(st.sp, dp)} MW`;
    $("#modeSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === st.mode));
    $("#brk").textContent = st.breaker ? "Abrir interruptor" : "Cerrar interruptor";
    $("#spPo").textContent = `${num(st.mode === "manual" ? st.manualSp : st.sp, dp)} MW`;
    if (document.activeElement !== spP) spP.value = st.mode === "manual" ? st.manualSp : st.sp;
    $("#spQo").textContent = `${num(st.qsp, dp)} MVAr`;
    spQ.disabled = !st.ppc.q;

    if (Date.now() - lastHeat > 2000) {
      lastHeat = Date.now();
      rackCache = rackValues(st, a);
      drawHeat(rackCache);
    }
    if (Date.now() - lastMeters > 2000) {
      lastMeters = Date.now();
      drawMeters(st);
    }

    // gráficos: se redibujan cuando hay muestras nuevas
    const now = Date.now();
    if (st.history.length !== lastHist && now - lastDraw > 4000) {
      lastHist = st.history.length;
      lastDraw = now;
      drawCharts(st);
    }
  };

  function drawHeat(racks) {
    const n = racks.length;
    const thr = { soc: 3, cur: Math.max(0.1 * (nomI / n), 0.5), v: 5, t: 3 };
    let html = `<div class="heat-grid" style="grid-template-columns:110px repeat(${n},minmax(54px,1fr))"><div class="hm-h">Métrica</div>${racks.map((r) => `<div class="hm-h">${r.id}</div>`).join("")}`;
    const imb = [];
    METRICS.forEach((m, mi) => {
      const vals = racks.map((r) => r[m.k]);
      const avg = vals.reduce((x, y) => x + y, 0) / n;
      imb.push([m, Math.max(...vals) - Math.min(...vals)]);
      html += `<div class="hm-l"><b>${m.label}</b><span>Ø ${m.fmt(avg)}</span></div>`;
      racks.forEach((r, ri) => {
        const sev = Math.min(1, Math.abs(r[m.k] - avg) / thr[m.k]);
        const bg = sev < 0.5 ? `color-mix(in oklab, var(--hm-warn) ${sev * 200}%, var(--hm-ok))` : `color-mix(in oklab, var(--hm-crit) ${(sev - 0.5) * 200}%, var(--hm-warn))`;
        const ink = sev > 0.3 && sev < 0.8 ? "#0b0b0b" : "#fff";
        html += `<div class="hm-c" data-r="${ri}" data-m="${mi}" style="background:${bg};color:${ink}">${num(r[m.k], m.dec)}</div>`;
      });
    });
    heatEl.innerHTML = html + "</div>";
    $("#imb").innerHTML = imb.map(([m, d]) => `<div class="stat"><span>Dispersión ${m.label.toLowerCase()}</span><b>${num(d, m.dec)} ${m.unit}</b></div>`).join("");
  }

  function drawMeters(st) {
    const h2 = st.h2;
    const h2cls = h2 >= 25 ? "bad" : h2 >= 10 ? "warn" : "ok";
    metersEl.innerHTML =
      st.hvac
        .map(
          (h, i) => `<div class="meter">
        <div class="meter-head"><b>❄ ${esc(h.name)}</b><span class="tag">${h.mode === "Heat" ? "Calor" : "Frío"}</span></div>
        <div class="meter-vals">
          <div><small>Temperatura</small><b>${num(h.temp, 2)}<em>ºC</em></b>
            <div class="sp">Consigna: <button class="mini" data-hv="${i}" data-k="spT" data-d="-0.5" aria-label="Bajar consigna">−</button> ${num(h.spT, 1)} ºC <button class="mini" data-hv="${i}" data-k="spT" data-d="0.5" aria-label="Subir consigna">+</button></div></div>
          <div><small>Humedad</small><b>${num(h.hum, 2)}<em>%HR</em></b>
            <div class="sp">Consigna: <button class="mini" data-hv="${i}" data-k="spH" data-d="-1" aria-label="Bajar consigna">−</button> ${num(h.spH, 0)} %HR <button class="mini" data-hv="${i}" data-k="spH" data-d="1" aria-label="Subir consigna">+</button></div></div>
        </div></div>`
        )
        .join("") +
      `<div class="meter ${h2cls}">
        <div class="meter-head"><b>⚠ Hidrógeno</b><span class="tag">${h2cls === "ok" ? "Normal" : h2cls === "warn" ? "Aviso" : "Crítico"}</span></div>
        <div class="meter-vals"><div><small>Concentración</small><b>${num(h2, 2)}<em>% LEL</em></b></div></div>
        <div class="h2bar"><i style="width:${Math.min(100, (h2 / 30) * 100)}%"></i><span style="left:${(10 / 30) * 100}%">10 %</span><span style="left:${(25 / 30) * 100}%">25 %</span></div>
        <p class="note">Aviso al 10 % LEL (ventilación forzada) · crítico al 25 % LEL.</p>
      </div>`;
  }

  function drawCharts(st) {
    const B = 5; // minutos por punto
    const n = 1440 / B;
    const nowMin = new Date(st.simTime).getHours() * 60 + new Date(st.simTime).getMinutes();
    const P = new Array(n).fill(null);
    const S = new Array(n).fill(null);
    const SP = new Array(n).fill(null);
    let h = 0;
    let last = null;
    for (let k = 0; k < n; k++) {
      const t = k * B;
      while (h < st.history.length && st.history[h].t <= t) last = st.history[h++];
      if (t <= nowMin && last) {
        P[k] = last.p;
        S[k] = last.soc;
        SP[k] = last.sp;
      } else if (t > nowMin) SP[k] = st.plan.sched[Math.min(N - 1, Math.floor(t / 15))];
    }
    const x = Array.from({ length: n }, (_, k) => fmtHM(k * B));
    const nowIdx = Math.floor(nowMin / B);
    xyChart(root.querySelector("#chP"), {
      x,
      zoom: true,
      xLabelWidth: 56,
      nowIndex: nowIdx,
      series: [
        { name: "Medida", values: P, color: C.s1, markers: false, fmt: (v) => num(v, dp) + " MW" },
        { name: "Consigna / programa", values: SP, color: C.s2, dash: true, step: true, markers: false, fmt: (v) => num(v, dp) + " MW" },
      ],
      y: { min: -a.powerMW * 1.1, max: a.powerMW * 1.1, fmt: (v) => num(v, a.powerMW < 2 ? 2 : 0) },
      height: 200,
    });
    xyChart(root.querySelector("#chS"), {
      x,
      zoom: true,
      xLabelWidth: 56,
      nowIndex: nowIdx,
      series: [{ name: "SOC", values: S, color: C.brand, markers: false, fmt: (v) => pct(v) }],
      y: { min: 0, max: 100, fmt: (v) => v + "%" },
      refLines: [{ value: a.socMin, label: "SOC mín." }, { value: a.socMax, label: "SOC máx." }],
      height: 140,
    });
    const pts = st.history.filter((_, i) => i % 15 === 0).map((hh) => [clamp(hh.p / a.powerMW, -1.1, 1.1), clamp(hh.q / a.powerMW, -1.1, 1.1), fmtHM(hh.t)]);
    scatter(root.querySelector("#chPQ"), {
      series: [
        { name: "Operación real", points: pts, color: C.s1, r: 3.5 },
        { name: "Consigna", points: [[st.sp / a.powerMW, st.qsp / a.powerMW, "actual"]], color: C.s2, r: 5 },
        { name: "Último punto", points: [[st.p / a.powerMW, st.q / a.powerMW, fmtHM(nowMin)]], color: C.neg, r: 6 },
      ],
      xLabel: "P normalizada",
      yLabel: "Q normalizada",
    });
  }

  const unsub = live.subscribe(update);
  return () => unsub();
}
