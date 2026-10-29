// Motor de planificación hidráulica basado en COTA (m s.n.m.).
// Cada grupo se describe por lo que se observa en el SCADA: cuántos cm/h baja
// la cota del embalse con el grupo a plena carga. La aportación natural se
// expresa en cm/día (lo que subiría la cota sin turbinar).

import { clamp } from "./util.js";

export function totals(plant) {
  const g = plant.groups || [];
  const pmax = g.reduce((s, x) => s + (+x.pmax || 0), 0);
  const cmh = g.reduce((s, x) => s + (+x.cmh || 0), 0);
  return { pmax, cmh, mwhPerCm: cmh > 0 ? pmax / cmh : 0 };
}

// Combinaciones válidas de grupos respetando dependencias ("G2 necesita G1")
export function actionsOf(plant) {
  const gs = plant.groups || [];
  const acts = [{ on: [], p: 0, cmh: 0, gp: {} }];
  const n = gs.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const on = gs.filter((_, i) => mask & (1 << i));
    const ids = new Set(on.map((g) => g.id));
    if (on.some((g) => g.requires && !ids.has(g.requires))) continue;
    // niveles de carga: fijo = plena carga; regulable = mínimo, medio y máximo
    let combos = [{}];
    for (const g of on) {
      const levels = g.mode === "regulable" && +g.pmin > 0 && +g.pmin < +g.pmax ? [+g.pmin, (+g.pmin + +g.pmax) / 2, +g.pmax] : [+g.pmax];
      const next = [];
      for (const c of combos) for (const l of levels) next.push({ ...c, [g.id]: l });
      combos = next;
    }
    for (const gp of combos) {
      let p = 0;
      let cmh = 0;
      for (const g of on) {
        p += gp[g.id];
        cmh += (+g.cmh || 0) * (gp[g.id] / (+g.pmax || 1));
      }
      acts.push({ on: on.map((g) => g.id), p, cmh, gp });
    }
  }
  return acts;
}

/**
 * Plan óptimo de un día.
 * prices: €/MWh por periodo; opt: {
 *   cota0 (m), aportCmH: cm/h por periodo (natural + cascada), target (m) | null,
 *   waterValue €/MWh, strict, blocked[], forced[], startOn }
 */
export function optimizeDay(plant, prices, opt) {
  const n = prices.length;
  const dt = 24 / n;
  const acts = actionsOf(plant);
  const tot = totals(plant);
  const cmin = +plant.cotaMin;
  const cmax = Math.max(+plant.cotaMax, cmin + 0.01);
  const rangeCm = (cmax - cmin) * 100;
  const K = clamp(Math.round(rangeCm) + 1, 40, 220);
  const stepCm = rangeCm / (K - 1);
  const S = Math.max(1, +plant.maxStarts || 4);
  const NS = K * 2 * (S + 1);
  const id = (k, u, s) => (k * 2 + u) * (S + 1) + s;
  const NEG = -1e18;
  const lvl = (cm) => clamp(cm / stepCm, 0, K - 1); // cm sobre cota mínima
  const wv = opt.waterValue;
  const mwhPerCm = tot.mwhPerCm;
  const targetCm = opt.target != null ? (opt.target - cmin) * 100 : null;
  // Penalización por arranque: evita marchas muy cortas. Por defecto equivale a
  // 30 min de producción a plena carga valorada al valor del agua.
  const startCost = plant.minRunMin === 0 ? 0 : tot.pmax * ((+plant.minRunMin || 30) / 60) * Math.max(wv, 1) * 0.5;

  let V = new Float64Array(NS);
  for (let k = 0; k < K; k++) {
    const cm = k * stepCm;
    let term = wv * cm * mwhPerCm;
    if (targetCm != null) {
      const short = Math.max(0, targetCm - cm);
      term -= short * mwhPerCm * (opt.strict ? 1e5 : Math.max(wv, 1) * 3);
    }
    for (let u = 0; u < 2; u++) for (let s = 0; s <= S; s++) V[id(k, u, s)] = term;
  }
  const valAt = (Vf, cm, u, s) => {
    const x = lvl(cm);
    const k0 = Math.floor(x);
    const k1 = Math.min(K - 1, k0 + 1);
    const w = x - k0;
    return Vf[id(k0, u, s)] * (1 - w) + Vf[id(k1, u, s)] * w;
  };
  const move = (cm, t, a) => {
    let nc = cm + (opt.aportCmH[t] - acts[a].cmh) * dt;
    let spill = 0;
    if (nc > rangeCm) {
      spill = nc - rangeCm;
      nc = rangeCm;
    }
    return { nc, spill };
  };
  const pol = new Array(n);
  for (let t = n - 1; t >= 0; t--) {
    const nV = new Float64Array(NS).fill(NEG);
    const P = new Int16Array(NS);
    const blocked = opt.blocked?.[t];
    const forced = opt.forced?.[t];
    for (let k = 0; k < K; k++) {
      const cm = k * stepCm;
      for (let u = 0; u < 2; u++) {
        for (let s = 0; s <= S; s++) {
          let best = NEG;
          let ba = 0;
          for (let a = 0; a < acts.length; a++) {
            const on = a > 0 ? 1 : 0;
            if (blocked && on) break;
            if (forced && !on && !blocked) continue;
            let ns = s;
            if (on && !u) {
              if (s >= S) continue;
              ns = s + 1;
            }
            const { nc } = move(cm, t, a);
            if (on && nc < -1e-9) continue; // no turbinar por debajo de la cota mínima
            const val = acts[a].p * dt * prices[t] - (ns > s ? startCost : 0) + valAt(V, Math.max(nc, 0), on, ns);
            if (val > best) {
              best = val;
              ba = a;
            }
          }
          if (best === NEG) {
            // sin opción válida (p. ej. riego obligatorio sin agua): parar
            best = valAt(V, Math.max(move(cm, t, 0).nc, 0), 0, s);
            ba = 0;
          }
          nV[id(k, u, s)] = best;
          P[id(k, u, s)] = ba;
        }
      }
    }
    V = nV;
    pol[t] = P;
  }

  const out = { dt, p: [], gp: [], cota: [opt.cota0], spill: [], rev: [], starts: 0 };
  let cm = (opt.cota0 - cmin) * 100;
  let u = opt.startOn ? 1 : 0;
  let s = 0;
  for (let t = 0; t < n; t++) {
    let a = pol[t][id(Math.round(lvl(Math.max(cm, 0))), u, s)];
    let r = move(cm, t, a);
    if (a > 0 && r.nc < -1e-9) {
      a = 0;
      r = move(cm, t, a);
    }
    if (a > 0 && !u) {
      s++;
      out.starts++;
    }
    u = a > 0 ? 1 : 0;
    cm = r.nc;
    out.p.push(acts[a].p);
    out.gp.push(acts[a].gp);
    out.spill.push(r.spill);
    out.rev.push(acts[a].p * dt * prices[t]);
    out.cota.push(cmin + cm / 100);
  }
  out.energy = out.p.reduce((x, y) => x + y * dt, 0);
  out.revenue = out.rev.reduce((x, y) => x + y, 0);
  out.captured = out.energy > 0 ? out.revenue / out.energy : null;
  out.spilledCm = out.spill.reduce((x, y) => x + y, 0);
  out.cotaEnd = out.cota[n];
  out.hoursOn = out.p.filter((x) => x > 0).length * dt;
  out.events = maniobras(plant, out);
  return out;
}

