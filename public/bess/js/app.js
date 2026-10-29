import { store } from "./store.js";
import { live } from "./live.js";
import { num, esc } from "./util.js";
import { period } from "./period.js";
import { renderExecutive } from "./views/executive.js";
import { renderMarket } from "./views/market.js";
import { renderRealtime } from "./views/realtime.js";
import { renderAlarms } from "./views/alarms.js";
import { renderSettings } from "./views/settings.js";
import { buildInsights } from "./insights.js";
import { hideTip } from "./charts.js";

const routes = {
  executive: renderExecutive,
  market: renderMarket,
  realtime: renderRealtime,
  alarms: renderAlarms,
  settings: renderSettings,
};

let cleanup = null;
const view = document.getElementById("view");

function render() {
  const route = (location.hash.replace("#/", "") || "executive").split("?")[0];
  const fn = routes[route] || renderExecutive;
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
  if (cleanup) cleanup();
  hideTip();
  view.innerHTML = "";
  cleanup = fn(view) || null;
  document.getElementById("app").classList.remove("nav-open");
  window.scrollTo({ top: 0 });
}

// --- selector de activo ---
const sel = document.getElementById("assetSelect");
function fillAssets() {
  const s = store.get();
  sel.innerHTML = s.assets.map((a) => `<option value="${esc(a.id)}" ${a.id === s.activeId ? "selected" : ""}>${esc(a.name)} · ${num(a.powerMW, a.powerMW < 10 ? 1 : 0)} MW / ${num(a.energyMWh, a.energyMWh < 10 ? 2 : 0)} MWh</option>`).join("");
}
sel.addEventListener("change", () => {
  store.set({ activeId: sel.value });
  live.restart();
  render();
});

// --- tema ---
function applyTheme() {
  const t = store.get().theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
document.getElementById("themeBtn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  store.set({ theme: dark ? "light" : "dark" });
  applyTheme();
  render();
});

// --- menú móvil ---
document.getElementById("menuBtn").addEventListener("click", () => document.getElementById("app").classList.toggle("nav-open"));
document.getElementById("scrim").addEventListener("click", () => document.getElementById("app").classList.remove("nav-open"));

// --- asistente ---
const drawer = document.getElementById("drawer");
document.getElementById("insightBtn").addEventListener("click", () => {
  document.getElementById("drawerBody").innerHTML = buildInsights(store.asset(), period);
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
});
document.getElementById("drawerClose").addEventListener("click", () => {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
});

// --- cabecera en vivo ---
const pillConn = document.getElementById("pillConn");
const connTxt = { online: "Online", connecting: "Conectando", offline: "Sin conexión" };
live.subscribe((st) => {
  const a = store.asset();
  pillConn.className = "pill " + st.connection;
  pillConn.querySelector("b").textContent = connTxt[st.connection];
  document.querySelector("#pillP b").innerHTML = `${num(st.p, a.powerMW < 10 ? 3 : 1)} <small>MW</small>`;
  document.querySelector("#pillSoc b").innerHTML = `${num(st.soc, 1)} <small>%</small>`;
  const d = new Date(st.simTime);
  document.getElementById("clock").textContent = d.toLocaleTimeString("es-ES");
});

// --- contador de alarmas ---
function updateBadge() {
  const n = store.get().alarms.filter((x) => !x.ack && x.active).length;
  const b = document.getElementById("alarmBadge");
  b.hidden = !n;
  b.textContent = n;
}

store.on(() => {
  fillAssets();
  updateBadge();
});

applyTheme();
fillAssets();
updateBadge();
live.start();
live.setSource(store.get().realtime.source);
window.addEventListener("hashchange", render);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
render();

