// Estado persistente (localStorage) y bus de eventos sencillo

const KEY = "acumula-bess-v1";

export const DEFAULT_ASSET = {
  id: "piloto",
  name: "BESS Piloto Toledo",
  location: "Toledo (ES)",
  type: "standalone", // standalone | hybrid
  powerMW: 0.7,
  energyMWh: 1.43,
  rte: 87, // % AC-AC nominal
  invEff: 98.1, // % inversor (un sentido)
  socMin: 5,
  socMax: 95,
  maxCycles: 2,
  degCost: 6, // €/MWh descargado
  strategy: "aaii", // omie | aaii | mixed
  bandShare: 60, // % de potencia ofertada en banda (mixto)
  pvMWp: 0,
  availability: 98, // %
  imbalanceErr: 10, // % error medio de seguimiento
  overcost: 4, // €/MWh sobrecoste por desvío
  commissioning: "2025-06-01",
};

const SAMPLE_ASSETS = [
  DEFAULT_ASSET,
  {
    ...DEFAULT_ASSET,
    id: "badajoz",
    name: "Híbrida FV Badajoz",
    location: "Badajoz (ES)",
    type: "hybrid",
    powerMW: 25,
    energyMWh: 100,
    rte: 88,
    strategy: "mixed",
    bandShare: 40,
    pvMWp: 50,
    maxCycles: 1.5,
    commissioning: "2024-11-15",
  },
  {
    ...DEFAULT_ASSET,
    id: "zaragoza",
    name: "Stand-alone Zaragoza",
    location: "Zaragoza (ES)",
    type: "standalone",
    powerMW: 50,
    energyMWh: 200,
    rte: 89,
    strategy: "omie",
    bandShare: 0,
    maxCycles: 2,
    commissioning: "2025-02-01",
  },
];

const defaults = () => ({
  assets: SAMPLE_ASSETS.map((a) => ({ ...a })),
  activeId: "piloto",
  theme: "auto",
  prices: {}, // { 'YYYY-MM-DD': [96 €/MWh] } precios OMIE importados
  alarms: [],
  realtime: { source: "sim", url: "", speed: 1 },
  period: null,
});

let state;
try {
  state = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  if (!state.assets?.length) state.assets = defaults().assets;
} catch {
  state = defaults();
}

const listeners = new Set();

export const store = {
  get: () => state,
  asset() {
    return state.assets.find((a) => a.id === state.activeId) || state.assets[0];
  },
  set(patch) {
    state = { ...state, ...patch };
    save();
    listeners.forEach((fn) => fn(state));
  },
  updateAsset(id, patch) {
    state.assets = state.assets.map((a) => (a.id === id ? { ...a, ...patch } : a));
    store.set({});
  },
  addAsset(asset) {
    state.assets = [...state.assets, asset];
    store.set({ activeId: asset.id });
  },
  removeAsset(id) {
    if (state.assets.length <= 1) return;
    state.assets = state.assets.filter((a) => a.id !== id);
    store.set({ activeId: state.assets[0].id });
  },
  pushAlarm(alarm) {
    const list = [{ ...alarm, ts: Date.now(), ack: false, id: Math.random().toString(36).slice(2) }, ...state.alarms].slice(0, 200);
    store.set({ alarms: list });
  },
  reset() {
    state = defaults();
    save();
    listeners.forEach((fn) => fn(state));
  },
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento no disponible: la app sigue funcionando en memoria */
  }
}
