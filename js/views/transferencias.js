// Pagos de clientes que llegaron por transferencia: los que siguen en la cuenta (por retirar) y los ya retirados.
// Retirar NO suma dinero otra vez: el pago ya se contó el día que el cliente pagó. Solo pasa de la cuenta al efectivo.
import { icon } from '../icons.js';
import { $, $$, esc, money, fdate, today, avatarTone, initials, sum } from '../utils.js';
import { transferencias } from '../logic.js';
import { getCliente } from '../store.js';
import { sheet, toast, field, confirmDialog, emptyState } from '../ui.js';

let vista = 'pendientes';
let cuentaSel = '';
const SIN_CUENTA = '(sin cuenta)';

export function render(app, _p, query) {
  const s = app.state;
  if (query.ver === 'retiradas' || query.ver === 'pendientes') vista = query.ver;
  const main = app.shell({ title: 'Transferencias', back: '#/mas', tab: 'mas' });
  const todas = transferencias(s);
  const pend = todas.filter((t) => t.pendiente);
  const ret = todas.filter((t) => !t.pendiente);
  const nombre = (p) => getCliente(p.clienteId)?.nombre || 'Cliente';
  const cuentaDe = (t) => t.m.cuenta || SIN_CUENTA;

  // Totales por cuenta (de lo que está por retirar)
  const porCuenta = {};
  for (const t of pend) porCuenta[cuentaDe(t)] = (porCuenta[cuentaDe(t)] || 0) + t.m.valor;
  const cuentas = Object.keys(porCuenta).sort((a, b) => porCuenta[b] - porCuenta[a]);
  if (cuentaSel && !cuentas.includes(cuentaSel)) cuentaSel = '';
  const lista = cuentaSel ? pend.filter((t) => cuentaDe(t) === cuentaSel) : pend;

  const item = (t, { check = false } = {}) => {
    const n = nombre(t.p);
    const sub = [`#${t.p.id}`, `Pagó ${fdate(t.m.fecha)}`, t.m.cuenta ? esc(t.m.cuenta) : '', t.m.tipo === 'renovacion' ? 'interés + abono' : '']
      .filter(Boolean).join(' · ');
    return `<div class="item" data-mid="${t.m.id}" data-pid="${t.p.id}">
      ${check ? `<input type="checkbox" class="tr-check" data-chk tabindex="-1">` : ''}
      <div class="avatar ${avatarTone(n)}">${esc(initials(n))}</div>
      <div class="grow"><div class="t ellipsis">${esc(n)}</div><div class="s ellipsis">${sub}</div></div>
      <div class="end"><span class="amt num" style="color:${check ? 'var(--info)' : 'var(--text-2)'}">${money(t.m.valor)}</span></div></div>`;
  };

  let cuerpo = '';
  if (vista === 'pendientes') {
    cuerpo = `
      <div class="hero">
        <div class="label">Por retirar de las cuentas</div>
        <div class="big num">${money(sum(pend, (t) => t.m.valor))}</div>
        <div class="split">
          <div><span>Transferencias</span><b class="num">${pend.length}</b></div>
          <div><span>Ya retiradas</span><b class="num">${money(sum(ret, (t) => t.m.valor))}</b><span>${ret.length}</span></div>
        </div>
      </div>
      ${cuentas.length > 1 ? `<div class="chips" style="margin-top:12px"><button class="chip ${!cuentaSel ? 'on' : ''}" data-cuenta="">Todas</button>${cuentas.map((c) => `<button class="chip ${c === cuentaSel ? 'on' : ''}" data-cuenta="${esc(c)}">${esc(c)} <span class="n">${money(porCuenta[c])}</span></button>`).join('')}</div>` : ''}
      ${lista.length ? `
        <div class="section-title">Marca las que ya sacaste <button class="btn ghost sm" data-todas style="padding:0">${icon('checkCircle', 'sm')} Todas</button></div>
        <div class="list" data-lista>${lista.map((t) => item(t, { check: true })).join('')}</div>
        <button class="btn primary block" data-retirar disabled style="margin-top:12px">${icon('check', 'sm')} Marcar como retiradas</button>`
        : emptyState('checkCircle', 'No hay transferencias por retirar', 'Cuando un cliente te pague por transferencia, elige “Transferencia” en Cobrar y aparecerá aquí.')}
      <p class="tiny muted" style="margin:10px 4px">Las transferencias ya cuentan como pago desde el día que el cliente pagó. Al marcarlas como retiradas <b>no se suman otra vez</b>: solo pasan de la cuenta a tu efectivo. Quedan guardadas en “Retiradas”.</p>`;
  } else {
    const grupos = {};
    for (const t of ret) (grupos[t.m.retirado] = grupos[t.m.retirado] || []).push(t);
    const fechas = Object.keys(grupos).sort().reverse();
    cuerpo = ret.length
      ? fechas.map((f) => `<div class="section-title">Retiradas el ${fdate(f)} <span class="muted">${money(sum(grupos[f], (t) => t.m.valor))}</span></div>
          <div class="list">${grupos[f].map((t) => item(t)).join('')}</div>`).join('')
        + '<p class="tiny muted" style="margin:10px 4px">Toca una para volverla a “por retirar” o ver el préstamo.</p>'
      : emptyState('clock', 'Aún no has retirado transferencias');
  }

  main.innerHTML = `
    <div class="seg" style="margin-bottom:12px">
      <button type="button" data-vista="pendientes" class="${vista === 'pendientes' ? 'on' : ''}">Por retirar (${pend.length})</button>
      <button type="button" data-vista="retiradas" class="${vista === 'retiradas' ? 'on' : ''}">Retiradas (${ret.length})</button>
    </div>
    ${cuerpo}`;

  const btn = $('[data-retirar]', main);
  const elegidas = () => $$('[data-lista] .item', main).filter((r) => $('[data-chk]', r).checked)
    .map((r) => lista.find((t) => t.m.id === r.dataset.mid)).filter(Boolean);
  const upd = () => {
    if (!btn) return;
    const e = elegidas();
    $$('[data-lista] .item', main).forEach((r) => r.classList.toggle('sel', $('[data-chk]', r).checked));
    btn.disabled = !e.length;
    btn.innerHTML = `${icon('check', 'sm')} ${e.length ? `Marcar ${e.length} como retirada${e.length > 1 ? 's' : ''} · ${money(sum(e, (t) => t.m.valor))}` : 'Marcar como retiradas'}`;
  };

  main.addEventListener('click', (e) => {
    const v = e.target.closest('[data-vista]');
    if (v) { vista = v.dataset.vista; return app.refresh(); }
    const cu = e.target.closest('[data-cuenta]');
    if (cu) { cuentaSel = cu.dataset.cuenta; return app.refresh(); }
    if (e.target.closest('[data-todas]')) {
      const filas = $$('[data-lista] .item', main);
      const todasMarcadas = filas.every((r) => $('[data-chk]', r).checked);
      filas.forEach((r) => ($('[data-chk]', r).checked = !todasMarcadas));
      return upd();
    }
    if (e.target.closest('[data-retirar]')) return marcarRetiradas(app, elegidas());
    const it = e.target.closest('[data-mid]');
    if (!it) return;
    if (vista === 'pendientes') {
      const chk = $('[data-chk]', it);
      if (e.target !== chk) chk.checked = !chk.checked;
      upd();
    } else {
      opcionesRetirada(app, ret.find((t) => t.m.id === it.dataset.mid));
    }
  });
  upd();
}

