// Cierre del día: lo cobrado, lo prestado, los gastos y quién no pagó.
import { icon } from '../icons.js';
import { $, esc, money, today, addDays, ffull, fdate, avatarTone, initials, parseMoney } from '../utils.js';
import { calcular, esTransferencia, transferencias, esResumenCarton, separarPagoDelDia, estadoAl, resumenGeneral } from '../logic.js';
import { getCliente } from '../store.js';
import { toast, emptyState, sheet, moneyField } from '../ui.js';

export function render(app, _p, query) {
  const s = app.state;
  const hoy = today();
  const fecha = query.fecha && /^\d{4}-\d{2}-\d{2}$/.test(query.fecha) ? query.fecha : hoy;
  const esHoy = fecha === hoy;
  const main = app.shell({ title: 'Cierre del día', back: '#/inicio', tab: 'inicio' });

  const nombre = (p) => getCliente(p.clienteId)?.nombre || 'Cliente';
  const pagos = [];
  // Resúmenes de cartones eliminados con la versión vieja: llevan el total del préstamo, no lo de este día.
  const resumenes = [];
  for (const p of s.prestamos) {
    if (p.estado === 'anulado') continue;
    for (const m of p.movs || []) {
      if ((m.tipo === 'pago' || m.tipo === 'renovacion') && m.fecha === fecha) (esResumenCarton(m) ? resumenes : pagos).push({ p, m });
    }
  }
  const viejos = resumenes.filter(({ m }) => !m.resumen); // los que aún se pueden corregir
  pagos.sort((a, b) => (a.m.ts || 0) - (b.m.ts || 0));
  const nuevos = s.prestamos.filter((p) => p.estado !== 'anulado' && p.fecha === fecha);
  const gastos = (s.gastos || []).filter((g) => g.fecha === fecha);
  const cobrado = pagos.reduce((a, x) => a + x.m.valor, 0);
  // Lo que llegó por transferencia queda en la cuenta (no es efectivo). Lo que se sacó de las cuentas ese día sí entra al efectivo.
  const cobradoTr = pagos.filter((x) => esTransferencia(x.m)).reduce((a, x) => a + x.m.valor, 0);
  const nTr = pagos.filter((x) => esTransferencia(x.m)).length;
  const retiradasDia = transferencias(s).filter((t) => t.m.retirado === fecha);
  const sacado = retiradasDia.reduce((a, t) => a + t.m.valor, 0);
  const prestado = nuevos.reduce((a, p) => a + p.capital, 0);
  const totGastos = gastos.filter((g) => g.tipo !== 'retiro').reduce((a, g) => a + g.valor, 0);
  const totRetiros = gastos.filter((g) => g.tipo === 'retiro').reduce((a, g) => a + g.valor, 0);
  // Préstamos a socios (salen de caja) y sus abonos. Los abonos "de su ganancia" ya están como retiro del día
  // (que resta) y entran como abono (suma): en caja quedan en cero. Los "de su aporte" no mueven caja.
  const deudasSocios = s.socios.flatMap((so) => (so.deudas || []).filter((d) => d.fecha === fecha).map((d) => ({ so, d })));
  const prestadoSocios = deudasSocios.filter((x) => x.d.tipo === 'prestamo').reduce((a, x) => a + x.d.valor, 0);
  const abonosSocios = deudasSocios.filter((x) => x.d.tipo === 'abono' && x.d.origen !== 'aporte').reduce((a, x) => a + x.d.valor, 0);
  // Los préstamos salen de la caja (no de lo cobrado ese día): lo que importa es cuánto quedó en caja al cierre.
  const alCierre = resumenGeneral(estadoAl(s, fecha), fecha);
  const caja = alCierre.disponible;
  const enCuentas = alCierre.porRetirar;

  // Préstamos que terminaron de pagar este día (su último pago fue hoy y quedaron en cero).
  const pagoDelDia = (p) => (p.movs || []).filter((m) => (m.tipo === 'pago' || m.tipo === 'renovacion') && m.fecha === fecha && !esResumenCarton(m)).reduce((a, m) => a + m.valor, 0);
  const saldaron = s.prestamos.filter((p) => p.estado !== 'anulado').map((p) => {
    const f = (p.movs || []).filter((m) => m.tipo === 'pago' || m.tipo === 'renovacion').map((m) => m.fecha).sort();
    if (f[f.length - 1] !== fecha) return null;
    const c = calcular(p, hoy, s.config);
    return c.estado === 'pagado' ? { p, c, hoyPago: pagoDelDia(p), sinCorregir: viejos.some((x) => x.p === p) } : null;
  }).filter(Boolean);
  const saldoHoy = new Set(saldaron.map((x) => x.p.id));

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
      <div class="label">Cobrado ${esHoy ? 'hoy' : 'este día'}</div>
      <div class="big num">${money(cobrado)}</div>
      <div class="split">
        <div><span>Prestado</span><b class="num">${money(prestado)}</b><span>${nuevos.length} préstamo${nuevos.length === 1 ? '' : 's'}</span></div>
        <div><span>En caja al cierre</span><b class="num">${money(caja)}</b><span>${enCuentas > 0 ? `${money(enCuentas)} en cuentas` : 'disponible'}</span></div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="ico tone-warn">${icon('cash', 'sm')}</div><div class="v num">${money(totGastos)}</div><div class="l">Gastos</div></div>
      <div class="kpi"><div class="ico tone-violet">${icon('arrowOut', 'sm')}</div><div class="v num">${money(totRetiros)}</div><div class="l">Retiros</div></div>
      ${cobradoTr || sacado ? `<a class="kpi" href="#/transferencias"><div class="ico tone-info">${icon('transfer', 'sm')}</div><div class="v num">${money(cobradoTr)}</div><div class="l">Por transferencia (${nTr}) · quedan en la cuenta</div></a>
      <a class="kpi" href="#/transferencias?ver=retiradas"><div class="ico tone-ok">${icon('cash', 'sm')}</div><div class="v num">${money(sacado)}</div><div class="l">Sacado de las cuentas (${retiradasDia.length})</div></a>` : ''}
    </div>
    <p class="tiny muted" style="margin:-4px 4px 10px">Los préstamos salen de la caja. “En caja al cierre” es el dinero disponible al terminar ${esHoy ? 'hoy' : 'ese día'}${enCuentas > 0 ? ', contando lo que está en cuentas por retirar' : ''}.</p>
    <button class="btn primary block" data-compartir style="margin-bottom:6px">${icon('share', 'sm')} Compartir cierre</button>

    <div class="section-title">Pagos recibidos <span class="muted">${pagos.length}${cobrado ? ` · <b style="color:var(--ok)">${money(cobrado)}</b>` : ''}</span></div>
    ${viejos.length ? `<div class="alert warn">${icon('alert')}<div class="grow small"><b>${viejos.length === 1 ? 'Falta 1 valor' : `Faltan ${viejos.length} valores`}.</b> ${viejos.length === 1 ? 'Este cliente terminó' : 'Estos clientes terminaron'} de pagar este día, pero su cartón se eliminó con la versión anterior y no quedó cuánto pagó ese día. Toca “Poner valor” y escríbelo una sola vez.</div></div>` : ''}
    ${pagos.length || viejos.length ? `<div class="list">${pagos.map(({ p, m }) => item(`#/prestamo/${p.id}`, nombre(p), `#${p.id}${saldoHoy.has(p.id) ? ' · <b style="color:var(--ok)">saldó</b>' : ''}${esTransferencia(m) ? ` · <span class="tr-tag">transferencia${m.cuenta ? ' ' + esc(m.cuenta) : ''}</span>` : ''}${m.tipo === 'renovacion' ? ' · interés + abono' : ''}${m.nota && m.nota !== 'Importado del Excel' && m.nota !== 'Pago del día' ? ' · ' + esc(m.nota) : ''}`, money(m.valor), 'var(--ok)')).join('')}${viejos.map(({ p, m }) => `<div class="item" data-viejo="${p.id}|${m.id}" style="cursor:pointer">
        <div class="avatar ${avatarTone(nombre(p))}">${esc(initials(nombre(p)))}</div>
        <div class="grow"><div class="t ellipsis">${esc(nombre(p))}</div><div class="s ellipsis">#${p.id} · <b style="color:var(--ok)">saldó</b> · ¿cuánto pagó este día?</div></div>
        <div class="end"><span class="btn sm" style="pointer-events:none">${icon('edit', 'sm')} Poner valor</span></div></div>`).join('')}</div>
      <div class="summary" data-total-cobrado style="margin-top:10px">
        ${cobradoTr ? `<div class="r"><span>En efectivo (${pagos.length - nTr})</span><b>${money(cobrado - cobradoTr)}</b></div>
        <div class="r"><span>Por transferencia (${nTr})</span><b>${money(cobradoTr)}</b></div>` : ''}
        <div class="r total"${cobradoTr ? '' : ' style="border-top:0;margin-top:0;padding-top:4px"'}><span><b>Total cobrado ${esHoy ? 'hoy' : `el ${fdate(fecha)}`}</b><br><span class="tiny muted">${pagos.length} pago${pagos.length === 1 ? '' : 's'}</span></span><b style="color:var(--ok);white-space:nowrap;align-self:center">${money(cobrado)}</b></div>
      </div>`
      : emptyState('cash', 'Sin pagos este día')}

    ${saldaron.length ? `<div class="section-title">Terminaron de pagar ${esHoy ? 'hoy' : 'este día'} <span class="muted">${saldaron.length}</span></div>
      <div class="list" data-saldaron>${saldaron.map(({ p, c, hoyPago, sinCorregir }) => item(`#/prestamo/${p.id}`, nombre(p),
        `#${p.id} · total pagado ${money(c.pagado)}`,
        sinCorregir ? '<span class="muted small">por poner</span>' : money(hoyPago), 'var(--ok)')).join('')}</div>
      <p class="tiny muted" style="margin:6px 4px 0">A la derecha, lo que pagó cada uno este día.</p>` : ''}

    ${esHoy ? `<div class="section-title">No pagaron hoy <span class="muted">${noPagaron.length}</span></div>
      ${noPagaron.length ? `<div class="list">${noPagaron.map((c) => item(`#/prestamo/${c.p.id}`, nombre(c.p), `#${c.p.id} · ${c.diasMora > 0 ? `${c.diasMora} días de mora` : 'cuota de hoy'}`, money(c.aCobrarHoy), 'var(--danger)')).join('')}</div>`
        : emptyState('checkCircle', '¡Todos pagaron!')}` : ''}

    ${nuevos.length ? `<div class="section-title">Préstamos entregados <span class="muted">${nuevos.length}</span></div>
      <div class="list">${nuevos.map((p) => item(`#/prestamo/${p.id}`, nombre(p), `#${p.id} · ${esc(p.modalidad)} · ${p.tasa}%`, money(p.capital))).join('')}</div>` : ''}

    ${deudasSocios.length ? `<div class="section-title">Socios <span class="muted">${deudasSocios.length}</span></div>
      <div class="list">${deudasSocios.map(({ so, d }) => item(`#/socio/${so.id}`, so.nombre,
        d.tipo === 'prestamo' ? `Préstamo sin interés${d.nota ? ' · ' + esc(d.nota) : ''}` : `Abono a su deuda · ${d.origen === 'caja' ? 'en efectivo' : d.origen === 'aporte' ? 'de su aporte (no mueve caja)' : 'de su ganancia'}`,
        (d.tipo === 'prestamo' ? '− ' : '+ ') + money(d.valor), d.tipo === 'prestamo' ? 'var(--warn)' : 'var(--ok)')).join('')}</div>` : ''}

    ${gastos.length ? `<div class="section-title">Gastos y retiros <span class="muted">${gastos.length}</span></div>
      <div class="list">${gastos.map((g) => item('#/gastos', g.tipo === 'retiro' ? 'Retiro de ganancia' : g.categoria || 'Gasto', esc(g.nota || ''), '− ' + money(g.valor), g.tipo === 'retiro' ? 'var(--violet)' : 'var(--danger)')).join('')}</div>` : ''}`;

  $('[data-fecha]', main).addEventListener('change', (e) => e.target.value && app.go(`#/cierre?fecha=${e.target.value}`));
  main.addEventListener('click', (e) => {
    const vj = e.target.closest('[data-viejo]');
    if (vj) {
      const [pid, mid] = vj.dataset.viejo.split('|');
      const x = viejos.find(({ p, m }) => String(p.id) === pid && m.id === mid);
      if (x) corregirResumen(app, x.p, x.m, nombre(x.p));
      return;
    }
    const it = e.target.closest('[data-href]');
    if (it) app.go(it.dataset.href);
  });
  $('[data-compartir]', main).onclick = async () => {
    const t = [];
    t.push(`*Cierre del día · ${fdate(fecha)}*`);
    t.push(`*Total cobrado: ${money(cobrado)}* (${pagos.length} pago${pagos.length === 1 ? '' : 's'})`);
    if (viejos.length) t.push(`  (faltan ${viejos.length} valor${viejos.length === 1 ? '' : 'es'} por poner: ${viejos.map(({ p }) => nombre(p)).join(', ')})`);
    if (cobradoTr) t.push(`  En efectivo: ${money(cobrado - cobradoTr)} · por transferencia: ${money(cobradoTr)} (${nTr})`);
    if (sacado) t.push(`Sacado de las cuentas: ${money(sacado)}`);
    t.push(`Prestado: ${money(prestado)} (${nuevos.length})`);
    if (totGastos) t.push(`Gastos: ${money(totGastos)}`);
    if (totRetiros) t.push(`Retiros: ${money(totRetiros)}`);
    if (prestadoSocios) t.push(`Préstamos a socios: ${money(prestadoSocios)}`);
    if (abonosSocios) t.push(`Abonos de socios: ${money(abonosSocios)}`);
    t.push(`*En caja al cierre: ${money(caja)}*${enCuentas > 0 ? ` (de eso ${money(enCuentas)} en cuentas)` : ''}`);
    if (pagos.length) {
      t.push('', 'Pagos:');
      pagos.forEach(({ p, m }) => t.push(`• ${nombre(p)}: ${money(m.valor)}${esTransferencia(m) ? ' (transferencia)' : ''}${saldoHoy.has(p.id) ? ' ✓ saldó' : ''}`));
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

/** Separa el pago-resumen de un cartón eliminado (versión vieja): lo que pagó ese día y los pagos anteriores. */
function corregirResumen(app, p, m, nombreCliente) {
  sheet({
    title: 'Pago del día',
    ico: 'cash',
    tone: 'tone-ok',
    body: `<div class="summary">
        <div class="r"><span>Cliente</span><b>${esc(nombreCliente)} · #${p.id}</b></div>
        <div class="r"><span>Fecha</span><b>${fdate(m.fecha)}</b></div>
        <div class="r"><span>Total del préstamo (resumen)</span><b>${money(m.valor)}</b></div></div>
      ${moneyField('valor', '¿Cuánto pagó el cliente este día?', '')}
      <p class="small muted">El resto (lo que pagó antes) queda guardado como “Pagos anteriores” y no se suma en el cierre de este día. El total pagado y la ganancia del préstamo no cambian.</p>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>`,
    onMount(el, api) {
      const inp = $('[name=valor]', el);
      setTimeout(() => inp.focus(), 280);
      $('[data-ok]', el).onclick = async () => {
        const v = parseMoney(inp.value);
        if (!(v > 0)) return toast('Escribe cuánto pagó ese día', 'err');
        if (v > m.valor) return toast(`No puede ser más que ${money(m.valor)}`, 'err');
        separarPagoDelDia(p, m, v);
        await app.save();
        api.close();
        toast(`Listo: ${money(v)} el ${fdate(m.fecha)}`);
        app.refresh();
      };
    },
  });
}
