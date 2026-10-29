// Motor de simulación BESS: precios de mercado, despacho óptimo (programación
// dinámica), servicios de ajuste (banda aFRR), desvíos, eficiencias y SOH.

import { hashStr, rng, gauss, clamp, sum, mean, parseKey, addDays, daysBetween, todayKey } from "./util.js";

export const N = 96; // intervalos de 15 min (MTU OMIE)
export const DT = 0.25; // h

const cache = new Map();
export function clearCache() {
  cache.clear();
}

function dayOfYear(key) {
  const d = parseKey(key);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.round((d - start) / 86400000);
}

// Perfil solar normalizado (0..1) por intervalo
export function solarProfile(key) {
  const doy = dayOfYear(key);
  const daylen = 12 + 3.2 * Math.cos((2 * Math.PI * (doy - 172)) / 365);
  const noon = 14; // hora local peninsular aprox.
  const rise = noon - daylen / 2;
  const r = rng(hashStr("sun" + key));
  const cloud = clamp(0.75 + 0.35 * r() - (r() < 0.15 ? 0.4 : 0), 0.25, 1);
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    const h = (i + 0.5) * DT;
    const x = (h - rise) / daylen;
    out[i] = x > 0 && x < 1 ? Math.pow(Math.sin(Math.PI * x), 1.3) * cloud : 0;
  }
  return out;
}

// Mercado diario (OMIE), banda aFRR, energía de activación y precio de desvío
export function marketDay(key, imported) {
  const doy = dayOfYear(key);
  const d = parseKey(key);
  const r = rng(hashStr("mkt" + key));
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const sun = solarProfile(key);
  const base =
    72 + 22 * Math.cos((2 * Math.PI * (doy - 15)) / 365) + 9 * Math.sin((2 * Math.PI * doy) / 83) - (weekend ? 14 : 0) + gauss(r) * 11;
  const spring = 0.6 + 0.4 * Math.cos((2 * Math.PI * (doy - 120)) / 365);
  const solarDepth = (40 + 30 * spring) * (0.8 + 0.4 * r());
  const da = new Array(N);
  let ar = 0;
  for (let i = 0; i < N; i++) {
    const h = (i + 0.5) * DT;
    ar = 0.85 * ar + gauss(r) * 2.2;
    const morning = 20 * Math.exp(-(((h - 8.5) / 1.3) ** 2));
    const evening = 42 * Math.exp(-(((h - 21) / 1.7) ** 2));
    const night = -12 * Math.exp(-(((h - 4) / 2.2) ** 2));
    da[i] = Math.max(-2, base + morning + evening + night - solarDepth * sun[i] + ar);
  }
  if (imported && imported.length) {
    const src = imported.length === 24 ? Array.from({ length: N }, (_, i) => imported[Math.floor(i / 4)]) : imported;
    for (let i = 0; i < N; i++) if (src[i] != null && !Number.isNaN(src[i])) da[i] = src[i];
  }
  const band = new Array(24);
  for (let h = 0; h < 24; h++) {
    const peak = Math.exp(-(((h - 20) / 3) ** 2)) + 0.6 * Math.exp(-(((h - 8) / 2) ** 2));
    band[h] = Math.max(3, 22 + 16 * peak + gauss(r) * 6);
  }
  const up = [];
  const down = [];
  const imb = [];
  const rUp = [];
  const rDown = [];
  for (let i = 0; i < N; i++) {
    up[i] = da[i] * 1.12 + 12 + Math.abs(gauss(r)) * 10;
    down[i] = Math.max(-5, da[i] * 0.7 - 5 - Math.abs(gauss(r)) * 8);
    imb[i] = da[i] + gauss(r) * 22;
    rUp[i] = clamp(0.12 + gauss(r) * 0.1, 0, 0.6);
    rDown[i] = clamp(0.13 + gauss(r) * 0.1, 0, 0.6);
  }
  return { da, band, up, down, imb, rUp, rDown, sun };
}

