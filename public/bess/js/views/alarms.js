import { store } from "../store.js";
import { esc, downloadFile } from "../util.js";

const LVL = { critical: "Crítica", serious: "Grave", warning: "Aviso", good: "Info" };

export function renderAlarms(root) {
  let filter = "all";
  const draw = () => {
    const all = store.get().alarms;
    const list = all.filter((x) => (filter === "open" ? !x.ack && x.active : filter === "critical" ? x.level === "critical" : true));
    root.innerHTML = `
      <div class="view-head">
        <div><h1>Alarmas y eventos</h1><div class="sub">${all.filter((x) => !x.ack && x.active).length} sin reconocer · ${all.length} en el registro</div></div>
        <div class="spacer"></div>
        <div class="seg" id="flt"><button data-f="all">Todas</button><button data-f="open">Sin reconocer</button><button data-f="critical">Críticas</button></div>
        <button class="btn small" id="ackAll">Reconocer todas</button>
        <button class="btn small" id="exp">Exportar CSV</button>
        <button class="btn small" id="clr">Vaciar</button>
      </div>
      <div class="card">
        ${list.length ? list.map((x) => `
          <div class="alarm ${x.ack ? "ack" : ""}">
            <span class="lvl ${esc(x.level)}">${esc(LVL[x.level] || x.level)}</span>
            <div><b>${esc(x.msg)}</b><div class="muted" style="font-size:12px">${esc(x.asset || "")}</div></div>
            <span class="when">${new Date(x.ts).toLocaleString("es-ES")}</span>
            ${!x.ack ? `<button class="btn small" data-ack="${esc(x.id)}">Reconocer</button>` : ""}
          </div>`).join("") : `<p class="muted">Sin eventos. Puedes probar alarmas desde la vista <a href="#/realtime">Tiempo real</a>.</p>`}
      </div>`;
    root.querySelectorAll("#flt button").forEach((b) => {
      b.classList.toggle("on", b.dataset.f === filter);
      b.onclick = () => { filter = b.dataset.f; draw(); };
    });
    root.querySelectorAll("[data-ack]").forEach((b) => (b.onclick = () => {
      store.set({ alarms: store.get().alarms.map((x) => (x.id === b.dataset.ack ? { ...x, ack: true } : x)) });
      draw();
    }));
    root.querySelector("#ackAll").onclick = () => { store.set({ alarms: store.get().alarms.map((x) => ({ ...x, ack: true })) }); draw(); };
    root.querySelector("#clr").onclick = () => { if (confirm("¿Vaciar el registro de alarmas?")) { store.set({ alarms: [] }); draw(); } };
    root.querySelector("#exp").onclick = () => {
      const lines = store.get().alarms.map((x) => [new Date(x.ts).toISOString(), x.level, x.asset, `"${String(x.msg).replace(/"/g, "'")}"`, x.ack ? "si" : "no"].join(";"));
      downloadFile("alarmas.csv", "﻿fecha;nivel;activo;mensaje;reconocida\n" + lines.join("\n"));
    };
  };
  draw();
  const off = store.on(() => {
    if (!document.activeElement || !root.contains(document.activeElement)) draw();
  });
  return () => off();
}
