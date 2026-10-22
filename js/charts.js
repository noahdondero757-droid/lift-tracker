// Small hand-rolled SVG charts. Colors come from CSS tokens so light/dark both work.

const W = 340;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function niceStep(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x || 1))), f = x / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

const fmtK = v => v >= 10000 ? Math.round(v / 1000) + "k" : v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(v));

function yAxis(lo, hi, Y, L, R) {
  const step = niceStep((hi - lo) / 4);
  let g = "";
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step)
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="var(--line)"/><text x="${L - 6}" y="${(Y(t) + 3).toFixed(1)}" text-anchor="end">${fmtK(t)}</text>`;
  return g;
}

const md = s => { const [, m, d] = s.split("-").map(Number); return `${m}/${d}`; };

// Progress: two series (top-set weight, e1RM) sharing one lb axis.
// pts: [{date, id, w, e}] oldest first. x is by date so gaps between sessions show.
export function progressChart(pts) {
  const H = 200, L = 38, R = 12, T = 14, B = 24, iw = W - L - R, ih = H - T - B;
  const t0 = +new Date(pts[0].date), t1 = +new Date(pts[pts.length - 1].date);
  const all = pts.flatMap(p => [p.w, p.e]);
  let lo = Math.min(...all), hi = Math.max(...all);
  const padv = (hi - lo) * 0.15 || Math.max(5, hi * 0.08);
  lo = Math.max(0, lo - padv); hi += padv;
  const X = p => L + (t1 === t0 ? iw / 2 : (+new Date(p.date) - t0) / (t1 - t0) * iw);
  const Y = v => T + ih * (1 - (v - lo) / (hi - lo));
  let g = yAxis(lo, hi, Y, L, R);
  const line = (k, c) => `<path d="${pts.map((p, j) => (j ? "L" : "M") + X(p).toFixed(1) + " " + Y(p[k]).toFixed(1)).join("")}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  g += line("e", "var(--c2)") + line("w", "var(--c1)");
  for (const p of pts) {
    g += `<circle cx="${X(p).toFixed(1)}" cy="${Y(p.e).toFixed(1)}" r="4" fill="var(--c2)" stroke="var(--surface)" stroke-width="2"/>`;
    g += `<circle cx="${X(p).toFixed(1)}" cy="${Y(p.w).toFixed(1)}" r="4" fill="var(--c1)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  // Direct labels on the latest point.
  const last = pts[pts.length - 1], lx = Math.min(X(last), W - R - 2);
  g += `<text class="dl" x="${lx}" y="${(Y(last.e) - 9).toFixed(1)}" text-anchor="${pts.length > 1 ? "end" : "middle"}">${Math.round(last.e)}</text>`;
  g += `<text class="dl" x="${lx}" y="${(Y(last.w) + 17).toFixed(1)}" text-anchor="${pts.length > 1 ? "end" : "middle"}">${last.w}</text>`;
  // X ticks: first and last date (and middle if room).
  const ticks = pts.length > 2 ? [pts[0], pts[Math.floor(pts.length / 2)], last] : pts.length === 2 ? [pts[0], last] : [last];
  ticks.forEach((p, k) => g += `<text x="${X(p).toFixed(1)}" y="${H - 6}" text-anchor="${ticks.length === 1 ? "middle" : k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle"}">${md(p.date)}</text>`);
  // Tap targets: a tall invisible column per session.
  const colW = Math.max(28, pts.length > 1 ? iw / (pts.length - 1) : iw);
  for (const p of pts)
    g += `<rect class="hit" x="${(X(p) - colW / 2).toFixed(1)}" y="${T}" width="${colW.toFixed(1)}" height="${ih}" fill="transparent" data-act="openw" data-id="${esc(p.id)}"><title>${esc(md(p.date))}: ${p.w} lb top set, e1RM ${Math.round(p.e)}</title></rect>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Top set weight and estimated 1RM over time">${g}</svg>`;
}

// Weekly bars. bars: [{label, v, info}] oldest first. goal draws a dashed reference line.
export function barChart(bars, { goal, id, showVals } = {}) {
  const H = 170, L = 34, R = 8, T = 16, B = 22, iw = W - L - R, ih = H - T - B;
  const hi0 = Math.max(goal || 0, ...bars.map(b => b.v));
  const hi = hi0 ? hi0 * 1.12 : 1;
  const Y = v => T + ih * (1 - v / hi);
  let g = yAxis(0, hi, Y, L, R);
  const slot = iw / bars.length, bw = Math.min(26, slot * 0.62);
  bars.forEach((b, i) => {
    const x = L + slot * i + (slot - bw) / 2, y = Y(b.v), h = Math.max(0, Y(0) - y);
    if (b.v > 0) {
      const r = Math.min(4, h, bw / 2);
      // Rounded top, square base.
      g += `<path d="M${x.toFixed(1)} ${Y(0).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)} ${y.toFixed(1)} ${(x + bw).toFixed(1)} ${(y + r).toFixed(1)}V${Y(0).toFixed(1)}Z" fill="var(--c1)"/>`;
      if (showVals) g += `<text class="dl" x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${b.v}</text>`;
    }
    if (i % 2 === (bars.length - 1) % 2) g += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>`;
    g += `<rect x="${(L + slot * i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ih}" fill="transparent" data-act="barinfo" data-out="${id}" data-text="${esc(b.info)}"><title>${esc(b.info)}</title></rect>`;
  });
  if (goal) g += `<line x1="${L}" x2="${W - R}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${W - R}" y="${(Y(goal) - 4).toFixed(1)}" text-anchor="end">target ${goal}</text>`;
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--muted)" opacity=".6"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
