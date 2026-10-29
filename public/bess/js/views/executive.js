import { store } from "../store.js";
import { aggregate, previousPeriod } from "../model.js";
import { period, periodControl } from "../period.js";
import { xyChart, hbarChart, legend, tipRow } from "../charts.js";
import { num, eur, pct, fmtDayShort, fmtDayLong, downloadFile, esc } from "../util.js";
import { C, kpi, card, deltaHtml, periodLabel } from "./common.js";

export function renderExecutive(root) {
  const draw = () => {
    const a = store.asset();
    const prices = store.get().prices;
    const agg = aggregate(a, period.from, period.to, prices);
    const pp = previousPeriod(period.from, period.to);
    const prev = aggregate(a, pp.from, pp.to, prices).totals;
    const t = agg.totals;
    const days = agg.days;
    const x = days.map((d) => fmtDayShort(d.key));
    const dec = a.energyMWh < 10 ? 2 : 0;

    root.innerHTML = `
      <div class="view-head">
        <div><h1>Resumen ejecutivo</h1><div class="sub">${esc(a.name)} · ${esc(a.location)} · ${a.type === "hybrid" ? "Híbrida FV" : "Stand-alone"} · ${num(a.powerMW, 2)} MW / ${num(a.energyMWh, 2)} MWh</div></div>
        <div class="spacer"></div><div id="per"></div>
        <button class="btn small no-print" id="csv">Exportar CSV</button>
        <button class="btn small no-print" id="pdf">Informe PDF</button>
      </div>
      <div class="grid kpis">
        ${kpi({ label: "Ingresos acumulados", sub: "vs periodo anterior de igual duración", value: eur(t.total), delta: deltaHtml(t.total, prev.total), cls: "accent" })}
        ${kpi({ label: "Ingresos por MWh instalado", sub: `${num(a.energyMWh, 2)} MWh instalados · periodo`, value: eur(t.perMWh), delta: deltaHtml(t.perMWh, prev.perMWh) })}
        ${kpi({ label: "Eficiencia round-trip", sub: "RTE AC-AC corregida por ΔSOC", value: t.rte != null ? pct(t.rte) : "–", delta: deltaHtml(t.rte, prev.rte) })}
        ${kpi({ label: "Ciclos equivalentes", sub: `EFC del periodo · ${num(t.daysTelemetry ? t.efc / t.daysTelemetry : 0, 2)}/día (máx. ${num(a.maxCycles, 1)})`, value: num(t.efc, 1) })}
        ${kpi({ label: "Estado de salud", sub: "SOH estimado al final del periodo", value: t.soh != null ? pct(t.soh) : "–" })}
      </div>
      <div class="grid two mb">
        ${card("Evolución diaria de ingresos", "€ por día · periodo seleccionado", `
          <div class="stats">
            <div class="stat"><span>Ingresos del periodo</span><b>${eur(t.total)}</b></div>
            <div class="stat"><span>Promedio diario</span><b>${eur(t.avgDaily)}</b></div>
            <div class="stat hl"><span>Mejor día</span><b>${t.best ? fmtDayLong(t.best.key) + " · " + eur(t.best.value) : "–"}</b></div>
          </div>
          <p class="note">${t.daysRevenue} de ${t.days} días liquidados. El día en curso y los futuros no se incluyen en los resúmenes.</p>
          <div id="chRev"></div>`)}
        ${card("Contribución económica por componente", "Importes del periodo (€)", `
          <div class="stats">
            <div class="stat"><span>Mercado diario (OMIE)</span><b>${eur(t.omie)}</b></div>
            <div class="stat"><span>Servicios de ajuste</span><b>${eur(t.aaii)}</b></div>
            <div class="stat"><span>Desvíos + sobrecoste</span><b class="${t.imb + t.over < 0 ? "neg-txt" : ""}">${eur(t.imb + t.over)}</b></div>
          </div>
          <div id="chComp"></div>`)}
      </div>
      <div class="grid two mb">
        ${card("SOC y energía AC", "SOC medio diario (%) y energía diaria (MWh)", `
          <p class="note">SOC: ${t.daysSoc} de ${t.days} días con datos · Energía: ${t.daysTelemetry} de ${t.days} días. Los días sin lectura quedan vacíos.</p>
          <div class="mini-title">SOC medio diario (%)</div><div id="chSoc"></div>
          <div class="mini-title">Energía exportada e importada (MWh)</div><div id="chEn"></div>
          ${legend([{ label: "Exportada (descarga)", color: C.s1 }, { label: "Importada (carga)", color: C.s2 }])}`)}
        ${card("Eficiencias", "RTE, batería e inversor (%) · media diaria", `
          <div class="stats">
            <div class="stat"><span>RTE (AC-AC)</span><b>${pct(t.rte)}</b></div>
            <div class="stat"><span>Batería (DC-DC)</span><b>${pct(t.bat)}</b></div>
            <div class="stat"><span>Inversor (DC-AC)</span><b>${pct(t.inv)}</b></div>
          </div>
          <p class="note">La RTE bruta (discontinua) puede superar el 100 % si la batería acaba el día más vacía de lo que empezó; la RTE corregida descuenta esa variación de SOC.</p>
          <div id="chEff"></div>
          ${legend([{ label: "RTE corregida", color: C.brand, line: true }, { label: "RTE bruta", color: C.muted, line: true, dash: true }, { label: "Batería DC-DC", color: C.s1, line: true }, { label: "Inversor", color: C.s2, line: true }])}`)}
      </div>
      ${card("Ingresos diarios frente al precio OMIE", "Mismo eje temporal, escalas separadas", `
        <p class="note">${t.daysRevenue} de ${t.days} días con ambos datos. Precio medio y spread máximo (máx − mín) del mercado diario.</p>
        <div class="grid two">
          <div><div class="mini-title">Ingresos (€)</div><div id="chRev2"></div></div>
          <div><div class="mini-title">Precio OMIE (€/MWh)</div><div id="chPrice"></div>${legend([{ label: "Precio medio", color: C.s1, line: true }, { label: "Spread máximo", color: C.s2, line: true }])}</div>
        </div>`)}
      <div class="card" style="margin-top:14px">
        <details class="tbl"><summary>Ver tabla diaria (${t.days} días)</summary><div class="table-wrap" id="tbl"></div></details>
      </div>`;

    root.querySelector("#per").append(periodControl(draw));

    const revVals = days.map((d) => (d.complete ? d.revenue.total : null));
    const revTip = (i) => {
      const d = days[i];
      if (!d.complete) return `<div class="tip-note">${d.isToday ? "Día en curso: pendiente de liquidación" : "Sin liquidar"}</div>`;
      return tipRow(C.s1, "OMIE", eur(d.revenue.omie)) + tipRow(C.s3, "Servicios ajuste", eur(d.revenue.aaii)) + tipRow(C.neg, "Desvíos", eur(d.revenue.imb + d.revenue.over));
    };
    xyChart(root.querySelector("#chRev"), {
      x,
      tipTitle: (i) => fmtDayLong(days[i].key),
      series: [{ name: "Ingreso del día", type: "bar", values: revVals, color: (v) => (v < 0 ? C.neg : C.brand), fmt: (v) => eur(v) }],
      y: { fmt: (v) => num(v) },
      tipExtra: revTip,
      height: 230,
    });
    hbarChart(root.querySelector("#chComp"), {
      items: [
        { label: "Mercado diario", value: t.omie, color: C.s1, note: "Arbitraje en el mercado diario (compra barata, venta cara)." },
        { label: "Banda aFRR", value: t.band, color: C.s3, note: "Pago por capacidad de regulación secundaria ofertada." },
        { label: "Energía activada", value: t.act, color: C.s3, note: "Energía de regulación activada, neta de la recuperación de SOC." },
        { label: "Coste de desvíos", value: t.imb, color: C.neg },
        { label: "Sobrecoste desvíos", value: t.over, color: C.neg },
      ],
      fmt: (v) => eur(v),
    });
    xyChart(root.querySelector("#chSoc"), {
      x,
      tipTitle: (i) => fmtDayLong(days[i].key),
      series: [{ name: "SOC medio", values: days.map((d) => (!d.isFuture && (d.telemetry || d.isToday) ? d.avgSoc : null)), color: C.brand, fmt: (v) => pct(v) }],
      y: { min: 0, max: 100, fmt: (v) => v + "%" },
      height: 140,
    });
    xyChart(root.querySelector("#chEn"), {
      x,
      tipTitle: (i) => fmtDayLong(days[i].key),
      series: [
        { name: "Exportada", type: "bar", values: days.map((d) => (d.complete && d.telemetry ? d.energy.exp : null)), color: C.s1, fmt: (v) => num(v, dec + 1) + " MWh" },
        { name: "Importada", type: "bar", values: days.map((d) => (d.complete && d.telemetry ? -d.energy.imp : null)), color: C.s2, fmt: (v) => num(v, dec + 1) + " MWh" },
      ],
      tipExtra: (i) => (days[i].complete && days[i].telemetry ? tipRow("", "Neta", num(days[i].energy.net, dec + 1) + " MWh") : ""),
      y: { fmt: (v) => num(v, a.energyMWh < 10 ? 1 : 0) },
      height: 150,
    });
    const ok = (d) => d.complete && d.telemetry;
    xyChart(root.querySelector("#chEff"), {
      x,
      tipTitle: (i) => fmtDayLong(days[i].key),
      series: [
        { name: "RTE corregida", values: days.map((d) => (ok(d) ? d.eff.rteCorr : null)), color: C.brand, fmt: (v) => pct(v, 2) },
        { name: "RTE bruta", values: days.map((d) => (ok(d) ? d.eff.rte : null)), color: C.muted, dash: true, fmt: (v) => pct(v, 2) },
        { name: "Batería DC-DC", values: days.map((d) => (ok(d) ? d.eff.bat : null)), color: C.s1, fmt: (v) => pct(v, 2) },
        { name: "Inversor", values: days.map((d) => (ok(d) ? d.eff.inv : null)), color: C.s2, fmt: (v) => pct(v, 2) },
      ],
      y: { fmt: (v) => v + "%", zero: false },
      refLines: [{ value: a.rte, label: `RTE nominal ${a.rte}%` }],
      height: 230,
    });
    xyChart(root.querySelector("#chRev2"), {
      x,
      tipTitle: (i) => fmtDayLong(days[i].key),
      series: [{ name: "Ingreso", type: "bar", values: revVals, color: (v) => (v < 0 ? C.neg : C.brand), fmt: (v) => eur(v) }],
      height: 190,
    });
    xyChart(root.querySelector("#chPrice"), {
      x,
      tipTitle: (i) => fmtDayLong(days[i].key),
      series: [
        { name: "Precio medio", values: days.map((d) => d.price.avg), color: C.s1, fmt: (v) => num(v, 1) + " €/MWh" },
        { name: "Spread máximo", values: days.map((d) => d.price.spread), color: C.s2, fmt: (v) => num(v, 1) + " €/MWh" },
      ],
      height: 170,
    });

    // tabla
    const rows = days
      .map(
        (d) => `<tr><td>${fmtDayLong(d.key)}</td><td>${d.complete ? eur(d.revenue.total) : "–"}</td><td>${d.complete ? eur(d.revenue.omie) : "–"}</td><td>${d.complete ? eur(d.revenue.aaii) : "–"}</td><td class="${d.complete ? "neg-txt" : ""}">${d.complete ? eur(d.revenue.imb + d.revenue.over) : "–"}</td><td>${ok(d) ? num(d.energy.exp, 3) : "–"}</td><td>${ok(d) ? num(d.energy.imp, 3) : "–"}</td><td>${ok(d) ? pct(d.eff.rteCorr) : "–"}</td><td>${ok(d) ? num(d.efc, 2) : "–"}</td><td>${!d.isFuture ? pct(d.avgSoc) : "–"}</td><td>${num(d.price.avg, 1)}</td></tr>`
      )
      .join("");
    root.querySelector("#tbl").innerHTML = `<table class="data"><thead><tr><th>Día</th><th>Total</th><th>OMIE</th><th>AAII</th><th>Desvíos</th><th>Export MWh</th><th>Import MWh</th><th>RTE</th><th>EFC</th><th>SOC medio</th><th>Precio €/MWh</th></tr></thead><tbody>${rows}</tbody></table>`;

    root.querySelector("#csv").onclick = () => {
      const head = "dia;ingreso_total_eur;omie_eur;aaii_eur;banda_eur;activacion_eur;desvios_eur;sobrecoste_eur;export_mwh;import_mwh;rte_corr_pct;rte_bruta_pct;bat_pct;inv_pct;efc;soc_medio_pct;precio_medio;spread_max";
      const f = (v, d = 2) => (v == null ? "" : String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ","));
      const lines = days.map((d) =>
        [d.key, d.complete ? f(d.revenue.total) : "", d.complete ? f(d.revenue.omie) : "", d.complete ? f(d.revenue.aaii) : "", d.complete ? f(d.revenue.band) : "", d.complete ? f(d.revenue.act) : "", d.complete ? f(d.revenue.imb) : "", d.complete ? f(d.revenue.over) : "", ok(d) ? f(d.energy.exp, 4) : "", ok(d) ? f(d.energy.imp, 4) : "", ok(d) ? f(d.eff.rteCorr) : "", ok(d) ? f(d.eff.rte) : "", ok(d) ? f(d.eff.bat) : "", ok(d) ? f(d.eff.inv) : "", ok(d) ? f(d.efc, 3) : "", f(d.avgSoc), f(d.price.avg), f(d.price.spread)].join(";")
      );
      downloadFile(`bess_${a.id}_${period.from}_${period.to}.csv`, "﻿" + [head, ...lines].join("\n"));
    };
    root.querySelector("#pdf").onclick = () => window.print();
    document.title = `Ejecutivo · ${a.name} · ${periodLabel(period)}`;
  };
  draw();
}
