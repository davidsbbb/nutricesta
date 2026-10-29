// Motor hidráulico: conversión caudal ↔ potencia, balance del embalse y
// plan óptimo de turbinado por programación dinámica sobre el volumen.

import { clamp } from "./util.js";

export const G = 9.81;

// Potencia (MW) a partir de caudal (m³/s), salto neto (m) y rendimiento (0-1)
export const powerOf = (q, H, eta) => (G * q * H * eta) / 1000;
export const flowOf = (p, H, eta) => (p * 1000) / (G * H * eta);
// Energía por hm³ turbinado (MWh/hm³)
export const mwhPerHm3 = (H, eta) => (G * H * eta) / 3.6; // 1 hm³ = 1e9 kg de agua

export function plantDerived(c) {
  const eta = c.eta / 100;
  const qAtPmax = flowOf(c.pmax, c.head, eta);
  const qmax = Math.min(c.qmax || Infinity, qAtPmax);
  const pmax = powerOf(qmax, c.head, eta);
  return {
    eta,
    qmax,
    pmax,
    qmin: flowOf(c.pmin, c.head, eta),
    kwhm3: (G * c.head * eta) / 3600, // kWh por m³
    mwhHm3: mwhPerHm3(c.head, eta),
  };
}

/**
 * Plan óptimo de un día.
 * prices: €/MWh por periodo (24, 96 o días de cambio de hora)
 * opts: { v0 (hm³), vTarget (hm³), inflow: m³/s por periodo, waterValue €/MWh,
 *         strictTarget: bool, blocked: bool[] periodos indisponibles }
 */
