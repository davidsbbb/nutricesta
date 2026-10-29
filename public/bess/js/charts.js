// Gráficos SVG ligeros, sin dependencias: barras/líneas (un solo eje),
// barras horizontales, cascada, anillo y dispersión. Todos con tooltip.

import { esc, num } from "./util.js";

const NS = "http://www.w3.org/2000/svg";
let tip;
function tooltip() {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.setAttribute("role", "status");
    document.body.append(tip);
  }
  return tip;
}
export function showTip(html, x, y) {
  const t = tooltip();
  t.innerHTML = html;
  t.style.display = "block";
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let left = x + 14;
  let top = y + 14;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top + h > window.innerHeight - 8) top = y - h - 14;
  t.style.left = Math.max(8, left) + "px";
  t.style.top = Math.max(8, top) + "px";
}
export function hideTip() {
  if (tip) tip.style.display = "none";
}
export const tipRow = (color, label, value) =>
  `<div class="tip-row">${color ? `<i style="background:${color}"></i>` : ""}<span>${esc(label)}</span><b>${esc(value)}</b></div>`;

function niceTicks(min, max, count = 5) {
  if (min === max) {
    max = min + 1;
  }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

// Monta un gráfico que se re-dibuja al cambiar de tamaño
function mount(container, draw) {
  container.classList.add("chart");
  const render = () => {
    const w = container.clientWidth || 300;
    container.innerHTML = "";
    draw(w);
  };
  render();
  if (container._ro) container._ro.disconnect();
  let last = container.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - last) > 4) {
      last = container.clientWidth;
      render();
    }
  });
  ro.observe(container);
  container._ro = ro;
  return { rerender: render };
}

function svgEl(w, h) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", `0 0 ${w} ${h}`);
  s.setAttribute("width", w);
  s.setAttribute("height", h);
  return s;
}