// Programación dinámica exacta sobre niveles discretos de SOC con límite de ciclos.
// Devuelve potencia en red (MW, + descarga / - carga) y nivel de energía almacenada.
export function dpArbitrage(price, { P, Eusable, etaC, etaD, maxCycles, degCost, canCharge, avail }) {
  const empty = { p: new Array(N).fill(0), stored: new Array(N + 1).fill(0), value: 0 };
  if (P <= 0 || Eusable <= 0) return empty;
  let u = P * DT * etaC; // MWh almacenados por intervalo a plena carga
  let L = Math.floor(Eusable / u + 1e-9);
  let Pc = P;
  if (L < 1) {
    L = 1;
    u = Eusable;
    Pc = u / (DT * etaC);
  }
  const D = Math.max(1, Math.floor((maxCycles * Eusable) / u + 1e-9));
  const S = (L + 1) * (D + 1);
  const idx = (l, d) => l * (D + 1) + d;
  let V = new Float64Array(S).fill(-1e15);
  for (let d = 0; d <= D; d++) V[idx(0, d)] = 0; // terminar vacía (mismo estado que al inicio)
  const pol = new Array(N);
  const dis = u * etaD;
  for (let t = N - 1; t >= 0; t--) {
    const nV = new Float64Array(S).fill(-1e15);
    const act = new Int8Array(S);
    const ok = avail ? avail[t] : true;
    const chg = ok && (!canCharge || canCharge[t]);
    for (let l = 0; l <= L; l++) {
      for (let d = 0; d <= D; d++) {
        const s = idx(l, d);
        let best = V[s];
        let a = 0;
        if (chg && l < L) {
          const v = V[idx(l + 1, d)] - price[t] * Pc * DT;
          if (v > best) {
            best = v;
            a = 1;
          }
        }
        if (ok && l > 0 && d < D) {
          const v = V[idx(l - 1, d + 1)] + (price[t] - degCost) * dis;
          if (v > best) {
            best = v;
            a = -1;
          }
        }
        nV[s] = best;
        act[s] = a;
      }
    }
    V = nV;
    pol[t] = act;
  }
  const p = new Array(N);
  const stored = new Array(N + 1);
  let l = 0;
  let d = 0;
  stored[0] = 0;
  let value = 0;
  for (let t = 0; t < N; t++) {
    const a = pol[t][idx(l, d)];
    if (a === 1) {
      p[t] = -Pc;
      l++;
      value -= price[t] * Pc * DT;
    } else if (a === -1) {
      p[t] = dis / DT;
      l--;
      d++;
      value += price[t] * dis;
    } else p[t] = 0;
    stored[t + 1] = l * u;
  }
  return { p, stored, value };
}

function effParams(a) {
  const rte = clamp(a.rte / 100, 0.5, 0.99);
  const inv = clamp(a.invEff / 100, 0.8, 0.999);
  const bat = clamp(rte / (inv * inv), 0.5, 0.999);
  const eta = Math.sqrt(rte);
  return { rte, inv, bat, etaC: eta, etaD: eta };
}

function assetHash(a) {
  return JSON.stringify([a.id, a.powerMW, a.energyMWh, a.rte, a.invEff, a.socMin, a.socMax, a.maxCycles, a.degCost, a.strategy, a.bandShare, a.type, a.pvMWp, a.availability, a.imbalanceErr, a.overcost, a.commissioning]);
}

export function sohAt(a, key) {
  const days = Math.max(0, (parseKey(key) - parseKey(a.commissioning || key)) / 86400000);
  const efcPerDay = Math.min(a.maxCycles, 1.1);
  return clamp(100 - days * efcPerDay * 0.0035 - (days / 365) * 1.2, 60, 100);
}

