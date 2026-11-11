// Utilidades generales: DOM, dinero, fechas (siempre como texto 'AAAA-MM-DD' en hora local).

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
export const num = (n) => nf.format(Math.round(n || 0));
export const money = (n) => (n < 0 ? '-$ ' : '$ ') + nf.format(Math.abs(Math.round(n || 0)));
/** Formato corto: $ 1,2 M / $ 350 mil */
export function moneyShort(n) {
  const a = Math.abs(n || 0);
  const s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$ ${(a / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `${s}$ ${Math.round(a / 1e3).toLocaleString('es-CO')} mil`;
  return money(n);
}
export function parseMoney(s) {
  const d = String(s ?? '').replace(/[^\d]/g, '');
  return d ? parseInt(d, 10) : 0;
}
export function parseNum(s) {
  const v = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

// ---- Fechas ----
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const today = () => ymd(new Date());
export function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function addMonths(s, n) {
  const d = parseYmd(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return ymd(d);
}
/** a - b en días */
export const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 86400000);
export const isSunday = (s) => parseYmd(s).getDay() === 0;
export const monthKey = (s) => String(s).slice(0, 7);

const dfLong = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dfShort = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const dfFull = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const dfMonth = new Intl.DateTimeFormat('es-CO', { month: 'short' });
export const fdate = (s) => (s ? dfLong.format(parseYmd(s)) : '—');
export const fshort = (s) => (s ? dfShort.format(parseYmd(s)).replace('.', '') : '—');
export const ffull = (s) => dfFull.format(parseYmd(s));
export const fmonth = (key) => dfMonth.format(parseYmd(key + '-01')).replace('.', '');

export function relDays(s, ref = today()) {
  const d = diffDays(s, ref);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}
const AV = ['tone-primary', 'tone-info', 'tone-violet', 'tone-warn', 'tone-ok'];
export function avatarTone(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);

/** Convierte un input de texto en campo de dinero con separador de miles. */
export function moneyInput(el) {
  const fmt = () => {
    const v = parseMoney(el.value);
    el.value = v ? num(v) : '';
  };
  el.setAttribute('inputmode', 'numeric');
  el.setAttribute('autocomplete', 'off');
  el.addEventListener('input', () => {
    fmt();
    el.setSelectionRange?.(el.value.length, el.value.length);
  });
  fmt();
}

/** Teléfono para WhatsApp: agrega el indicativo si hace falta. */
export function waPhone(tel, indicativo = '57') {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 && !d.startsWith(indicativo)) d = indicativo + d;
  return d;
}