// Hoja de maniobras: arranques/paradas por grupo con la hora a la que dar la orden
export function maniobras(plant, plan) {
  const ev = [];
  const n = plan.p.length;
  const mins = (t) => Math.round(t * plan.dt * 60);
  for (const g of plant.groups || []) {
    let prev = false;
    for (let t = 0; t <= n; t++) {
      const on = t < n && plan.gp[t][g.id] > 0;
      if (on && !prev) ev.push({ t: mins(t), order: mins(t) - (+g.startMin || 0), group: g.name, kind: "Arrancar", mw: plan.gp[t][g.id] });
      else if (!on && prev) ev.push({ t: mins(t), order: mins(t), group: g.name, kind: "Parar" });
      else if (on && prev && plan.gp[t][g.id] !== plan.gp[t - 1][g.id]) ev.push({ t: mins(t), order: mins(t), group: g.name, kind: "Cambiar carga", mw: plan.gp[t][g.id] });
      prev = on;
    }
  }
  return ev.sort((a, b) => a.order - b.order || a.t - b.t);
}

// Aportación por periodo (cm/h): natural + agua turbinada aguas arriba con retraso
export function inflowSeries(n, aportCmDay, upstream) {
  const base = Array.from({ length: n }, () => aportCmDay / 24);
  if (upstream?.plan && upstream.cmhFull > 0 && upstream.pmaxTotal > 0) {
    const shift = Math.round((upstream.delayMin / 60) * (n / 24));
    for (let t = 0; t < n; t++) {
      const src = t - shift;
      const p = src >= 0 ? upstream.plan.p[src] : 0;
      base[t] += (p / upstream.pmaxTotal) * upstream.cmhFull;
    }
  }
  return base;
}

// Aportación natural observada en un día (cm/día) a partir del diario de cotas
export function observedAport(plant, cotaHoy, cotaManana, hours, upstreamCm = 0) {
  if (cotaHoy == null || cotaManana == null || cotaHoy === "" || cotaManana === "") return null;
  const turb = (plant.groups || []).reduce((s, g) => s + (+hours?.[g.id] || 0) * (+g.cmh || 0), 0);
  return (cotaManana - cotaHoy) * 100 + turb - upstreamCm;
}

// Precios estimados para días sin publicar: mismo día de la semana anterior si
// está cargado; si no, el último día con precio.
export function estimatePrices(dateKey, loaded) {
  const d = new Date(dateKey + "T12:00:00");
  for (let w = 1; w <= 4; w++) {
    const k = new Date(d.getTime() - w * 7 * 864e5).toISOString().slice(0, 10);
    if (loaded[k]) return { prices: loaded[k].es, from: k, how: "mismo día de la semana anterior" };
  }
  const keys = Object.keys(loaded).filter((k) => k < dateKey).sort();
  if (keys.length) return { prices: loaded[keys[keys.length - 1]].es, from: keys[keys.length - 1], how: "último día cargado" };
  return null;
}

// Precios de ejemplo (solo si no se ha cargado ningún Excel)
export function samplePrices(dateKey, n = 96) {
  let h = 0;
  for (const ch of dateKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => (h = (h * 1664525 + 1013904223) >>> 0) / 4294967296;
  const base = 60 + rnd() * 30;
  return Array.from({ length: n }, (_, i) => {
    const hr = (i + 0.5) * (24 / n);
    const sun = hr > 8 && hr < 19 ? Math.sin((Math.PI * (hr - 8)) / 11) : 0;
    return Math.max(0, base + 22 * Math.exp(-(((hr - 8.5) / 1.4) ** 2)) + 45 * Math.exp(-(((hr - 21) / 1.8) ** 2)) - 55 * sun + (rnd() - 0.5) * 6);
  });
}