export function optimizeDay(c, prices, opts) {
  const n = prices.length;
  const dt = n > 30 ? 0.25 : 1; // h por periodo (cuarto-horario u horario)
  const sec = dt * 3600;
  const d = plantDerived(c);
  const vmin = c.vmin;
  const vmax = Math.max(c.vmax, vmin + 1e-6);
  const K = c.type === "fluyente" ? 40 : 120; // niveles de volumen
  const step = (vmax - vmin) / (K - 1);
  const levelOf = (v) => clamp((v - vmin) / step, 0, K - 1);

  // acciones: parado + escalones entre Pmin y Pmax
  const L = 8;
  const acts = [0];
  for (let i = 0; i < L; i++) {
    const p = c.pmin + ((d.pmax - c.pmin) * i) / (L - 1);
    if (p > 0) acts.push(p);
  }
  const qOf = acts.map((p) => (p > 0 ? flowOf(p, c.head, d.eta) : 0));
  const S = Math.max(1, c.maxStarts || 4); // arranques permitidos
  const startCost = c.startCost || 0;
  const eco = c.qeco || 0;
  const inflow = opts.inflow;
  const wv = opts.waterValue; // €/MWh del agua que queda al final

  // estado: (nivel k, en marcha u, arranques usados s)
  const NS = K * 2 * (S + 1);
  const id = (k, u, s) => (k * 2 + u) * (S + 1) + s;
  const NEG = -1e18;
  let V = new Float64Array(NS);
  const target = opts.vTarget;
  for (let k = 0; k < K; k++) {
    const v = vmin + k * step;
    let term = wv * (v - vmin) * d.mwhHm3;
    if (target != null) {
      const short = Math.max(0, target - v);
      term -= short * d.mwhHm3 * (opts.strictTarget ? 1e5 : wv * 3);
    }
    for (let u = 0; u < 2; u++) for (let s = 0; s <= S; s++) V[id(k, u, s)] = term;
  }
  // interpolación lineal del valor en volumen continuo
  const valAt = (Vf, v, u, s) => {
    const x = levelOf(v);
    const k0 = Math.floor(x);
    const k1 = Math.min(K - 1, k0 + 1);
    const w = x - k0;
    return Vf[id(k0, u, s)] * (1 - w) + Vf[id(k1, u, s)] * w;
  };
  const step1 = (v, t, a) => {
    // volumen siguiente y vertido
    let nv = v + ((inflow[t] - eco - qOf[a]) * sec) / 1e6;
    let spill = 0;
    if (nv > vmax) {
      spill = ((nv - vmax) * 1e6) / sec;
      nv = vmax;
    }
    return { nv, spill };
  };
  const pol = new Array(n);
  for (let t = n - 1; t >= 0; t--) {
    const nV = new Float64Array(NS).fill(NEG);
    const P = new Int8Array(NS);
    const blocked = opts.blocked?.[t];
    for (let k = 0; k < K; k++) {
      const v = vmin + k * step;
      for (let u = 0; u < 2; u++) {
        for (let s = 0; s <= S; s++) {
          let best = NEG;
          let ba = 0;
          for (let a = 0; a < acts.length; a++) {
            if (blocked && a > 0) break;
            const on = a > 0 ? 1 : 0;
            let ns = s;
            let cost = 0;
            if (on && !u) {
              if (s >= S) continue;
              ns = s + 1;
              cost = startCost;
            }
            const { nv } = step1(v, t, a);
            if (nv < vmin - 1e-9) {
              if (a > 0) continue; // no se puede turbinar por debajo del mínimo
            }
            const val = acts[a] * dt * prices[t] - cost + valAt(V, Math.max(nv, vmin), on, ns);
            if (val > best) {
              best = val;
              ba = a;
            }
          }
          nV[id(k, u, s)] = best;
          P[id(k, u, s)] = ba;
        }
      }
    }
    V = nV;
    pol[t] = P;
  }

  // simulación hacia delante con volumen continuo
  const out = { p: [], q: [], v: [opts.v0], spill: [], rev: [], starts: 0 };
  let v = clamp(opts.v0, vmin, vmax);
  let u = opts.startOn ? 1 : 0;
  let s = 0;
  for (let t = 0; t < n; t++) {
    const k = Math.round(levelOf(v));
    let a = pol[t][id(k, u, s)];
    let r = step1(v, t, a);
    // seguridad: si por redondeo bajaría del mínimo, reduce potencia
    while (a > 0 && r.nv < vmin - 1e-9) {
      a--;
      r = step1(v, t, a);
    }
    if (a > 0 && !u) {
      s++;
      out.starts++;
    }
    u = a > 0 ? 1 : 0;
    v = r.nv;
    out.p.push(acts[a]);
    out.q.push(qOf[a]);
    out.spill.push(r.spill);
    out.rev.push(acts[a] * dt * prices[t]);
    out.v.push(v);
  }
  out.dt = dt;
  out.energy = out.p.reduce((x, y) => x + y * dt, 0);
  out.revenue = out.rev.reduce((x, y) => x + y, 0);
  out.water = out.q.reduce((x, y) => x + (y * sec) / 1e6, 0); // hm³ turbinados
  out.spilled = out.spill.reduce((x, y) => x + (y * sec) / 1e6, 0);
  out.captured = out.energy > 0 ? out.revenue / out.energy : null;
  out.vEnd = v;
  return out;
}

// Referencia: turbinar el mismo volumen de agua de forma plana todo el día
export function flatPlan(c, prices, waterHm3, inflow, opts) {
  const n = prices.length;
  const dt = n > 30 ? 0.25 : 1;
  const d = plantDerived(c);
  const q = clamp((waterHm3 * 1e6) / (24 * 3600), 0, d.qmax);
  const p = powerOf(q, c.head, d.eta);
  let rev = 0;
  for (let t = 0; t < n; t++) if (!opts.blocked?.[t]) rev += p * dt * prices[t];
  void inflow;
  return { p, revenue: rev, energy: p * 24 };
}

// Precios de ejemplo cuando aún no hay datos oficiales (claramente marcados)
export function samplePrices(dateKey, n = 96) {
  let h = 0;
  for (const ch of dateKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const base = 60 + rnd() * 30;
  return Array.from({ length: n }, (_, i) => {
    const hr = (i + 0.5) * (24 / n);
    const sun = hr > 8 && hr < 19 ? Math.sin((Math.PI * (hr - 8)) / 11) : 0;
    return Math.max(0, base + 22 * Math.exp(-(((hr - 8.5) / 1.4) ** 2)) + 45 * Math.exp(-(((hr - 21) / 1.8) ** 2)) - 55 * sun + (rnd() - 0.5) * 6);
  });
}
