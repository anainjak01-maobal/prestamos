// Gráficas SVG livianas (funcionan sin internet). Colores tomados de las variables CSS.
import { esc, moneyShort, money } from './utils.js';

/**
 * Barras. series: [{ name, color, values: [n...] }], labels: [...]
 */
export function bars({ labels, series, height = 180, highlightLast = false, labelEvery = 1 }) {
  const W = 340, H = height, padL = 4, padB = 22, padT = 18;
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const slot = (W - padL) / Math.max(1, n);
  const groupW = slot * 0.72;
  const bw = groupW / series.length;
  const y = (v) => padT + (H - padB - padT) * (1 - v / max);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  // líneas guía
  for (let i = 0; i <= 3; i++) {
    const gy = padT + ((H - padB - padT) * i) / 3;
    out += `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="var(--border)" stroke-dasharray="3 4"/>`;
  }
  out += `<text x="${W}" y="${padT - 6}" text-anchor="end">${esc(moneyShort(max))}</text>`;
  labels.forEach((lb, i) => {
    const x0 = padL + i * slot + (slot - groupW) / 2;
    series.forEach((s, j) => {
      const v = s.values[i] || 0;
      const h = Math.max(v > 0 ? 2 : 0, H - padB - y(v));
      const x = x0 + j * bw;
      const op = highlightLast && i !== n - 1 ? 0.55 : 1;
      out += `<rect x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 3).toFixed(1)}" fill="${s.color}" opacity="${op}"><title>${esc(lb)} · ${esc(s.name)}: ${esc(money(v))}</title></rect>`;
    });
    if (i % labelEvery === 0 || i === n - 1) {
      out += `<text x="${(padL + i * slot + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(lb)}</text>`;
    }
  });
  out += '</svg>';
  if (series.length > 1) {
    out += `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }
  return out;
}

/** Dona. segments: [{ label, value, color, sub }] */
export function donut({ segments, center = '', centerSub = '' }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 52, r = 36, C = 60;
  let a0 = -Math.PI / 2;
  let paths = '';
  if (total <= 0) {
    paths = `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="var(--border)" stroke-width="${R - r}"/>`;
  } else {
    for (const s of segments) {
      if (s.value <= 0) continue;
      const frac = s.value / total;
      if (frac >= 0.9999) {
        paths += `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${s.color}" stroke-width="${R - r}"/>`;
        break;
      }
      const a1 = a0 + frac * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)} ${(C + rad * Math.sin(a)).toFixed(2)}`;
      paths += `<path d="M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z" fill="${s.color}"><title>${esc(s.label)}</title></path>`;
      a0 = a1;
    }
  }
  const svg = `<svg class="chart" viewBox="0 0 120 120">${paths}
    <text x="60" y="58" text-anchor="middle" style="font-size:17px;font-weight:800;fill:var(--text)">${esc(center)}</text>
    <text x="60" y="74" text-anchor="middle" style="font-size:9px">${esc(centerSub)}</text></svg>`;
  const legend = segments
    .map((s) => `<div><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${s.color};margin-right:7px"></i>${esc(s.label)}</span><b class="num">${esc(s.sub ?? s.value)}</b></div>`)
    .join('');
  return `<div class="donut-wrap"><div>${svg}</div><div class="donut-legend">${legend}</div></div>`;
}