function marcarRetiradas(app, sel) {
  if (!sel.length) return;
  const total = sum(sel, (t) => t.m.valor);
  sheet({
    title: 'Marcar como retiradas',
    ico: 'check',
    tone: 'tone-info',
    body: `<div class="summary"><div class="r"><span>${sel.length} transferencia${sel.length > 1 ? 's' : ''}</span><b>${money(total)}</b></div></div>
      ${field('¿Qué día las sacaste?', `<input type="date" name="fecha" value="${today()}" max="${today()}">`)}
      <p class="small muted">No se suman otra vez al capital ni a la caja: ese dinero ya contó el día que pagó el cliente. Solo pasan de la cuenta al efectivo.</p>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Confirmar</button>`,
    onMount(el, api) {
      $('[data-ok]', el).onclick = async () => {
        const f = $('[name=fecha]', el).value || today();
        const antes = sel.find((t) => t.m.fecha > f);
        if (antes) return toast(`Hay una transferencia del ${fdate(antes.m.fecha)}: la fecha de retiro no puede ser anterior`, 'err');
        sel.forEach((t) => { t.m.retirado = f; });
        await app.save();
        api.close();
        toast(`${sel.length} retirada${sel.length > 1 ? 's' : ''} · ${money(total)}`);
        app.refresh();
      };
    },
  });
}

function opcionesRetirada(app, t) {
  if (!t) return;
  const n = getCliente(t.p.clienteId)?.nombre || 'Cliente';
  sheet({
    title: 'Transferencia retirada',
    ico: 'cash',
    tone: 'tone-info',
    body: `<div class="summary">
        <div class="r"><span>Cliente</span><b>${esc(n)} · #${t.p.id}</b></div>
        <div class="r"><span>Pagó</span><b>${fdate(t.m.fecha)} · ${money(t.m.valor)}</b></div>
        ${t.m.cuenta ? `<div class="r"><span>Cuenta</span><b>${esc(t.m.cuenta)}</b></div>` : ''}
        <div class="r"><span>Retirada</span><b>${fdate(t.m.retirado)}</b></div></div>
      <div class="btn-row"><button class="btn" data-ver>${icon('wallet', 'sm')} Ver préstamo</button><button class="btn" data-volver>${icon('refresh', 'sm')} Volver a por retirar</button></div>`,
    onMount(el, api) {
      $('[data-ver]', el).onclick = () => { api.close(); app.go(`#/prestamo/${t.p.id}`); };
      $('[data-volver]', el).onclick = async () => {
        if (!(await confirmDialog({ title: '¿Volver a “por retirar”?', text: 'Úsalo si la marcaste por error. El pago del cliente no cambia.', ok: 'Sí, volver' }))) return;
        delete t.m.retirado;
        await app.save();
        api.close();
        toast('Volvió a por retirar');
        app.refresh();
      };
    },
  });
}
