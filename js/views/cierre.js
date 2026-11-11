// Cierre del día: lo cobrado, lo prestado, los gastos y quién no pagó.
import { icon } from '../icons.js';
import { $, esc, money, today, addDays, ffull, fdate, avatarTone, initials } from '../utils.js';
import { calcular } from '../logic.js';
import { getCliente } from '../store.js';
import { toast, emptyState } from '../ui.js';

export function render(app, _p, query) {
  const s = app.state;
  const hoy = today();
  const fecha = query.fecha && /^\d{4}-\d{2}-\d{2}$/.test(query.fecha) ? query.fecha : hoy;
  const esHoy = fecha === hoy;
  const main = app.shell({ title: 'Cierre del día', back: '#/inicio', tab: 'inicio' });

  const nombre = (p) => getCliente(p.clienteId)?.nombre || 'Cliente';
  const pagos = [];
  for (const p of s.prestamos) {
    if (p.estado === 'anulado') continue;
    for (const m of p.movs || []) {
      if ((m.tipo === 'pago' || m.tipo === 'renovacion') && m.fecha === fecha) pagos.push({ p, m });
    }
  }
  pagos.sort((a, b) => (a.m.ts || 0) - (b.m.ts || 0));
  const nuevos = s.prestamos.filter((p) => p.estado !== 'anulado' && p.fecha === fecha);
  const gastos = (s.gastos || []).filter((g) => g.fecha === fecha);
  const cobrado = pagos.reduce((a, x) => a + x.m.valor, 0);
  const prestado = nuevos.reduce((a, p) => a + p.capital, 0);
  const totGastos = gastos.filter((g) => g.tipo !== 'retiro').reduce((a, g) => a + g.valor, 0);
  const totRetiros = gastos.filter((g) => g.tipo === 'retiro').reduce((a, g) => a + g.valor, 0);
  const efectivo = cobrado - prestado - totGastos - totRetiros;

  // Quién no pagó (solo tiene sentido para hoy)
  let noPagaron = [];
  if (esHoy) {
    const pagaronHoy = new Set(pagos.map((x) => x.p.id));
    noPagaron = s.prestamos
      .map((p) => calcular(p, hoy, s.config))
      .filter((c) => c.activo && c.aCobrarHoy > 0 && !pagaronHoy.has(c.p.id))
      .sort((a, b) => b.aCobrarHoy - a.aCobrarHoy);
  }

  const item = (href, n, sub, val, color = '') => `<div class="item" ${href ? `data-href="${href}"` : ''}>
    <div class="avatar ${avatarTone(n)}">${esc(initials(n))}</div>
    <div class="grow"><div class="t ellipsis">${esc(n)}</div><div class="s ellipsis">${sub}</div></div>
    <div class="end"><span class="amt num" ${color ? `style="color:${color}"` : ''}>${val}</span></div></div>`;

  main.innerHTML = `
    <div class="row between" style="margin-bottom:12px">
      <a class="icon-btn" href="#/cierre?fecha=${addDays(fecha, -1)}" aria-label="Día anterior">${icon('back')}</a>
      <label class="grow" style="text-align:center;font-weight:700;position:relative">
        ${esc(ffull(fecha).replace(/^./, (x) => x.toUpperCase()))}${esHoy ? ' · hoy' : ''}
        <input type="date" value="${fecha}" max="${hoy}" data-fecha style="position:absolute;inset:0;opacity:0">
      </label>
      ${esHoy ? '<span class="icon-btn"></span>' : `<a class="icon-btn" href="#/cierre?fecha=${addDays(fecha, 1)}" aria-label="Día siguiente">${icon('next')}</a>`}
    </div>
    <div class="hero">
      <div class="label">Efectivo del día</div>
      <div class="big num">${money(efectivo)}</div>
      <div class="split">
        <div><span>Cobrado</span><b class="num">${money(cobrado)}</b><span>${pagos.length} pago${pagos.length === 1 ? '' : 's'}</span></div>
        <div><span>Prestado</span><b class="num">${money(prestado)}</b><span>${nuevos.length} préstamo${nuevos.length === 1 ? '' : 's'}</span></div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="ico tone-warn">${icon('cash', 'sm')}</div><div class="v num">${money(totGastos)}</div><div class="l">Gastos</div></div>
      <div class="kpi"><div class="ico tone-violet">${icon('arrowOut', 'sm')}</div><div class="v num">${money(totRetiros)}</div><div class="l">Retiros</div></div>
    </div>
    <button class="btn primary block" data-compartir style="margin-bottom:6px">${icon('share', 'sm')} Compartir cierre</button>

    <div class="section-title">Pagos recibidos <span class="muted">${pagos.length}</span></div>
    ${pagos.length ? `<div class="list">${pagos.map(({ p, m }) => item(`#/prestamo/${p.id}`, nombre(p), `#${p.id}${m.tipo === 'renovacion' ? ' · interés + abono' : ''}${m.nota && m.nota !== 'Importado del Excel' ? ' · ' + esc(m.nota) : ''}`, money(m.valor), 'var(--ok)')).join('')}</div>`
      : emptyState('cash', 'Sin pagos este día')}

    ${esHoy ? `<div class="section-title">No pagaron hoy <span class="muted">${noPagaron.length}</span></div>
      ${noPagaron.length ? `<div class="list">${noPagaron.map((c) => item(`#/prestamo/${c.p.id}`, nombre(c.p), `#${c.p.id} · ${c.diasMora > 0 ? `${c.diasMora} días de mora` : 'cuota de hoy'}`, money(c.aCobrarHoy), 'var(--danger)')).join('')}</div>`
        : emptyState('checkCircle', '¡Todos pagaron!')}` : ''}

    ${nuevos.length ? `<div class="section-title">Préstamos entregados <span class="muted">${nuevos.length}</span></div>
      <div class="list">${nuevos.map((p) => item(`#/prestamo/${p.id}`, nombre(p), `#${p.id} · ${esc(p.modalidad)} · ${p.tasa}%`, money(p.capital))).join('')}</div>` : ''}

    ${gastos.length ? `<div class="section-title">Gastos y retiros <span class="muted">${gastos.length}</span></div>
      <div class="list">${gastos.map((g) => item('#/gastos', g.tipo === 'retiro' ? 'Retiro de ganancia' : g.categoria || 'Gasto', esc(g.nota || ''), '− ' + money(g.valor), g.tipo === 'retiro' ? 'var(--violet)' : 'var(--danger)')).join('')}</div>` : ''}`;

  $('[data-fecha]', main).addEventListener('change', (e) => e.target.value && app.go(`#/cierre?fecha=${e.target.value}`));
  main.addEventListener('click', (e) => {
    const it = e.target.closest('[data-href]');
    if (it) app.go(it.dataset.href);
  });
  $('[data-compartir]', main).onclick = async () => {
    const t = [];
    t.push(`*Cierre del día · ${fdate(fecha)}*`);
    t.push(`Cobrado: ${money(cobrado)} (${pagos.length} pagos)`);
    t.push(`Prestado: ${money(prestado)} (${nuevos.length})`);
    if (totGastos) t.push(`Gastos: ${money(totGastos)}`);
    if (totRetiros) t.push(`Retiros: ${money(totRetiros)}`);
    t.push(`*Efectivo del día: ${money(efectivo)}*`);
    if (pagos.length) {
      t.push('', 'Pagos:');
      pagos.forEach(({ p, m }) => t.push(`• ${nombre(p)}: ${money(m.valor)}`));
    }
    if (noPagaron.length) {
      t.push('', 'No pagaron:');
      noPagaron.forEach((c) => t.push(`• ${nombre(c.p)}: debe ${money(c.aCobrarHoy)}`));
    }
    const texto = t.join('\n');
    try {
      if (navigator.share) await navigator.share({ text: texto, title: 'Cierre del día' });
      else { await navigator.clipboard.writeText(texto); toast('Cierre copiado'); }
    } catch { /* cancelado */ }
  };
}
