// Estado local (centrales, planes guardados, precios manuales) y lectura
// automática de precios OMIE publicados junto a la web.

import { samplePrices } from "./hydro.js";

const KEY = "hidro-plan-v1";

export const DEFAULT_PLANTS = [
  {
    id: "c1",
    name: "Central de embalse",
    type: "embalse",
    pmax: 20,
    pmin: 4,
    head: 80,
    eta: 88,
    qmax: 30,
    qeco: 0.5,
    vmin: 2,
    vmax: 12,
    maxStarts: 3,
    startCost: 150,
  },
  {
    id: "c2",
    name: "Minicentral fluyente",
    type: "fluyente",
    pmax: 3,
    pmin: 0.6,
    head: 25,
    eta: 85,
    qmax: 15,
    qeco: 1,
    vmin: 0,
    vmax: 0.03,
    maxStarts: 2,
    startCost: 30,
  },
];

const defaults = () => ({ plants: DEFAULT_PLANTS.map((p) => ({ ...p })), plantsSource: "default", activeId: "c1", inputs: {}, saved: [], manualPrices: {}, priceCache: {}, theme: "auto" });

let state;
try {
  state = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  if (!state.plants?.length) state.plants = defaults().plants;
} catch {
  state = defaults();
}
const subs = new Set();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* sin almacenamiento: sigue en memoria */
  }
}
export const db = {
  get: () => state,
  plant: () => state.plants.find((p) => p.id === state.activeId) || state.plants[0],
  set(patch) {
    state = { ...state, ...patch };
    save();
    subs.forEach((f) => f(state));
  },
  updatePlant(id, patch) {
    db.set({ plants: state.plants.map((p) => (p.id === id ? { ...p, ...patch } : p)), plantsSource: "local" });
  },
  on(f) {
    subs.add(f);
    return () => subs.delete(f);
  },
  reset() {
    state = defaults();
    save();
    subs.forEach((f) => f(state));
  },
};

// ---- Configuración común del equipo (centrales.json junto a la web) ----
// Si existe, todos los compañeros ven las mismas centrales sin configurar nada.
export async function loadTeamPlants(force = false) {
  if (!force && state.plantsSource === "local") return false;
  const j = await tryJson(new URL("./centrales.json", location.href).href);
  if (!Array.isArray(j?.centrales) || !j.centrales.length) return false;
  const activeId = j.centrales.some((p) => p.id === state.activeId) ? state.activeId : j.centrales[0].id;
  db.set({ plants: j.centrales, plantsSource: "team", activeId });
  return true;
}

// ---- Precios OMIE ----
// La web publica /omie/index.json y /omie/days/AAAA-MM-DD.json (GitHub Actions).
// Ruta relativa: funciona en cualquier servidor donde se publique la carpeta.
const BASES = [new URL("../omie/", location.href).href, new URL("./omie/", location.href).href];
let indexCache = null;
let workingBase = null;

async function tryJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { cache: "no-cache", signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function omieIndex(force = false) {
  if (indexCache && !force) return indexCache;
  for (const b of workingBase ? [workingBase, ...BASES] : BASES) {
    const j = await tryJson(b + "index.json");
    if (j?.days) {
      workingBase = b;
      indexCache = j;
      return j;
    }
  }
  indexCache = { days: [], latest: null, updated: null, offline: true };
  return indexCache;
}

// Devuelve { prices, source: 'omie'|'manual'|'ejemplo', note }
export async function pricesFor(dateKey) {
  const cached = state.priceCache[dateKey];
  if (cached) return { prices: cached, source: "omie" };
  const idx = await omieIndex();
  if (idx.days?.includes(dateKey) && workingBase) {
    const j = await tryJson(`${workingBase}days/${dateKey}.json`);
    if (j?.es?.length) {
      const prices = j.es.map((v) => +v);
      // guarda en local (máx. 120 días) para poder trabajar sin conexión
      const pc = { ...state.priceCache, [dateKey]: prices };
      const keys = Object.keys(pc).sort();
      while (keys.length > 120) delete pc[keys.shift()];
      db.set({ priceCache: pc });
      return { prices, source: "omie" };
    }
  }
  if (state.manualPrices[dateKey]) return { prices: state.manualPrices[dateKey], source: "manual" };
  return { prices: samplePrices(dateKey), source: "ejemplo" };
}

// Pegado manual: "hora;precio" (24 líneas), "periodo;precio" (96) o una columna de precios
export function parseManual(text) {
  const vals = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/[;\t]|,(?=\s*-?\d+[.,]?\d*\s*$)/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const v = parseFloat(parts[parts.length - 1].replace(",", "."));
    if (!Number.isNaN(v)) vals.push(v);
  }
  if (vals.length === 24) return vals.flatMap((v) => [v, v, v, v]);
  if (vals.length >= 92 && vals.length <= 100) return vals;
  if (vals.length >= 23 && vals.length <= 25) return vals.flatMap((v) => [v, v, v, v]);
  return null;
}
