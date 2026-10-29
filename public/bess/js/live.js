// Motor de tiempo real: sigue el programa del día (modo automático) o la
// consigna manual, integra SOC, temperatura y alarmas. Opcionalmente lee
// telemetría real de una API REST (JSON).

import { simulateDay, N, DT } from "./model.js";
import { store } from "./store.js";
import { clamp, dayKey, gauss, rng } from "./util.js";

const subs = new Set();
let st = null;
let timer = null;
let apiTimer = null;
const noise = rng(12345);

function minutesOf(d) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function init() {
  const a = store.asset();
  const now = new Date();
  const key = dayKey(now);
  const plan = simulateDay(a, key, store.get().prices[key]);
  const mins = minutesOf(now);
  const i = Math.min(N - 1, Math.floor(mins / 15));
  const frac = (mins % 15) / 15;
  const soc = plan.soc[i] + (plan.soc[i + 1] - plan.soc[i]) * frac;
  const history = [];
  let exp = 0;
  let imp = 0;
  for (let k = 0; k <= i; k++) {
    const p = plan.meas[k];
    const w = k === i ? frac : 1;
    if (p > 0) exp += p * DT * w;
    else imp -= p * DT * w;
    history.push({ t: k * 15, p, sp: plan.sched[k], soc: plan.soc[k], q: gauss(noise) * 0.01 * a.powerMW });
  }
  const prevSim = st;
  st = {
    assetId: a.id,
    key,
    plan,
    simTime: now.getTime(),
    soc,
    p: plan.meas[i],
    q: 0,
    sp: plan.sched[i],
    qsp: 0,
    mode: prevSim?.assetId === a.id ? prevSim.mode : "auto",
    manualSp: prevSim?.assetId === a.id ? prevSim.manualSp : 0,
    breaker: true,
    estop: false,
    temp: 22 + Math.abs(plan.meas[i]) / a.powerMW * 4,
    ambient: 19,
    ppc: prevSim?.ppc || { p: true, q: false, v: false, pf: true },
    history,
    exp,
    imp,
    connection: "online",
    alarms: { fire: false, intrusion: false, minSoc: false, maxTemp: false },
    lastSample: Math.floor(mins),
    source: store.get().realtime.source,
  };
}

function emitAlarm(type, active, msg) {
  if (st.alarms[type] === active) return;
  st.alarms[type] = active;
  const a = store.asset();
  store.pushAlarm({ type, active, asset: a.name, msg: active ? msg : `${msg} — normalizado` , level: type === "fire" ? "critical" : type === "intrusion" ? "serious" : "warning" });
}

function tick() {
  if (!st || st.assetId !== store.asset().id) init();
  const a = store.asset();
  const speed = store.get().realtime.speed || 1;
  st.simTime += 1000 * speed;
  const now = new Date(st.simTime);
  if (dayKey(now) !== st.key) {
    // cambio de día: regenera el programa
    const keepMode = st.mode;
    st = null;
    init();
    st.mode = keepMode;
    st.simTime = now.getTime();
  }
  const mins = minutesOf(now);
  const i = Math.min(N - 1, Math.floor(mins / 15));
  const dtH = speed / 3600;
  const etaC = Math.sqrt(a.rte / 100);
  const etaD = etaC;
  const E = a.energyMWh * (st.plan.soh / 100);

  if (st.source !== "api") {
    let sp = 0;
    if (st.mode === "auto") sp = st.plan.sched[i];
    else if (st.mode === "manual") sp = st.manualSp;
    if (!st.ppc.p) sp = st.mode === "auto" ? st.plan.sched[i] : sp;
    if (st.estop || !st.breaker || st.mode === "standby" || !st.plan.avail[i]) sp = 0;
    sp = clamp(sp, -a.powerMW, a.powerMW);
    if (st.soc <= a.socMin + 0.05 && sp > 0) sp = 0;
    if (st.soc >= a.socMax - 0.05 && sp < 0) sp = 0;
    st.sp = sp;
    const ramp = a.powerMW * 0.2 * speed; // 20 %/s
    const target = sp + (sp !== 0 ? gauss(noise) * 0.004 * a.powerMW : 0);
    st.p += clamp(target - st.p, -ramp, ramp);
    if (Math.abs(st.p) < 1e-4) st.p = 0;
    st.q = st.ppc.q ? st.qsp + gauss(noise) * 0.003 * a.powerMW : gauss(noise) * 0.002 * a.powerMW;
    // integración SOC
    if (st.p > 0) {
      st.soc -= ((st.p * dtH) / etaD / E) * 100;
      st.exp += st.p * dtH;
    } else if (st.p < 0) {
      st.soc += ((-st.p * dtH * etaC) / E) * 100;
      st.imp += -st.p * dtH;
    }
    st.soc = clamp(st.soc, 0, 100);
    const heat = st.ambient + 3 + (Math.abs(st.p) / a.powerMW) * 9;
    st.temp += (heat - st.temp) * Math.min(1, 0.002 * speed) + gauss(noise) * 0.01;
  }

  // alarmas
  emitAlarm("minSoc", st.soc <= a.socMin + 1, `SOC mínimo alcanzado (${st.soc.toFixed(1)} %)`);
  emitAlarm("maxTemp", st.temp >= 45, `Temperatura de celda alta (${st.temp.toFixed(1)} ºC)`);
  if (st.temp >= 60 && !st.alarms.fire) {
    emitAlarm("fire", true, "Alarma de incendios: temperatura crítica, disparo de interruptor");
    st.breaker = false;
    st.estop = true;
  }

  // muestreo histórico (1 por minuto simulado)
  const mm = Math.floor(mins);
  if (mm !== st.lastSample) {
    st.lastSample = mm;
    st.history.push({ t: mm, p: st.p, sp: st.sp, soc: st.soc, q: st.q });
    if (st.history.length > 3000) st.history.splice(0, st.history.length - 3000);
  }
  subs.forEach((fn) => fn(st));
}

