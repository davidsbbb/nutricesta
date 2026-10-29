// Estado local (en el navegador de cada usuario): centrales, precios cargados
// desde el Excel de OMIE, diario de cotas y entradas de cada plan.

const KEY = "hidro-plan-v2";

// Datos de partida: nombres reales, cifras de EJEMPLO a completar en "Centrales".
const g = (id, name, pmax, cmh, extra = {}) => ({ id, name, pmax, pmin: 0, mode: "fijo", cmh, requires: null, startMin: 0, ...extra });
export const DEFAULT_PLANTS = [
  { id: "berrocalillo", name: "Berrocalillo", cotaMin: 400, cotaMax: 405, maxStarts: 3, groups: [g("G1", "Grupo 1", 2, 4)], pending: true },
  { id: "astudillo", name: "Astudillo", cotaMin: 400, cotaMax: 405, maxStarts: 3, groups: [g("G1", "Grupo 1", 2, 4)], pending: true },
  { id: "sanlazaro", name: "San Lázaro", cotaMin: 400, cotaMax: 405, maxStarts: 3, groups: [g("G1", "Grupo 1", 2, 4)], pending: true },
  { id: "marinejo", name: "Marinejo", cotaMin: 400, cotaMax: 405, maxStarts: 3, groups: [g("G1", "Grupo 1", 2, 4)], pending: true },
  { id: "casasdelmonte", name: "Casas del Monte", cotaMin: 400, cotaMax: 405, maxStarts: 3, groups: [g("G1", "Grupo 1", 2, 4)], pending: true },
  {
    id: "chorro",
    name: "Chorro del Duque",
    cotaMin: 400,
    cotaMax: 405,
    maxStarts: 3,
    groups: [g("G1", "Grupo 1", 3, 5, { startMin: 30 }), g("G2", "Grupo 2", 3, 5, { startMin: 30, requires: "G1" })],
    pending: true,
  },
  {
    id: "zaburdon",
    name: "Zaburdón",
    cotaMin: 400,
    cotaMax: 405,
    maxStarts: 3,
    groups: [g("G1", "Grupo 1", 2, 6), g("G2", "Grupo 2", 2, 6)],
    cascade: { from: "chorro", delayMin: 90, cmhFull: 8 },
    pending: true,
  },
];

const today = () => new Date().toISOString().slice(0, 10);
const defaults = () => ({
  plants: DEFAULT_PLANTS.map((p) => structuredClone(p)),
  plantsSource: "default",
  activeId: "chorro",
  prices: {}, // { fecha: { es:[...], source:'excel'|'manual'|'auto', file } }
  log: {}, // { plantId: { fecha: { cota, hours:{G1:h}, nota } } }
  inputs: {}, // { 'plantId|fecha': {...} }
  sent: {}, // programas marcados como enviados { 'plantId|fecha': {...} }
  theme: "auto",
  created: today(),
});

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
  plant: (id) => state.plants.find((p) => p.id === (id || state.activeId)) || state.plants[0],
  set(patch) {
    state = { ...state, ...patch };
    save();
    subs.forEach((f) => f(state));
  },
  updatePlant(id, patch) {
    db.set({ plants: state.plants.map((p) => (p.id === id ? { ...p, ...patch } : p)), plantsSource: "local" });
  },
  setLog(plantId, date, patch) {
    const log = { ...state.log, [plantId]: { ...(state.log[plantId] || {}) } };
    log[plantId][date] = { ...(log[plantId][date] || {}), ...patch };
    db.set({ log });
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
  replace(s) {
    state = { ...defaults(), ...s };
    save();
    subs.forEach((f) => f(state));
  },
};

async function tryJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url, { cache: "no-cache", signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Configuración común: centrales.json junto a la web (opcional)
export async function loadTeamPlants(force = false) {
  if (!force && state.plantsSource === "local") return false;
  const j = await tryJson(new URL("./centrales.json", location.href).href);
  if (!Array.isArray(j?.centrales) || !j.centrales.length || !j.centrales.every((c) => Array.isArray(c.groups))) return false;
  const activeId = j.centrales.some((p) => p.id === state.activeId) ? state.activeId : j.centrales[0].id;
  db.set({ plants: j.centrales, plantsSource: "team", activeId });
  return true;
}

// ---------- Excel de OMIE ----------
let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxLoading)
    xlsxLoading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = new URL("./js/vendor/xlsx.full.min.js", location.href).href;
      s.onload = () => res(window.XLSX);
      s.onerror = () => rej(new Error("No se pudo cargar el lector de Excel"));
      document.head.append(s);
    });
  return xlsxLoading;
}

// Fecha a partir del nombre: INT_PBC_EV_H_1_30_10_2026_30_10_2026.XLS
export function dateFromName(name) {
  const m = name.match(/(\d{2})_(\d{2})_(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const m2 = name.match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

// Devuelve { es:[...], pt:[...] } con 96 (o 92/100, o 24) precios
export async function parseOmieExcel(file) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true });
    const hi = rows.findIndex((r) => r.some((c) => /^H\d+(Q\d)?$/i.test(String(c).trim())));
    const esRow = rows.find((r) => /precio/i.test(String(r[0])) && /espa/i.test(String(r[0])));
    if (hi < 0 || !esRow) continue;
    const hdr = rows[hi];
    const cols = hdr.map((c, i) => (/^H\d+(Q\d)?$/i.test(String(c).trim()) ? i : -1)).filter((i) => i >= 0);
    const num = (v) => {
      if (typeof v === "number") return v;
      const t = String(v).trim();
      return t.includes(",") ? parseFloat(t.replace(/\./g, "").replace(",", ".")) : parseFloat(t);
    };
    const es = cols.map((i) => num(esRow[i])).filter((v) => !Number.isNaN(v));
    const ptRow = rows.find((r) => /precio/i.test(String(r[0])) && /portug/i.test(String(r[0])));
    const pt = ptRow ? cols.map((i) => num(ptRow[i])) : null;
    if (es.length >= 23) return { es: es.length <= 25 ? es.flatMap((v) => [v, v, v, v]) : es, pt };
  }
  throw new Error("No encuentro la fila de precios de España en el archivo");
}

export function storePrices(date, es, source, file) {
  db.set({ prices: { ...state.prices, [date]: { es, source, file: file || null, loaded: new Date().toISOString() } } });
}

// Pegado manual: 24 o 96 valores (uno por línea; vale "hora;precio")
export function parseManual(text) {
  const vals = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/[;\t]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const v = parseFloat(parts[parts.length - 1].replace(",", "."));
    if (!Number.isNaN(v)) vals.push(v);
  }
  if (vals.length >= 23 && vals.length <= 25) return vals.flatMap((v) => [v, v, v, v]);
  if (vals.length >= 92 && vals.length <= 100) return vals;
  return null;
}

// Precios publicados automáticamente junto a la web (si existen); opcional
export async function autoPrices(date) {
  const j = await tryJson(new URL(`../omie/days/${date}.json`, location.href).href);
  return j?.es?.length ? j.es : null;
}
