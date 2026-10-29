// Descarga los precios marginales del mercado diario de OMIE (España) y los
// guarda como JSON en public/omie/ para que las apps los lean sin conexión
// directa a OMIE (que no permite peticiones desde el navegador).
//
// Uso: node scripts/fetch-omie.mjs [diasAtras=45]
// Se ejecuta en GitHub Actions antes de compilar la web.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const OUT = new URL("../public/omie/", import.meta.url);
const DAYS_BACK = Number(process.argv[2] || 45);

const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function parseMarginal(text) {
  // Formato: MARGINALPDBC;  /  AAAA;MM;DD;PERIODO;PRECIO_PT;PRECIO_ES;  /  *
  const pt = [];
  const es = [];
  for (const raw of text.split(/\r?\n/)) {
    const f = raw.trim().split(";");
    if (f.length < 6 || !/^\d{4}$/.test(f[0])) continue;
    const per = Number(f[3]);
    const p = Number(String(f[4]).replace(",", "."));
    const e = Number(String(f[5]).replace(",", "."));
    if (!per || Number.isNaN(e)) continue;
    pt[per - 1] = p;
    es[per - 1] = e;
  }
  return { pt, es };
}

async function fetchDay(d) {
  const ymd = key(d).replaceAll("-", "");
  for (const v of [1, 2]) {
    const url = `https://www.omie.es/es/file-download?parents%5B0%5D=marginalpdbc&filename=marginalpdbc_${ymd}.${v}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "plan-hidraulico/1.0" } });
      if (!res.ok) continue;
      const txt = await res.text();
      const { es, pt } = parseMarginal(txt);
      if (es.length >= 23) return { es, pt, source: url };
    } catch {
      /* reintenta con la siguiente versión */
    }
  }
  return null;
}

async function main() {
  await mkdir(new URL("days/", OUT), { recursive: true });
  const now = new Date();
  const days = [];
  // de mañana hacia atrás
  for (let i = -1; i <= DAYS_BACK; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    days.push(d);
  }
  const ok = [];
  for (const d of days) {
    const k = key(d);
    const file = new URL(`days/${k}.json`, OUT);
    if (existsSync(file)) {
      ok.push(k);
      continue;
    }
    const r = await fetchDay(d);
    if (r) {
      await writeFile(file, JSON.stringify({ date: k, periods: r.es.length, es: r.es, pt: r.pt, fetched: new Date().toISOString() }));
      ok.push(k);
      console.log(`OMIE ${k}: ${r.es.length} periodos`);
    } else console.log(`OMIE ${k}: no disponible`);
    await new Promise((s) => setTimeout(s, 250));
  }
  ok.sort();
  let prev = {};
  try {
    prev = JSON.parse(await readFile(new URL("index.json", OUT), "utf8"));
  } catch {
    /* sin índice previo */
  }
  const all = [...new Set([...(prev.days || []), ...ok])].sort();
  await writeFile(new URL("index.json", OUT), JSON.stringify({ updated: new Date().toISOString(), latest: all[all.length - 1] || null, days: all }));
  console.log(`Índice: ${all.length} días, último ${all[all.length - 1]}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    // nunca rompe la publicación de la web
    console.error("Aviso: no se pudieron descargar precios OMIE:", e.message);
  });
}