async function pollApi() {
  const cfg = store.get().realtime;
  if (cfg.source !== "api" || !cfg.url || !st) return;
  try {
    st.connection = st.connection === "online" ? "online" : "connecting";
    const res = await fetch(cfg.url, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const j = await res.json();
    if (j.soc != null) st.soc = +j.soc;
    if (j.p_mw != null) st.p = +j.p_mw;
    if (j.q_mvar != null) st.q = +j.q_mvar;
    if (j.setpoint_mw != null) st.sp = +j.setpoint_mw;
    if (j.temp_c != null) st.temp = +j.temp_c;
    if (j.energy_exported_mwh != null) st.exp = +j.energy_exported_mwh;
    if (j.energy_imported_mwh != null) st.imp = +j.energy_imported_mwh;
    if (j.alarms) {
      if (j.alarms.fire != null) emitAlarm("fire", !!j.alarms.fire, "Alarma de incendios (campo)");
      if (j.alarms.intrusion != null) emitAlarm("intrusion", !!j.alarms.intrusion, "Alarma de intrusión (campo)");
    }
    st.connection = "online";
  } catch {
    st.connection = "offline";
  }
}

export const live = {
  start() {
    if (!st) init();
    if (!timer) timer = setInterval(tick, 1000);
    if (!apiTimer) apiTimer = setInterval(pollApi, 5000);
    tick();
  },
  state: () => st,
  subscribe(fn) {
    subs.add(fn);
    if (st) fn(st);
    return () => subs.delete(fn);
  },
  restart() {
    st = null;
    init();
    tick();
  },
  setSource(source) {
    if (st) st.source = source;
    if (source === "api") {
      st.connection = "connecting";
      pollApi();
    } else st.connection = "online";
  },
  setMode(mode) {
    st.mode = mode;
    if (mode === "manual") st.manualSp = Math.round(st.sp * 1000) / 1000;
    tick();
  },
  setManual(v) {
    st.manualSp = v;
    if (st.mode !== "manual") st.mode = "manual";
    tick();
  },
  setQ(v) {
    st.qsp = v;
  },
  togglePpc(k) {
    st.ppc = { ...st.ppc, [k]: !st.ppc[k] };
    tick();
  },
  setBreaker(v) {
    if (v && (st.estop || st.alarms.fire)) return false;
    st.breaker = v;
    tick();
    return true;
  },
  emergencyStop() {
    st.estop = true;
    st.breaker = false;
    store.pushAlarm({ type: "estop", active: true, asset: store.asset().name, msg: "Paro de emergencia activado por el operador", level: "serious" });
    tick();
  },
  rearm() {
    if (st.alarms.fire) emitAlarm("fire", false, "Alarma de incendios");
    st.estop = false;
    st.breaker = true;
    st.temp = Math.min(st.temp, 30);
    store.pushAlarm({ type: "estop", active: false, asset: store.asset().name, msg: "Sistema rearmado por el operador", level: "good" });
    tick();
  },
  testAlarm(type) {
    if (type === "fire") st.temp = 61;
    if (type === "intrusion") emitAlarm("intrusion", !st.alarms.intrusion, "Alarma de intrusión: puerta de contenedor abierta");
    tick();
  },
};
