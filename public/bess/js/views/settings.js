import { store } from "../store.js";
import { live } from "../live.js";
import { parsePriceCsv, clearCache } from "../model.js";
import { esc, downloadFile, num } from "../util.js";
import { toast } from "../period.js";

const FIELDS = [
  ["name", "Nombre", "text"],
  ["location", "Ubicación", "text"],
  ["type", "Tipología", "select", [["standalone", "Stand-alone (carga de red)"], ["hybrid", "Híbrida FV (carga solo desde FV)"]]],
  ["powerMW", "Potencia (MW)", "number", null, "0.01"],
  ["energyMWh", "Energía instalada (MWh)", "number", null, "0.01"],
  ["pvMWp", "FV asociada (MWp)", "number", null, "0.1", "Solo para híbridas"],
  ["strategy", "Estrategia", "select", [["omie", "Arbitraje mercado diario (OMIE)"], ["aaii", "Servicios de ajuste (banda aFRR)"], ["mixed", "Mixta: banda + arbitraje"]]],
  ["bandShare", "Potencia en banda (%)", "number", null, "1", "Para estrategia mixta"],
  ["rte", "RTE nominal AC-AC (%)", "number", null, "0.1"],
  ["invEff", "Eficiencia inversor (%)", "number", null, "0.1"],
  ["socMin", "SOC mínimo (%)", "number", null, "1"],
  ["socMax", "SOC máximo (%)", "number", null, "1"],
  ["maxCycles", "Ciclos máx./día", "number", null, "0.1"],
  ["degCost", "Coste degradación (€/MWh)", "number", null, "0.5", "Penaliza ciclos poco rentables"],
  ["availability", "Disponibilidad (%)", "number", null, "0.1"],
  ["imbalanceErr", "Error de seguimiento (%)", "number", null, "0.5"],
  ["overcost", "Sobrecoste desvío (€/MWh)", "number", null, "0.5"],
  ["commissioning", "Puesta en marcha", "date"],
];

