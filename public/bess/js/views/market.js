import { store } from "../store.js";
import { aggregate, spreadWaterfall, DT, N } from "../model.js";
import { period, periodControl } from "../period.js";
import { xyChart, waterfall, ring, legend, tipRow } from "../charts.js";
import { num, eur, pct, esc, mean, sum, fmtHM } from "../util.js";
import { C, kpi, card } from "./common.js";

export function renderMarket(root) {
  const draw = () => {
    const a = store.asset();
    const prices = store.get().prices;
    const agg = aggregate(a, period.from, period.to, prices);
    const t = agg.totals;
    const done = agg.days.filter((d) => d.complete);
    const wf = spreadWaterfall(a, agg);
    const nDays = done.length || 1;
    const Eusable = (a.energyMWh * (a.socMax - a.socMin)) / 100;
    const cyclesDay = t.daysTelemetry ? t.efc / t.daysTelemetry : 0;
    const activeH = sum(done.map((d) => d.meas.filter((p) => Math.abs(p) > a.powerMW * 0.02).length)) * DT;
    const util = (activeH / (nDays * 24)) * 100;
    const availPct = 100 - (t.unavailH / (nDays * 24)) * 100;

    // precios capturados
    let chgE = 0, chgC = 0, disE = 0, disR = 0;
    for (const d of done)
      for (let i = 0; i < N; i++) {
        const p = d.sched[i];
        if (p < 0) { chgE += -p * DT; chgC += -p * DT * d.market.da[i]; }
        else if (p > 0) { disE += p * DT; disR += p * DT * d.market.da[i]; }
      }
    const capCharge = chgE ? chgC / chgE : null;
    const capDis = disE ? disR / disE : null;

    root.innerHTML = `
      <div class="view-head">
        <div><h1>Mercado BESS</h1><div class="sub">${esc(a.name)} · estrategia: <b>${a.strategy === "omie" ? "Arbitraje OMIE" : a.strategy === "aaii" ? "Servicios de ajuste (aFRR)" : `Mixta (${a.bandShare}% banda)`}</b></div></div>
        <div class="spacer"></div><div id="per"></div>
      </div>
      <div class="grid kpis">
        ${kpi({ label: "Ingresos totales", sub: "OMIE + AAII − desvíos − sobrecoste", value: eur(t.total), cls: "accent" })}
        ${kpi({ label: "Ingresos OMIE", sub: "Arbitraje mercado diario", value: eur(t.omie) })}
        ${kpi({ label: "Coste de desvíos", sub: "Medido vs programado", value: eur(t.imb), cls: t.imb < 0 ? "neg" : "" })}
        ${kpi({ label: "Sobrecoste desvíos", sub: `${num(a.overcost, 1)} €/MWh desviado`, value: eur(t.over), cls: t.over < 0 ? "neg" : "" })}
        ${kpi({ label: "Desvío neto", sub: "Energía medida vs programada", value: pct(t.devPct, 2), cls: Math.abs(t.devPct) > 5 ? "neg" : "" })}
      </div>
      <div class="grid side-layout mb">
        ${card("Cascada de spread", "€ por MWh instalado y día · de la oportunidad máxima al spread final", `
          <p class="note">Del spread máximo del mercado al ingreso neto real, paso a paso: límites físicos, eficiencia, disponibilidad, estrategia y desvíos. Pasa el cursor por cada barra para ver qué significa.</p>
          <div id="chWf"></div>
          ${legend([{ label: "Base", color: C.brand }, { label: "Subtotal", color: C.s1 }, { label: "Ajuste positivo", color: C.s3 }, { label: "Ajuste negativo", color: C.neg }, { label: "Final", color: "var(--ink-2)" }])}`)}
        <div class="side-metrics">
          ${metric("↑", "Energía exportada", num(t.exp, 2) + " MWh")}
          ${metric("↓", "Energía importada", num(t.imp, 2) + " MWh")}
          ${metric("η", "Rendimiento (RTE)", pct(t.rte))}
          ${metric("⟳", "Ciclos medios/día", num(cyclesDay, 2))}
          ${metric("▮", "Energía útil (DoD)", num(Eusable, 2) + " MWh")}
          ${metric("Σ", "Energía neta AC", num(t.exp - t.imp, 2) + " MWh")}
          ${metric("€", "Precio medio carga", capCharge != null ? num(capCharge, 1) + " €/MWh" : "–")}
          ${metric("€", "Precio medio descarga", capDis != null ? num(capDis, 1) + " €/MWh" : "–")}
        </div>
      </div>
      <div class="grid gauges">
        <div class="card"><div class="card-head"><h2>Rendimiento</h2></div><div id="g1"></div><p class="note" style="text-align:center">RTE medido vs nominal ${a.rte} %</p></div>
        <div class="card"><div class="card-head"><h2>Ciclos medios</h2></div><div id="g2"></div><p class="note" style="text-align:center">Por día, sobre el límite de ${num(a.maxCycles, 1)}</p></div>
        <div class="card"><div class="card-head"><h2>Utilización</h2></div><div id="g3"></div><p class="note" style="text-align:center">% de horas cargando o descargando</p></div>
        <div class="card"><div class="card-head"><h2>Disponibilidad</h2></div><div id="g4"></div><p class="note" style="text-align:center">${num(t.unavailH, 1)} h de parada en el periodo</p></div>
      </div>
      <div class="grid two mb">
        ${card("Perfil horario medio", "Media del periodo por cuarto de hora", `
          <div class="mini-title">Precio mercado diario (€/MWh)</div><div id="chHp"></div>
          <div class="mini-title">Potencia programada de la batería (MW, + descarga / − carga)</div><div id="chHb"></div>`)}
        ${card("¿Qué estrategia rinde más?", "Mismo periodo, mismos precios, misma batería", `<p class="note">Simulación con despacho óptimo para cada estrategia. Útil para decidir cuánta potencia ofertar en banda.</p><div id="chStrat"></div><div id="stratNote" class="note"></div>`)}
      </div>`;

    root.querySelector("#per").append(periodControl(draw));

    if (wf) {
      waterfall(root.querySelector("#chWf"), {
        steps: wf,
        fmt: (v) => num(v, 1),
        colors: { base: C.brand, sub: C.s1, pos: C.s3, neg: C.neg, final: "var(--ink-2)" },
      });
    } else root.querySelector("#chWf").innerHTML = `<p class="muted">No hay días liquidados en el periodo.</p>`;

    ring(root.querySelector("#g1"), { value: t.rte || 0, max: 100, label: pct(t.rte, 0), sub: "actual", color: C.s1 });
    ring(root.querySelector("#g2"), { value: cyclesDay, max: a.maxCycles, label: num(cyclesDay, 2), sub: `de ${num(a.maxCycles, 1)}`, color: C.brand });
    ring(root.querySelector("#g3"), { value: util, max: 100, label: pct(util, 0), sub: "horas activas", color: C.s3 });
    ring(root.querySelector("#g4"), { value: availPct, max: 100, label: pct(availPct, 1), sub: "disponible", color: availPct < 97 ? C.neg : C.brand });

    // perfil horario
    const xq = Array.from({ length: N }, (_, i) => fmtHM(i * 15));
    const avgP = Array.from({ length: N }, (_, i) => mean(done.map((d) => d.market.da[i])));
    const avgB = Array.from({ length: N }, (_, i) => mean(done.map((d) => d.sched[i])));
    xyChart(root.querySelector("#chHp"), { x: xq, series: [{ name: "Precio medio", values: avgP, color: C.s1, fmt: (v) => num(v, 1) + " €/MWh" }], height: 150, xLabelWidth: 56, zoom: true });
    xyChart(root.querySelector("#chHb"), {
      x: xq,
      series: [{ name: "Potencia media", type: "bar", values: avgB, color: (v) => (v < 0 ? C.s2 : C.s1), fmt: (v) => num(v, 3) + " MW" }],
      tipExtra: () => `<div class="tip-note">Azul: descarga · Naranja: carga</div>`,
      height: 150,
      xLabelWidth: 56,
      zoom: true,
    });

    // comparador de estrategias
    const stratEl = root.querySelector("#chStrat");
    if (agg.keys.length > 120) {
      stratEl.innerHTML = `<p class="muted">Selecciona un periodo de 120 días o menos para comparar estrategias.</p>`;
    } else {
      const variants = [
        { name: "Arbitraje OMIE", patch: { strategy: "omie" } },
        { name: "Mixta 25 %", patch: { strategy: "mixed", bandShare: 25 } },
        { name: "Mixta 50 %", patch: { strategy: "mixed", bandShare: 50 } },
        { name: "Mixta 75 %", patch: { strategy: "mixed", bandShare: 75 } },
        { name: "Solo aFRR", patch: { strategy: "aaii" } },
      ];
      const res = variants.map((v) => {
        const tt = aggregate({ ...a, ...v.patch }, period.from, period.to, prices).totals;
        return { ...v, total: tt.total, omie: tt.omie, aaii: tt.aaii, imb: tt.imb + tt.over, efc: tt.efc };
      });
      const best = res.reduce((b, r) => (r.total > b.total ? r : b), res[0]);
      xyChart(stratEl, {
        x: res.map((r) => r.name),
        series: [{ name: "Ingreso neto", type: "bar", values: res.map((r) => r.total), color: (v, i) => (res[i] === best ? C.brand : C.s1), fmt: (v) => eur(v) }],
        tipExtra: (i) => tipRow("", "OMIE", eur(res[i].omie)) + tipRow("", "AAII", eur(res[i].aaii)) + tipRow("", "Desvíos", eur(res[i].imb)) + tipRow("", "Ciclos", num(res[i].efc, 1)),
        height: 230,
        xLabelWidth: 60,
      });
      const diff = best.total - t.total;
      root.querySelector("#stratNote").innerHTML =
        diff > 1
          ? `La mejor alternativa en este periodo es <b>${esc(best.name)}</b>: <b>${eur(diff)}</b> más que la estrategia actual (${eur(t.total)}). Puedes cambiarla en <a href="#/settings">Activos y ajustes</a>.`
          : `La estrategia actual es la mejor de las simuladas para este periodo.`;
    }
    document.title = `Mercado · ${a.name}`;
  };
  draw();
}

function metric(icon, label, value) {
  return `<div class="metric"><span class="ic">${esc(icon)}</span><div><small>${esc(label)}</small><b>${esc(value)}</b></div></div>`;
}
