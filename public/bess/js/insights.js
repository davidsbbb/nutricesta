// Asistente de análisis basado en reglas: lee el periodo y propone acciones.
import { store } from "./store.js";
import { aggregate, previousPeriod } from "./model.js";
import { eur, pct, num, esc, fmtDayLong } from "./util.js";

export function buildInsights(a, period) {
  const prices = store.get().prices;
  const agg = aggregate(a, period.from, period.to, prices);
  const t = agg.totals;
  const pp = previousPeriod(period.from, period.to);
  const prev = aggregate(a, pp.from, pp.to, prices).totals;
  const out = [];
  const add = (cls, title, text) => out.push(`<div class="insight ${cls}"><b>${esc(title)}</b><p>${text}</p></div>`);

  if (!t.daysRevenue) return `<p class="muted">No hay días liquidados en el periodo seleccionado.</p>`;

  const d = prev.total ? ((t.total - prev.total) / Math.abs(prev.total)) * 100 : null;
  add(d == null || d >= 0 ? "good" : "warn", "Ingresos del periodo", `${eur(t.total)} en ${t.daysRevenue} días (${eur(t.avgDaily)}/día, ${eur(t.perMW / t.daysRevenue)}/MW·día).${d != null ? ` ${d >= 0 ? "Sube" : "Baja"} un ${pct(Math.abs(d))} frente al periodo anterior.` : ""}`);

  if (t.best) add("good", "Mejor día", `${fmtDayLong(t.best.key)} con ${eur(t.best.value)}.`);

  const imbShare = t.total ? (-(t.imb + t.over) / (t.total - t.imb - t.over)) * 100 : 0;
  if (imbShare > 4) add("bad", "Desvíos elevados", `Los desvíos se comen el ${pct(imbShare)} del ingreso bruto (${eur(t.imb + t.over)}). Revisa el seguimiento de consigna del PPC o reduce el error de previsión.`);
  else add("good", "Desvíos bajo control", `Los desvíos suponen solo el ${pct(imbShare)} del ingreso bruto.`);

  if (t.rte != null && t.rte < a.rte - 4) add("warn", "Eficiencia por debajo de lo nominal", `RTE medida ${pct(t.rte)} frente a ${pct(a.rte)} nominal. En servicios de ajuste es normal por las recuperaciones de SOC; si operas en arbitraje, revisa consumos auxiliares y HVAC.`);

  const cyc = t.daysTelemetry ? t.efc / t.daysTelemetry : 0;
  if (cyc > a.maxCycles * 0.9) add("warn", "Ciclado cerca del límite", `${num(cyc, 2)} ciclos/día frente a un máximo de ${num(a.maxCycles, 1)}. Vigila la garantía del fabricante.`);
  else if (cyc < 0.5) add("warn", "Batería infrautilizada", `Solo ${num(cyc, 2)} ciclos/día. Hay margen para capturar más spread si los precios lo permiten.`);

  if (agg.keys.length <= 120) {
    const alt = ["omie", "aaii"].filter((s) => s !== a.strategy).map((s) => ({ s, total: aggregate({ ...a, strategy: s }, period.from, period.to, prices).totals.total }));
    const best = alt.reduce((b, x) => (x.total > b.total ? x : b), { s: a.strategy, total: t.total });
    if (best.s !== a.strategy && best.total - t.total > Math.abs(t.total) * 0.03)
      add("warn", "Estrategia mejorable", `Con <b>${best.s === "omie" ? "arbitraje OMIE puro" : "solo servicios de ajuste"}</b> habrías ingresado ${eur(best.total)} (${eur(best.total - t.total)} más). Compara más opciones en <a href="#/market">Mercado BESS</a>.`);
  }

  if (t.unavailH > 0) add("bad", "Indisponibilidad", `${num(t.unavailH, 1)} h de parada en el periodo. Coste de oportunidad estimado: ${eur((t.avgDaily / 24) * t.unavailH)}.`);
  if (t.soh != null && t.soh < 90) add("warn", "Degradación", `SOH estimado ${pct(t.soh)}. Considera recalibrar la capacidad útil en el despacho.`);

  const open = store.get().alarms.filter((x) => !x.ack && x.active).length;
  if (open) add("bad", "Alarmas sin reconocer", `Hay ${open} alarma(s) activas. <a href="#/alarms">Ver alarmas</a>.`);

  if (!Object.keys(prices).length) add("", "Usa precios reales", `Ahora mismo los precios OMIE son simulados. Importa un CSV con precios reales en <a href="#/settings">Ajustes</a> para que el análisis refleje el mercado real.`);
  return out.join("");
}