// ---------- Barras + líneas con un único eje Y ----------
export function xyChart(container, opts) {
  const state = { lo: 0, hi: opts.x.length - 1 };
  const api = mount(container, (W) => draw(W));
  function draw(W) {
    const H = opts.height || 220;
    const m = { l: opts.yWidth || 46, r: 12, t: 10, b: 26 };
    const lo = state.lo;
    const hi = state.hi;
    const n = hi - lo + 1;
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const vals = [];
    for (const s of opts.series) for (let i = lo; i <= hi; i++) if (s.values[i] != null) vals.push(s.values[i]);
    const hasBar = opts.series.some((s) => s.type === "bar");
    let ymin = opts.y?.min ?? Math.min(hasBar ? 0 : Infinity, ...vals);
    let ymax = opts.y?.max ?? Math.max(hasBar ? 0 : -Infinity, ...vals);
    if (!vals.length) {
      ymin = 0;
      ymax = 1;
    }
    if (opts.y?.min == null && !hasBar && ymin > 0 && opts.y?.zero !== false) ymin = Math.min(0, ymin);
    const ticks = niceTicks(ymin, ymax, opts.y?.ticks || 4);
    const y0 = opts.y?.min ?? ticks[0];
    const y1 = opts.y?.max ?? ticks[ticks.length - 1];
    const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
    const stepT = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
    const tdec = stepT < 1 ? Math.min(4, Math.ceil(-Math.log10(stepT) - 1e-9)) : 0;
    const band = iw / n;
    const X = (i) => m.l + (i - lo + 0.5) * band;
    const s = svgEl(W, H);
    let g = "";
    for (const t of ticks) {
      if (t < y0 - 1e-9 || t > y1 + 1e-9) continue;
      g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      g += `<text class="tick" x="${m.l - 6}" y="${Y(t) + 3.5}" text-anchor="end">${esc((opts.y?.fmt || ((v) => num(v, tdec)))(t))}</text>`;
    }
    const zeroY = Y(Math.max(y0, Math.min(y1, 0)));
    g += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${zeroY}" y2="${zeroY}"/>`;
    // etiquetas eje X
    const maxLabels = Math.max(2, Math.floor(iw / (opts.xLabelWidth || 46)));
    const every = Math.ceil(n / maxLabels);
    for (let i = lo; i <= hi; i++) {
      if ((i - lo) % every !== 0) continue;
      g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(opts.xFmt ? opts.xFmt(i) : opts.x[i])}</text>`;
    }
    // barras
    const bars = opts.series.filter((x) => x.type === "bar");
    const gap = Math.min(6, band * 0.2);
    const bw = Math.max(1, Math.min(48, (band - gap * 2) / Math.max(1, bars.length)));
    bars.forEach((sr, bi) => {
      for (let i = lo; i <= hi; i++) {
        const v = sr.values[i];
        if (v == null) continue;
        const x = X(i) - (bw * bars.length) / 2 + bi * bw + (bars.length > 1 ? 1 : 0);
        const ya = Y(Math.max(0, v));
        const yb = Y(Math.min(0, v));
        const h = Math.max(v === 0 ? 0 : 1, yb - ya);
        const r = Math.min(4, bw / 2, h);
        const col = typeof sr.color === "function" ? sr.color(v, i) : sr.color;
        const wdt = bars.length > 1 ? bw - 2 : bw;
        g += `<path style="fill:${col}" d="${roundedBar(x, ya, wdt, h, r, v >= 0)}"/>`;
      }
    });
    // líneas
    for (const sr of opts.series.filter((x) => x.type !== "bar")) {
      let d = "";
      let pen = false;
      let prevY = null;
      for (let i = lo; i <= hi; i++) {
        const v = sr.values[i];
        if (v == null) {
          pen = false;
          continue;
        }
        const x = X(i);
        const y = Y(v);
        if (!pen) d += `M${x},${y}`;
        else if (sr.step) d += `H${x}V${y}`;
        else d += `L${x},${y}`;
        pen = true;
        prevY = y;
      }
      g += `<path class="line" style="stroke:${sr.color}${sr.dash ? ";stroke-dasharray:5 4" : ""}${sr.width ? ";stroke-width:" + sr.width : ""}" d="${d}"/>`;
      if (sr.markers !== false && n <= 40) {
        for (let i = lo; i <= hi; i++) {
          const v = sr.values[i];
          if (v == null) continue;
          g += `<circle class="dot" cx="${X(i)}" cy="${Y(v)}" r="3.5" style="fill:${sr.color}"/>`;
        }
      }
      void prevY;
    }
    if (opts.refLines) {
      for (const rl of opts.refLines) {
        if (rl.value < y0 || rl.value > y1) continue;
        g += `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${Y(rl.value)}" y2="${Y(rl.value)}"/>`;
        g += `<text class="tick ref-label" x="${W - m.r - 2}" y="${Y(rl.value) - 4}" text-anchor="end">${esc(rl.label)}</text>`;
      }
    }
    if (opts.nowIndex != null && opts.nowIndex >= lo && opts.nowIndex <= hi) {
      g += `<line class="now" x1="${X(opts.nowIndex)}" x2="${X(opts.nowIndex)}" y1="${m.t}" y2="${m.t + ih}"/>`;
    }
    g += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="display:none"/>`;
    g += `<rect class="sel" x="0" y="${m.t}" width="0" height="${ih}" style="display:none"/>`;
    g += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/>`;
    s.innerHTML = g;
    container.append(s);
    const hit = s.querySelector(".hit");
    const cross = s.querySelector(".cross");
    const sel = s.querySelector(".sel");
    const idxAt = (ev) => {
      const rect = s.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      return { i: Math.max(lo, Math.min(hi, lo + Math.floor((px - m.l) / band))), px };
    };
    let drag = null;
    hit.addEventListener("pointermove", (ev) => {
      const { i, px } = idxAt(ev);
      cross.setAttribute("x1", X(i));
      cross.setAttribute("x2", X(i));
      cross.style.display = "";
      if (drag != null) {
        sel.style.display = "";
        sel.setAttribute("x", Math.min(drag.px, px));
        sel.setAttribute("width", Math.abs(px - drag.px));
      }
      const head = opts.tipTitle ? opts.tipTitle(i) : opts.x[i];
      const rows = opts.series
        .map((sr) => (sr.values[i] == null ? tipRow(sr.color && typeof sr.color === "string" ? sr.color : "", sr.name, "sin datos") : tipRow(typeof sr.color === "function" ? sr.color(sr.values[i], i) : sr.color, sr.name, (sr.fmt || opts.y?.fmt || ((v) => num(v, 1)))(sr.values[i]))))
        .join("");
      showTip(`<div class="tip-head">${esc(head)}</div>${rows}${opts.tipExtra ? opts.tipExtra(i) : ""}`, ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => {
      cross.style.display = "none";
      hideTip();
    });
    if (opts.zoom) {
      hit.addEventListener("pointerdown", (ev) => {
        drag = idxAt(ev);
        hit.setPointerCapture(ev.pointerId);
      });
      hit.addEventListener("pointerup", (ev) => {
        if (!drag) return;
        const end = idxAt(ev);
        const a = Math.min(drag.i, end.i);
        const b = Math.max(drag.i, end.i);
        drag = null;
        sel.style.display = "none";
        if (b - a >= 3) {
          state.lo = a;
          state.hi = b;
          api.rerender();
        }
      });
      container.tabIndex = 0;
      container.onkeydown = (ev) => {
        const span = state.hi - state.lo;
        if (ev.key === "Escape") {
          state.lo = 0;
          state.hi = opts.x.length - 1;
        } else if (ev.key === "+" && span > 8) {
          state.lo += Math.floor(span / 4);
          state.hi -= Math.floor(span / 4);
        } else if (ev.key === "-") {
          state.lo = Math.max(0, state.lo - Math.ceil(span / 2));
          state.hi = Math.min(opts.x.length - 1, state.hi + Math.ceil(span / 2));
        } else if (ev.key === "ArrowLeft" && state.lo > 0) {
          const d = Math.min(state.lo, Math.ceil(span / 4));
          state.lo -= d;
          state.hi -= d;
        } else if (ev.key === "ArrowRight" && state.hi < opts.x.length - 1) {
          const d = Math.min(opts.x.length - 1 - state.hi, Math.ceil(span / 4));
          state.lo += d;
          state.hi += d;
        } else return;
        ev.preventDefault();
        api.rerender();
      };
      hit.addEventListener("dblclick", () => {
        state.lo = 0;
        state.hi = opts.x.length - 1;
        api.rerender();
      });
    }
  }
  return api;
}

