import { store } from "./store.js";
import { addDays, todayKey, el } from "./util.js";

// Periodo compartido entre vistas
const yesterday = addDays(todayKey(), -1);
export const period = store.get().period?.to ? { ...store.get().period } : { from: addDays(yesterday, -7), to: yesterday };

export function setPeriod(from, to) {
  if (from > to) [from, to] = [to, from];
  period.from = from;
  period.to = to;
  store.set({ period: { ...period } });
}

export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

// componente de periodo reutilizable
export function periodControl(onChange) {
  const presets = [
    ["7D", 7],
    ["30D", 30],
    ["90D", 90],
    ["Mes", "mtd"],
    ["Año", 365],
  ];
  const wrap = el("div", { class: "period no-print" });
  const seg = el("div", { class: "seg" });
  const yest = addDays(todayKey(), -1);
  for (const [label, n] of presets) {
    const b = el("button", {
      onclick: () => {
        if (n === "mtd") {
          const t = todayKey();
          const first = t.slice(0, 8) + "01";
          setPeriod(first, t === first ? t : yest);
        } else setPeriod(addDays(yest, -(n - 1)), yest);
        onChange();
      },
    }, label);
    seg.append(b);
  }
  const from = el("input", { type: "date", value: period.from, max: addDays(todayKey(), 1), "aria-label": "Desde" });
  const to = el("input", { type: "date", value: period.to, max: addDays(todayKey(), 1), "aria-label": "Hasta" });
  const apply = () => {
    if (!from.value || !to.value) return;
    setPeriod(from.value, to.value);
    onChange();
  };
  from.addEventListener("change", apply);
  to.addEventListener("change", apply);
  wrap.append(seg, from, el("span", { class: "muted" }, "→"), to);
  return wrap;
}