// Simulación completa de un día
export function simulateDay(a, key, importedPrices) {
  const ck = assetHash(a) + key + (importedPrices ? importedPrices.join(",").length : "");
  if (cache.has(ck)) return cache.get(ck);
  const today = todayKey();
  const m = marketDay(key, importedPrices);
  const r = rng(hashStr("op" + a.id + key));
  const { etaC, etaD, inv, bat, rte } = effParams(a);
  const E = a.energyMWh * (sohAt(a, key) / 100);
  const Eusable = (E * (a.socMax - a.socMin)) / 100;
  const share = a.strategy === "omie" ? 0 : a.strategy === "aaii" ? 1 : clamp(a.bandShare / 100, 0, 1);

  // Indisponibilidad: ventana de parada aleatoria
  const avail = new Array(N).fill(true);
  let unavailH = 0;
  if (r() > a.availability / 100 + 0.01) {
    const start = Math.floor(r() * 80);
    const len = 8 + Math.floor(r() * 32);
    for (let i = start; i < Math.min(N, start + len); i++) avail[i] = false;
    unavailH = (Math.min(N, start + len) - start) * DT;
  }

  // Carga solo desde FV en híbridas
  const pv = m.sun.map((s) => s * (a.pvMWp || 0));
  const canCharge = a.type === "hybrid" ? pv.map((x) => x >= a.powerMW * (1 - share) * 0.98) : null;

  const arb = dpArbitrage(m.da, {
    P: a.powerMW * (1 - share),
    Eusable: Eusable * (1 - share),
    etaC,
    etaD,
    maxCycles: a.maxCycles,
    degCost: a.degCost,
    canCharge,
    avail,
  });
  // Referencia teórica: arbitraje puro a plena potencia, misma restricción de ciclos
  const full = share === 0 ? arb : dpArbitrage(m.da, { P: a.powerMW, Eusable, etaC, etaD, maxCycles: a.maxCycles, degCost: 0, canCharge, avail: null });

  // Banda aFRR
  const Pb = a.powerMW * share;
  const Eb = Eusable * share;
  let bandStored = Eb * 0.5;
  const pBand = new Array(N).fill(0);
  let bandRev = 0;
  let actRev = 0;
  let recovCost = 0;
  const bandMW = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const h = Math.floor(i / 4);
    if (Pb <= 0 || !avail[i]) continue;
    bandMW[i] = Pb;
    bandRev += m.band[h] * Pb * DT;
    let upE = m.rUp[i] * Pb * DT; // MWh entregados
    let dnE = m.rDown[i] * Pb * DT; // MWh absorbidos
    upE = Math.min(upE, (bandStored * etaD));
    bandStored -= upE / etaD;
    dnE = Math.min(dnE, Math.max(0, (Eb - bandStored) / etaC));
    bandStored += dnE * etaC;
    actRev += upE * m.up[i] - dnE * m.down[i];
    // Recuperación de SOC hacia el 50 %
    let rec = 0;
    if (bandStored < Eb * 0.35) rec = Math.min(Pb * 0.25 * DT, (Eb * 0.5 - bandStored) / etaC);
    else if (bandStored > Eb * 0.65) rec = -Math.min(Pb * 0.25 * DT, (bandStored - Eb * 0.5) * etaD);
    if (rec > 0) {
      bandStored += rec * etaC;
      recovCost += rec * m.da[i];
    } else if (rec < 0) {
      bandStored += rec / etaD;
      recovCost += rec * m.da[i];
    }
    pBand[i] = (upE - dnE - rec) / DT;
  }
  const bandEnd = bandStored;

  // Programa, medida y desvíos
  const sched = new Array(N);
  const meas = new Array(N);
  const socArr = new Array(N + 1);
  let omieRev = 0;
  let imbCost = 0;
  let over = 0;
  let schedAbs = 0;
  let devSigned = 0;
  let impAC = 0;
  let expAC = 0;
  const errK = a.imbalanceErr / 100;
  let storedB = Eb * 0.5;
  socArr[0] = a.socMin + ((arb.stored[0] + storedB) / E) * 100;
  for (let i = 0; i < N; i++) {
    sched[i] = arb.p[i] + pBand[i];
    omieRev += arb.p[i] * DT * m.da[i];
    const noise = (gauss(r) * errK * Math.abs(arb.p[i]) + gauss(r) * 0.01 * a.powerMW) * (r() < 0.05 ? 3 : 1);
    meas[i] = avail[i] ? sched[i] + noise : 0;
    const devE = (meas[i] - (avail[i] ? sched[i] : 0)) * DT;
    devSigned += devE;
    schedAbs += Math.abs(sched[i] * DT);
    imbCost -= Math.abs(devE) * Math.abs(m.imb[i] - m.da[i]);
    over -= Math.abs(devE) * a.overcost;
    if (meas[i] > 0) expAC += meas[i] * DT;
    else impAC -= meas[i] * DT;
    const e = pBand[i] * DT;
    storedB += e >= 0 ? -e / etaD : -e * etaC;
    storedB = clamp(storedB, 0, Eb);
    socArr[i + 1] = clamp(a.socMin + ((arb.stored[i + 1] + storedB) / E) * 100, 0, 100);
  }
  const aaiiRev = bandRev + actRev - recovCost;
  const total = omieRev + aaiiRev + imbCost + over;

  // Eficiencias medidas (con ruido de medida)
  const dStored = (arb.stored[N] + bandEnd - (arb.stored[0] + Eb * 0.5));
  const rteRaw = impAC > 1e-6 ? (expAC / impAC) * 100 : null;
  const rteCorr = impAC > 1e-6 ? ((expAC + Math.max(0, dStored) * etaD) / (impAC + Math.max(0, -dStored) / etaC)) * 100 : null;
  const invM = clamp(inv * 100 + gauss(r) * 0.25, 90, 99.9);
  const batM = clamp(bat * 100 + gauss(r) * 0.6, 80, 100);

  const sorted = [...m.da].sort((x, y) => x - y);
  const k = Math.max(1, Math.round(Eusable / (a.powerMW * DT * etaC)));
  const bot = mean(sorted.slice(0, k));
  const top = mean(sorted.slice(-k));

  const isFuture = key > today;
  const isToday = key === today;
  const telemetry = !isFuture && rng(hashStr("tel" + a.id + key))() > 0.03;
  const efc = Eusable > 0 ? expAC / (E * etaD) : 0;

  const res = {
    key,
    isToday,
    isFuture,
    complete: !isFuture && !isToday,
    telemetry,
    market: m,
    pv,
    sched,
    meas,
    soc: socArr,
    bandMW,
    avail,
    unavailH,
    revenue: { omie: omieRev, aaii: aaiiRev, band: bandRev, act: actRev - recovCost, imb: imbCost, over, total },
    energy: { imp: impAC, exp: expAC, net: expAC - impAC },
    devPct: schedAbs > 0 ? (devSigned / schedAbs) * 100 : 0,
    devAbs: devSigned,
    eff: { rte: rteRaw, rteCorr: rteCorr != null ? Math.min(rteCorr, 100) : null, bat: batM, inv: invM },
    efc,
    soh: sohAt(a, key),
    avgSoc: mean(socArr),
    price: { avg: mean(m.da), max: Math.max(...m.da), min: Math.min(...m.da), top, bot, spread: Math.max(...m.da) - Math.min(...m.da) },
    theo: { fullDp: full.value, E, Eusable, etaC, etaD, rte },
  };
  cache.set(ck, res);
  return res;
}

