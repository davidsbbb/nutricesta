// Utilidades: aleatorio reproducible, fechas y formatos (es-ES)

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r) {
  const u = Math.max(r(), 1e-9);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
export const mean = (arr) => {
  const v = arr.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? sum(v) / v.length : null;
};

// --- Fechas (todas en hora local) ---
export function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
export function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function daysBetween(a, b) {
  const out = [];
  let k = a;
  let guard = 0;
  while (k <= b && guard++ < 1200) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}
export function todayKey() {
  return dayKey(new Date());
}
export function fmtDayShort(k) {
  const [, m, d] = k.split("-");
  return `${d}/${m}`;
}
export function fmtDayLong(k) {
  const [y, m, d] = k.split("-");
  return `${d}/${m}/${y}`;
}
export function fmtHM(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// --- Números ---
const nfCache = {};
function nf(dec) {
  if (!nfCache[dec])
    nfCache[dec] = new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
      useGrouping: "always",
    });
  return nfCache[dec];
}
export function num(v, dec = 0) {
  if (v == null || Number.isNaN(v)) return "–";
  return nf(dec).format(v);
}
export function eur(v, dec = 0) {
  if (v == null || Number.isNaN(v)) return "–";
  return `${num(v, dec)} €`;
}
export function pct(v, dec = 1) {
  if (v == null || Number.isNaN(v)) return "–";
  return `${num(v, dec)} %`;
}
export function compactEur(v) {
  if (v == null) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return `${num(v / 1e6, 2)} M€`;
  if (a >= 1e4) return `${num(v / 1e3, 1)} k€`;
  return eur(v);
}

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function downloadFile(name, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