function roundedBar(x, y, w, h, r, up) {
  if (h <= 0) return "";
  if (up)
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

// ---------- Barras horizontales con valores negativos ----------
export function hbarChart(container, { items, fmt = (v) => num(v) }) {
  return mount(container, (W) => {
    const rowH = 38;
    const labelW = Math.min(150, W * 0.34);
    const m = { l: labelW, r: 70, t: 6, b: 6 };
    const H = m.t + m.b + items.length * rowH;
    const vals = items.map((i) => i.value);
    const min = Math.min(0, ...vals);
    const max = Math.max(0, ...vals);
    const iw = W - m.l - m.r;
    const X = (v) => m.l + ((v - min) / (max - min || 1)) * iw;
    const s = svgEl(W, H);
    let g = `<line class="axis" x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${H - m.b}"/>`;
    items.forEach((it, k) => {
      const y = m.t + k * rowH + 9;
      const h = rowH - 18;
      const x0 = X(Math.min(0, it.value));
      const w = Math.max(it.value === 0 ? 0 : 1.5, Math.abs(X(it.value) - X(0)));
      g += `<text class="lbl" x="${m.l - 10}" y="${y + h / 2 + 4}" text-anchor="end">${esc(it.label)}</text>`;
      if (w > 0) g += `<rect x="${x0}" y="${y}" width="${w}" height="${h}" rx="3" style="fill:${it.color}"/>`;
      const tx = it.value >= 0 ? X(it.value) + 6 : X(0) + 6;
      g += `<text class="val" x="${tx}" y="${y + h / 2 + 4}">${esc(fmt(it.value))}</text>`;
      g += `<rect class="hit" data-k="${k}" x="0" y="${m.t + k * rowH}" width="${W}" height="${rowH}"/>`;
    });
    s.innerHTML = g;
    container.append(s);
    s.querySelectorAll(".hit").forEach((h) => {
      h.addEventListener("pointermove", (ev) => {
        const it = items[+h.dataset.k];
        showTip(`<div class="tip-head">${esc(it.label)}</div>${tipRow(it.color, "Importe", fmt(it.value))}${it.note ? `<div class="tip-note">${esc(it.note)}</div>` : ""}`, ev.clientX, ev.clientY);
      });
      h.addEventListener("pointerleave", hideTip);
    });
  });
}

// ---------- Cascada ----------
export function waterfall(container, { steps, fmt = (v) => num(v, 1), colors }) {
  return mount(container, (W) => {
    const H = 300;
    const narrow = W < 640;
    const m = { l: 52, r: 10, t: 24, b: narrow ? 92 : 70 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    let run = 0;
    const geo = steps.map((st) => {
      let a;
      let b;
      if (st.type === "delta") {
        a = run;
        b = run + st.value;
        run = b;
      } else {
        a = 0;
        b = st.value;
        run = st.value;
      }
      return { ...st, a, b };
    });
    const all = geo.flatMap((x) => [x.a, x.b]);
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4);
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
    const band = iw / steps.length;
    const bw = Math.min(46, band * 0.62);
    const s = svgEl(W, H);
    let g = "";
    for (const t of ticks) {
      g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      g += `<text class="tick" x="${m.l - 6}" y="${Y(t) + 3.5}" text-anchor="end">${esc(num(t))}</text>`;
    }
    g += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    geo.forEach((st, i) => {
      const cx = m.l + (i + 0.5) * band;
      const top = Y(Math.max(st.a, st.b));
      const h = Math.max(1.5, Math.abs(Y(st.a) - Y(st.b)));
      const col = st.type === "delta" ? (st.value >= 0 ? colors.pos : colors.neg) : st.type === "final" ? colors.final : st.type === "base" ? colors.base : colors.sub;
      g += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="3" style="fill:${col}"/>`;
      if (i < geo.length - 1) {
        const nx = m.l + (i + 1.5) * band;
        g += `<line class="connector" x1="${cx + bw / 2}" x2="${nx - bw / 2}" y1="${Y(st.b)}" y2="${Y(st.b)}"/>`;
      }
      if (!narrow || st.type !== "delta")
        g += `<text class="val" x="${cx}" y="${top - 6}" text-anchor="middle">${esc((st.type === "delta" && st.value > 0 ? "+" : "") + fmt(st.value))}</text>`;
      const lx = cx;
      const ly = H - m.b + 14;
      g += `<text class="tick wf-label" transform="translate(${lx},${ly}) rotate(-35)" text-anchor="end">${esc(st.label)}</text>`;
      g += `<rect class="hit" data-k="${i}" x="${cx - band / 2}" y="${m.t}" width="${band}" height="${H - m.t}"/>`;
    });
    s.innerHTML = g;
    container.append(s);
    s.querySelectorAll(".hit").forEach((h) => {
      h.addEventListener("pointermove", (ev) => {
        const st = geo[+h.dataset.k];
        showTip(`<div class="tip-head">${esc(st.label)}</div>${tipRow("", st.type === "delta" ? "Ajuste" : "Valor", fmt(st.value) + " €/MWh·día")}${st.type === "delta" ? tipRow("", "Acumulado", fmt(st.b)) : ""}<div class="tip-note">${esc(st.hint || "")}</div>`, ev.clientX, ev.clientY);
      });
      h.addEventListener("pointerleave", hideTip);
    });
  });
}

// ---------- Anillo (gauge) ----------
export function ring(container, { value, max = 100, label, sub, color = "var(--series-1)", size = 150 }) {
  const frac = Math.max(0, Math.min(1, (value ?? 0) / max));
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const arc = 0.75; // 270º
  container.classList.add("ring");
  container.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    <g transform="rotate(135 ${size / 2} ${size / 2})">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track" stroke-dasharray="${c * arc} ${c}" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-val" style="stroke:${color}" stroke-dasharray="${c * arc * frac} ${c}" />
    </g>
  </svg><div class="ring-text"><b>${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`;
}

// ---------- Dispersión P-Q ----------
export function scatter(container, { series, domain = [-1.1, 1.1], circle = true, xLabel = "", yLabel = "" }) {
  return mount(container, (W) => {
    const H = Math.min(300, Math.max(220, W * 0.6));
    const m = { l: 40, r: 12, t: 10, b: 30 };
    const side = Math.min(W - m.l - m.r, H - m.t - m.b);
    const ox = m.l + (W - m.l - m.r - side) / 2;
    const X = (v) => ox + ((v - domain[0]) / (domain[1] - domain[0])) * side;
    const Y = (v) => m.t + side - ((v - domain[0]) / (domain[1] - domain[0])) * side;
    const s = svgEl(W, H);
    let g = "";
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      g += `<line class="grid" x1="${X(domain[0])}" x2="${X(domain[1])}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      g += `<line class="grid" y1="${Y(domain[0])}" y2="${Y(domain[1])}" x1="${X(t)}" x2="${X(t)}"/>`;
      g += `<text class="tick" x="${ox - 6}" y="${Y(t) + 3.5}" text-anchor="end">${num(t, 1)}</text>`;
      g += `<text class="tick" x="${X(t)}" y="${m.t + side + 14}" text-anchor="middle">${num(t, 1)}</text>`;
    }
    if (circle) g += `<circle class="envelope" cx="${X(0)}" cy="${Y(0)}" r="${X(1) - X(0)}"/>`;
    g += `<text class="tick" x="${ox + side}" y="${m.t + side + 26}" text-anchor="end">${esc(xLabel)}</text>`;
    g += `<text class="tick" x="${ox + 4}" y="${m.t + 10}">${esc(yLabel)}</text>`;
    series.forEach((sr, si) => {
      sr.points.forEach((p, pi) => {
        g += `<circle class="pt" data-s="${si}" data-p="${pi}" cx="${X(p[0])}" cy="${Y(p[1])}" r="${sr.r || 4}" style="fill:${sr.color}"/>`;
      });
    });
    s.innerHTML = g;
    container.append(s);
    s.querySelectorAll(".pt").forEach((c) => {
      c.addEventListener("pointermove", (ev) => {
        const sr = series[+c.dataset.s];
        const p = sr.points[+c.dataset.p];
        showTip(`<div class="tip-head">${esc(sr.name)}${p[2] ? " · " + esc(p[2]) : ""}</div>${tipRow(sr.color, "P (pu)", num(p[0], 3))}${tipRow("", "Q (pu)", num(p[1], 3))}`, ev.clientX, ev.clientY);
      });
      c.addEventListener("pointerleave", hideTip);
    });
  });
}

export function legend(items) {
  return `<div class="legend">${items.map((i) => `<span class="lg"><i class="${i.line ? "lg-line" : ""}${i.dash ? " lg-dash" : ""}" style="${i.line ? "border-color" : "background"}:${i.color}"></i>${esc(i.label)}</span>`).join("")}</div>`;
}