// Agregación de un periodo
export function aggregate(a, from, to, prices = {}) {
  const keys = daysBetween(from, to);
  const days = keys.map((k) => simulateDay(a, k, prices[k]));
  const done = days.filter((d) => d.complete);
  const tel = done.filter((d) => d.telemetry);
  const T = (f) => sum(done.map(f));
  const exp = sum(tel.map((d) => d.energy.exp));
  const imp = sum(tel.map((d) => d.energy.imp));
  const totals = {
    days: keys.length,
    daysRevenue: done.length,
    daysTelemetry: tel.length,
    daysSoc: days.filter((d) => !d.isFuture && (d.telemetry || d.isToday)).length,
    total: T((d) => d.revenue.total),
    omie: T((d) => d.revenue.omie),
    aaii: T((d) => d.revenue.aaii),
    band: T((d) => d.revenue.band),
    act: T((d) => d.revenue.act),
    imb: T((d) => d.revenue.imb),
    over: T((d) => d.revenue.over),
    exp,
    imp,
    efc: sum(tel.map((d) => d.efc)),
    rte: imp > 0 ? Math.min(100, mean(tel.map((d) => d.eff.rteCorr))) : null,
    bat: mean(tel.map((d) => d.eff.bat)),
    inv: mean(tel.map((d) => d.eff.inv)),
    soh: days.length ? days.filter((d) => !d.isFuture).slice(-1)[0]?.soh ?? null : null,
    devPct: (() => {
      const s = sum(done.map((d) => d.devAbs));
      const b = sum(done.map((d) => sum(d.sched.map((x) => Math.abs(x * DT)))));
      return b > 0 ? (s / b) * 100 : 0;
    })(),
    unavailH: T((d) => d.unavailH),
    avgPrice: mean(done.map((d) => d.price.avg)),
  };
  totals.perMWh = a.energyMWh > 0 ? totals.total / a.energyMWh : 0;
  totals.perMW = a.powerMW > 0 ? totals.total / a.powerMW : 0;
  totals.avgDaily = done.length ? totals.total / done.length : 0;
  const best = done.reduce((b, d) => (!b || d.revenue.total > b.revenue.total ? d : b), null);
  totals.best = best ? { key: best.key, value: best.revenue.total } : null;
  return { keys, days, totals };
}

export function previousPeriod(from, to) {
  const n = daysBetween(from, to).length;
  return { from: addDays(from, -n), to: addDays(from, -1) };
}