export function renderSettings(root) {
  const draw = () => {
    const s = store.get();
    const a = store.asset();
    const pdays = Object.keys(s.prices).sort();
    root.innerHTML = `
      <div class="view-head"><div><h1>Activos y ajustes</h1><div class="sub">Todo se guarda en este navegador.</div></div></div>
      <div class="card mb">
        <div class="card-head"><h2>Activo: ${esc(a.name)}</h2><span class="meta">${s.assets.length} activo(s) en cartera</span></div>
        <form id="f" class="form-grid">
          ${FIELDS.map(([k, label, type, opts, step, hint]) => `<label class="field">${esc(label)}${
            type === "select"
              ? `<select name="${k}">${opts.map(([v, l]) => `<option value="${v}" ${a[k] === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`
              : `<input name="${k}" type="${type}" ${step ? `step="${step}"` : ""} value="${esc(a[k] ?? "")}" required />`
          }${hint ? `<small>${esc(hint)}</small>` : ""}</label>`).join("")}
        </form>
        <div class="btn-row" style="margin-top:14px">
          <button class="btn primary" id="save">Guardar cambios</button>
          <button class="btn" id="dup">Duplicar como nuevo activo</button>
          <button class="btn" id="new">Nuevo activo</button>
          <button class="btn danger" id="del" ${s.assets.length <= 1 ? "disabled" : ""}>Eliminar activo</button>
        </div>
      </div>
      <div class="grid two mb">
        <div class="card">
          <div class="card-head"><h2>Precios OMIE reales</h2><span class="meta">${pdays.length ? `${pdays.length} días importados (${pdays[0]} → ${pdays[pdays.length - 1]})` : "Usando precios simulados"}</span></div>
          <p class="note">Formatos admitidos (separador ; , o tabulador): <code>2026-10-21 14:15;85,3</code> · <code>21/10/2026;15;85,3</code> (hora 1‑24 o cuarto 1‑96). Los días importados sustituyen al simulador y el despacho óptimo se recalcula con ellos.</p>
          <label class="field">Archivo CSV<input type="file" id="file" accept=".csv,.txt" /></label>
          <label class="field" style="margin-top:10px">O pega aquí los datos<textarea id="paste" rows="5" placeholder="2026-10-21 00:00;72,1&#10;2026-10-21 00:15;70,4"></textarea></label>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="imp">Importar</button><button class="btn" id="clrP" ${pdays.length ? "" : "disabled"}>Borrar precios importados</button></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Fuente de tiempo real</h2></div>
          <label class="field">Origen de datos
            <select id="src"><option value="sim" ${s.realtime.source === "sim" ? "selected" : ""}>Simulador (sigue el programa óptimo)</option><option value="api" ${s.realtime.source === "api" ? "selected" : ""}>API REST de la planta (JSON)</option></select></label>
          <label class="field" style="margin-top:10px">URL del endpoint<input id="url" type="url" placeholder="https://mi-scada.example/api/bess/estado" value="${esc(s.realtime.url || "")}" /><small>Se consulta cada 5 s. Debe permitir CORS.</small></label>
          <p class="note">Respuesta esperada: <code>{"soc": 89.7, "p_mw": -0.35, "q_mvar": 0, "setpoint_mw": -0.35, "temp_c": 23, "energy_exported_mwh": 0.04, "energy_imported_mwh": 0.93, "alarms": {"fire": false, "intrusion": false}}</code></p>
          <div class="btn-row"><button class="btn primary" id="saveRt">Aplicar</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Copia de seguridad</h2></div>
        <div class="btn-row">
          <button class="btn" id="expCfg">Exportar configuración</button>
          <label class="btn">Importar configuración<input type="file" id="impCfg" accept=".json" hidden /></label>
          <button class="btn danger" id="reset">Restablecer todo</button>
        </div>
      </div>`;

    const $ = (q) => root.querySelector(q);
    const form = $("#f");
    const read = () => {
      const fd = new FormData(form);
      const patch = {};
      for (const [k, , type] of FIELDS) {
        const v = fd.get(k);
        patch[k] = type === "number" ? parseFloat(v) : v;
      }
      return patch;
    };
    const validate = (p) => {
      if (!(p.powerMW > 0) || !(p.energyMWh > 0)) return "Potencia y energía deben ser mayores que 0.";
      if (!(p.socMin >= 0 && p.socMax <= 100 && p.socMin < p.socMax)) return "Revisa los límites de SOC.";
      if (!(p.rte > 40 && p.rte < 100)) return "RTE fuera de rango (40–100 %).";
      if (!(p.maxCycles > 0)) return "Ciclos máximos debe ser mayor que 0.";
      if (p.type === "hybrid" && !(p.pvMWp > 0)) return "Una híbrida necesita potencia FV (MWp).";
      return null;
    };
    $("#save").onclick = () => {
      const p = read();
      const err = validate(p);
      if (err) return toast(err);
      store.updateAsset(a.id, p);
      clearCache();
      live.restart();
      toast("Activo guardado. Los cálculos se han actualizado.");
      draw();
    };
    $("#dup").onclick = () => {
      const p = read();
      const err = validate(p);
      if (err) return toast(err);
      store.addAsset({ ...a, ...p, id: "a" + Date.now().toString(36), name: p.name + " (copia)" });
      live.restart();
      draw();
    };
    $("#new").onclick = () => {
      store.addAsset({ ...a, id: "a" + Date.now().toString(36), name: "Nuevo BESS", location: "", type: "standalone", powerMW: 10, energyMWh: 20, pvMWp: 0, strategy: "omie", commissioning: new Date().toISOString().slice(0, 10) });
      live.restart();
      toast("Activo creado: ajusta sus datos y guarda.");
      draw();
    };
    $("#del").onclick = () => {
      if (!confirm(`¿Eliminar ${a.name}?`)) return;
      store.removeAsset(a.id);
      live.restart();
      draw();
    };
    $("#imp").onclick = async () => {
      let text = $("#paste").value;
      const f = $("#file").files[0];
      if (f) text = (await f.text()) + "\n" + text;
      const parsed = parsePriceCsv(text);
      const n = Object.keys(parsed).length;
      if (!n) return toast("No se ha reconocido ningún precio. Revisa el formato.");
      store.set({ prices: { ...store.get().prices, ...parsed } });
      clearCache();
      live.restart();
      toast(`Importados ${n} día(s) de precios.`);
      draw();
    };
    $("#clrP").onclick = () => {
      store.set({ prices: {} });
      clearCache();
      live.restart();
      draw();
    };
    $("#saveRt").onclick = () => {
      const source = $("#src").value;
      const url = $("#url").value.trim();
      if (source === "api" && !/^https?:\/\//.test(url)) return toast("Introduce una URL http(s) válida.");
      store.set({ realtime: { ...store.get().realtime, source, url } });
      live.setSource(source);
      toast(source === "api" ? "Conectando con la API…" : "Usando el simulador.");
    };
    $("#expCfg").onclick = () => downloadFile("acumula-config.json", JSON.stringify(store.get(), null, 2), "application/json");
    $("#impCfg").onchange = async (e) => {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        if (!Array.isArray(j.assets) || !j.assets.length) throw new Error();
        store.set({ ...j });
        clearCache();
        live.restart();
        toast("Configuración importada.");
        draw();
      } catch {
        toast("Archivo no válido.");
      }
    };
    $("#reset").onclick = () => {
      if (!confirm("Se borrarán activos, precios importados y alarmas. ¿Continuar?")) return;
      store.reset();
      clearCache();
      live.restart();
      draw();
    };
    void num;
  };
  draw();
}
