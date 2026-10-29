import { num, esc, fmtDayLong } from "../util.js";

export const C = {
  brand: "var(--brand)",
  s1: "var(--series-1)",
  s2: "var(--series-2)",
  s3: "var(--series-3)",
  s4: "var(--series-4)",
  neg: "var(--critical)",
  muted: "var(--muted)",
};

export function deltaHtml(cur, prev, invert = false) {
  if (prev == null || cur == null || Math.abs(prev) < 1e-9) return "";
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  const good = invert ? d < 0 : d >= 0;
  return `<span class="delta ${good ? "up" : "down"}" title="vs periodo anterior de igual duración">${d >= 0 ? "▲" : "▼"} ${num(Math.abs(d), 1)} % vs periodo anterior</span>`;
}

export function kpi({ label, sub, value, unit, delta = "", cls = "" }) {
  return `<div class="card kpi ${cls}"><div class="k-label">${esc(label)}</div><div class="k-sub">${esc(sub || "")}</div><div class="k-val">${value}${unit ? `<small>${esc(unit)}</small>` : ""}</div>${delta}</div>`;
}

export function card(title, meta, body = "", id = "") {
  return `<div class="card" ${id ? `id="${id}"` : ""}><div class="card-head"><h2>${esc(title)}</h2>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}</div>${body}</div>`;
}

export function periodLabel(p) {
  return `${fmtDayLong(p.from)} – ${fmtDayLong(p.to)}`;
}

export function emptyState(msg) {
  return `<div class="card"><p class="muted">${esc(msg)}</p></div>`;
}
