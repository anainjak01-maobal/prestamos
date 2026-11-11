// Lista de préstamos con filtros.
import { icon } from '../icons.js';
import { esc, money, norm, avatarTone, initials, fshort, today, $ } from '../utils.js';
import { calcular, ESTADOS } from '../logic.js';
import { emptyState, badge } from '../ui.js';
import { getCliente } from '../store.js';

export function estadoBadge(c) {
  const e = ESTADOS[c.estado];
  let txt = e.txt;
  if (c.estado === 'atrasado') txt = `Atrasado ${c.diasMora} d`;
  if (c.estado === 'vencido') txt = `Vencido · ${c.diasMora} d`;
  return badge(txt, e.cls);
}

export function itemPrestamo(c, { showCliente = true, cobrar = false } = {}) {
  const cl = getCliente(c.p.clienteId);
  const nombre = cl?.nombre || 'Cliente eliminado';
  const sub = c.activo
    ? `#${c.p.id} · ${c.ciclo.modalidad} · cuota ${money(c.valorCuota)}${c.proxima ? ` · próx. ${fshort(c.proxima)}` : ''}`
    : `#${c.p.id} · ${c.ciclo.modalidad} · ${money(c.p.capital)}`;
  return `<div class="item" data-href="#/prestamo/${c.p.id}">
    ${showCliente ? `<div class="avatar ${avatarTone(nombre)}">${esc(initials(nombre))}</div>` : `<div class="avatar tone-primary">${icon('wallet', 'sm')}</div>`}
    <div class="grow"><div class="t ellipsis">${esc(showCliente ? nombre : `Préstamo #${c.p.id}`)}</div><div class="s ellipsis">${esc(sub)}</div></div>
    <div class="end">
      ${cobrar && c.aCobrarHoy > 0
        ? `<span class="amt num">${money(c.aCobrarHoy)}</span><button class="btn primary sm" data-cobrar="${c.p.id}">${icon('cash', 'sm')} Cobrar</button>`
        : `<span class="amt num">${money(c.activo ? c.saldo : c.pagado)}</span>${estadoBadge(c)}`}
    </div>
  </div>`;
}

/** Enlaza clics de una lista de préstamos (ir al detalle / cobrar). */
export function bindLista(main, app, onCobrar) {
  main.addEventListener('click', (e) => {
    const cob = e.target.closest('[data-cobrar]');
    if (cob) {
      e.stopPropagation();
      onCobrar?.(cob.dataset.cobrar);
      return;
    }
    const it = e.target.closest('[data-href]');
    if (it) app.go(it.dataset.href);
  });
}

const FILTROS = [
  ['activos', 'Activos', (c) => c.activo],
  ['hoy', 'Cobrar hoy', (c) => c.activo && c.aCobrarHoy > 0],
  ['atrasados', 'Atrasados', (c) => c.estado === 'atrasado'],
  ['vencidos', 'Plazo vencido', (c) => c.estado === 'vencido'],
  ['interes', 'Interés pendiente', (c) => !!c.interesPendiente],
  ['pagados', 'Pagados', (c) => c.estado === 'pagado'],
  ['anulados', 'Anulados', (c) => c.estado === 'anulado'],
  ['todos', 'Todos', () => true],
];

let filtroActual = 'activos';
let busqueda = '';

export function lista(app, _p, query) {
  if (query.filtro) filtroActual = query.filtro;
  const hoy = today();
  const calcs = app.state.prestamos.map((p) => calcular(p, hoy, app.state.config));
  const main = app.shell({
    title: 'Préstamos',
    tab: 'prestamos',
    fab: { label: 'Nuevo préstamo', icon: 'plus', onClick: () => app.go('#/nuevo') },
  });

  const draw = () => {
    const f = FILTROS.find((x) => x[0] === filtroActual) || FILTROS[0];
    const q = norm(busqueda);
    const items = calcs
      .filter(f[2])
      .filter((c) => !q || norm(getCliente(c.p.clienteId)?.nombre).includes(q) || String(c.p.id) === q)
      .sort((a, b) => (b.diasMora - a.diasMora) || (b.p.id - a.p.id));
    $('[data-chips]', main).innerHTML = FILTROS.map(([id, txt, fn]) => {
      const n = calcs.filter(fn).length;
      return `<button class="chip ${id === filtroActual ? 'on' : ''}" data-f="${id}">${txt}<span class="n">${n}</span></button>`;
    }).join('');
    $('[data-list]', main).innerHTML = items.length
      ? `<div class="list">${items.map((c) => itemPrestamo(c)).join('')}</div>`
      : emptyState('wallet', 'Sin préstamos aquí', filtroActual === 'activos' ? 'Crea el primero con el botón “Nuevo préstamo”.' : 'No hay préstamos con este filtro.');
  };

  main.innerHTML = `<div class="search">${icon('search', 'sm')}<input type="search" placeholder="Buscar por cliente o número" value="${esc(busqueda)}"></div>
    <div class="chips" data-chips></div><div data-list></div>`;
  $('input', main).addEventListener('input', (e) => { busqueda = e.target.value; draw(); });
  $('[data-chips]', main).addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filtroActual = b.dataset.f;
    draw();
  });
  bindLista(main, app);
  draw();
}