// Cascada de spread normalizada en € por MWh instalado y día
export function spreadWaterfall(a, agg) {
  const done = agg.days.filter((d) => d.complete);
  if (!done.length) return null;
  const n = done.length;
  const E = a.energyMWh;
  const S0 = mean(done.map((d) => d.price.spread));
  const S1 = mean(done.map((d) => d.price.top - d.price.bot));
  const usableFrac = (a.socMax - a.socMin) / 100;
  const S2 = mean(done.map((d) => (d.price.top * d.theo.etaD - d.price.bot / d.theo.etaC) * usableFrac));
  const availFrac = 1 - sum(done.map((d) => d.unavailH)) / (n * 24);
  const S3 = S2 * availFrac;
  const S4 = mean(done.map((d) => d.theo.fullDp / E)) * availFrac;
  const S5 = agg.totals.omie / E / n;
  const aaii = agg.totals.aaii / E / n;
  const imb = (agg.totals.imb + agg.totals.over) / E / n;
  const fin = agg.totals.total / E / n;
  return [
    { label: "Spread máximo", value: S0, type: "base", hint: "Media diaria de (precio máx − precio mín) del mercado diario." },
    { label: "Operación física", value: S1 - S0, type: "delta", hint: "Pérdida por la duración: la batería no puede cargar/descargar todo en un solo cuarto de hora." },
    { label: "Spread viable", value: S1, type: "subtotal", hint: "Media de los mejores intervalos de descarga menos los más baratos de carga, para la duración del activo." },
    { label: "Pérdidas implícitas", value: S2 - S1, type: "delta", hint: "Eficiencia de ida y vuelta y ventana de SOC utilizable." },
    { label: "Spread alcanzable", value: S2, type: "subtotal", hint: "Lo que queda tras pérdidas físicas, por MWh instalado." },
    { label: "Indisponibilidad", value: S3 - S2, type: "delta", hint: "Horas de parada del activo en el periodo." },
    { label: "Estrategia de ciclado", value: S4 - S3, type: "delta", hint: "Valor del despacho óptimo con el límite de ciclos/día y coste de degradación frente a un único ciclo." },
    { label: "Estrategia de mercado", value: S5 - S4, type: "delta", hint: "Potencia/energía reservada para servicios de ajuste en lugar de arbitraje OMIE." },
    { label: "Spread OMIE", value: S5, type: "subtotal", hint: "Ingreso real de arbitraje en mercado diario." },
    { label: "Servicios ajuste", value: aaii, type: "delta", hint: "Banda aFRR + energía de activación − recuperación de SOC." },
    { label: "Desvíos", value: imb, type: "delta", hint: "Coste de desvíos + sobrecoste." },
    { label: "Spread final", value: fin, type: "final", hint: "Ingreso neto total por MWh instalado y día." },
  ];
}

// Importación de precios: CSV "fecha;hora|periodo;precio" o "timestamp,precio"
export function parsePriceCsv(text) {
  const out = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/[;,\t]/).map((s) => s.trim().replace(/"/g, ""));
    if (parts.length < 2) continue;
    let date;
    let idx;
    let price;
    const iso = parts[0].match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    const es = parts[0].match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/);
    if (iso) {
      date = `${iso[1]}-${iso[2]}-${iso[3]}`;
      if (iso[4] != null) {
        idx = Number(iso[4]) * 4 + Math.floor(Number(iso[5]) / 15);
        price = parts[1];
      }
    } else if (es) {
      date = `${es[3]}-${es[2]}-${es[1]}`;
      if (es[4] != null) {
        idx = Number(es[4]) * 4 + Math.floor(Number(es[5]) / 15);
        price = parts[1];
      }
    } else continue;
    if (idx == null) {
      // fecha;periodo(1..24 o 1..96);precio
      const per = Number(parts[1]);
      price = parts[2];
      if (!per || price == null) continue;
      idx = per <= 24 && parts.length >= 3 && !line.includes(":") ? (per - 1) * 4 : per - 1;
      if (per <= 24) {
        const v = parseFloat(String(price).replace(",", "."));
        if (Number.isNaN(v)) continue;
        out[date] = out[date] || new Array(N).fill(null);
        for (let j = 0; j < 4; j++) if (out[date][idx + j] == null) out[date][idx + j] = v;
        continue;
      }
    }
    const v = parseFloat(String(price).replace(",", "."));
    if (Number.isNaN(v) || idx < 0 || idx >= N) continue;
    out[date] = out[date] || new Array(N).fill(null);
    out[date][idx] = v;
  }
  // rellena huecos hacia delante
  for (const k of Object.keys(out)) {
    let last = null;
    out[k] = out[k].map((v) => (v == null ? last : (last = v)));
    const first = out[k].find((v) => v != null);
    out[k] = out[k].map((v) => (v == null ? first : v));
  }
  return out;
}
