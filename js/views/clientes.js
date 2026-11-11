// Clientes: lista, detalle y formulario.
import { icon } from '../icons.js';
import { $, esc, money, norm, avatarTone, initials, today, waPhone } from '../utils.js';
import { calcular, calificarCliente } from '../logic.js';
import { sheet, toast, field, confirmDialog, emptyState, afterLayers } from '../ui.js';
import * as store from '../store.js';
import { itemPrestamo, bindLista, estadoBadge } from './prestamos.js';

let busqueda = '';

const PRIORIDAD = { vencido: 5, atrasado: 4, hoy: 3, al_dia: 2, pagado: 1, anulado: 0 };

function resumenCliente(cl, calcs, cfg = {}) {
  const mios = calcs.filter((c) => c.p.clienteId === cl.id);
  const activos = mios.filter((c) => c.activo);
  const peor = activos.sort((a, b) => PRIORIDAD[b.estado] - PRIORIDAD[a.estado] || b.diasMora - a.diasMora)[0];
  return { mios, activos, saldo: activos.reduce((s, c) => s + c.saldo, 0), peor, cal: calificarCliente(mios, cfg) };
}

/** Calificación de un cliente por su id (para otras pantallas). */
export function calificacionDe(app, clienteId) {
  const hoy = today();
  const calcs = store.prestamosDe(clienteId).map((p) => calcular(p, hoy, app.state.config));
  return calificarCliente(calcs, app.state.config, hoy);
}

export const calBadge = (cal) => `<span class="badge ${cal.cls}">${cal.emoji} ${esc(cal.txt)}</span>`;

export function lista(app) {
  const hoy = today();
  const calcs = app.state.prestamos.map((p) => calcular(p, hoy, app.state.config));
  const main = app.shell({
    title: 'Clientes',
    tab: 'clientes',
    fab: { label: 'Nuevo cliente', icon: 'userPlus', onClick: () => abrirFormCliente(app, null, (c) => app.go(`#/cliente/${c.id}`)) },
  });
  main.innerHTML = `<div class="search">${icon('search', 'sm')}<input type="search" placeholder="Buscar por nombre, cédula o teléfono" value="${esc(busqueda)}"></div><div data-list></div>`;
  const draw = () => {
    const q = norm(busqueda);
    const items = app.state.clientes
      .filter((c) => !q || [c.nombre, c.cedula, c.telefono, c.codigo, c.direccion].some((x) => norm(x).includes(q)))
      .map((c) => ({ c, r: resumenCliente(c, calcs, app.state.config) }))
      .sort((a, b) => (b.r.activos.length > 0) - (a.r.activos.length > 0) || a.c.nombre.localeCompare(b.c.nombre, 'es'));
    $('[data-list]', main).innerHTML = items.length
      ? `<p class="small muted" style="margin:0 4px 8px">${items.length} cliente${items.length > 1 ? 's' : ''}</p><div class="list">${items.map(({ c, r }) => `
        <div class="item" data-href="#/cliente/${c.id}">
          <div class="avatar ${avatarTone(c.nombre)}">${esc(initials(c.nombre))}</div>
          <div class="grow"><div class="t ellipsis">${esc(c.nombre)}</div><div class="s ellipsis">${r.cal.emoji} ${esc(r.cal.txt)} · ${esc([c.codigo, c.telefono].filter(Boolean).join(' · ') || 'Sin teléfono')}</div></div>
          <div class="end">${r.activos.length ? `<span class="amt num">${money(r.saldo)}</span>${estadoBadge(r.peor)}` : '<span class="badge b-muted">Sin deuda</span>'}</div>
        </div>`).join('')}</div>`
      : app.state.clientes.length
        ? emptyState('search', 'Sin resultados', 'Prueba con otro nombre.')
        : emptyState('users', 'Aún no hay clientes', 'Agrega tu primer cliente con el botón “Nuevo cliente”.');
  };
  $('input', main).addEventListener('input', (e) => { busqueda = e.target.value; draw(); });
  bindLista(main, app);
  draw();
}

export function detalle(app, id) {
  const cl = store.getCliente(id);
  if (!cl) {
    const main = app.shell({ title: 'Cliente', back: '#/clientes', tab: 'clientes' });
    main.innerHTML = emptyState('user', 'Cliente no encontrado');
    return;
  }
  const hoy = today();
  const calcs = store.prestamosDe(id).map((p) => calcular(p, hoy, app.state.config)).sort((a, b) => b.activo - a.activo || b.p.id - a.p.id);
  const r = resumenCliente(cl, calcs, app.state.config);
  const pagado = calcs.reduce((s, c) => s + c.pagado, 0);
  const historial = calcs.filter((c) => !c.activo);
  const ganHist = historial.reduce((s, c) => s + c.gananciaCobrada, 0);
  const main = app.shell({
    title: cl.nombre,
    back: '#/clientes',
    tab: 'clientes',
    actions: `<button class="icon-btn" data-edit aria-label="Editar cliente">${icon('edit')}</button>`,
    fab: { label: 'Nuevo préstamo', icon: 'plus', onClick: () => app.go(`#/nuevo?cliente=${cl.id}`) },
  });
  const tel = cl.telefono ? waPhone(cl.telefono, app.state.config.indicativo) : '';
  main.innerHTML = `
    <div class="card" style="text-align:center;padding-top:22px">
      <div class="avatar ${avatarTone(cl.nombre)}" style="width:68px;height:68px;font-size:24px;border-radius:22px;margin:0 auto 10px">${esc(initials(cl.nombre))}</div>
      <div style="font-size:20px;font-weight:800">${esc(cl.nombre)}</div>
      <div class="small muted">${esc([cl.codigo, cl.cedula ? `CC ${cl.cedula}` : ''].filter(Boolean).join(' · '))}</div>
      ${cl.direccion || cl.barrio ? `<div class="small muted row" style="justify-content:center;gap:4px;margin-top:6px">${icon('pin', 'sm')}${esc([cl.direccion, cl.barrio].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="btn-row" style="margin-top:14px">
        ${cl.telefono ? `<a class="btn" href="tel:${esc(cl.telefono)}">${icon('phone', 'sm')} Llamar</a><a class="btn" href="https://wa.me/${tel}" target="_blank" rel="noopener">${icon('chat', 'sm')} WhatsApp</a>` : `<button class="btn" data-edit>${icon('phone', 'sm')} Agregar teléfono</button>`}
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="ico tone-warn">${icon('wallet', 'sm')}</div><div class="v num">${money(r.saldo)}</div><div class="l">Debe ahora</div></div>
      <div class="kpi"><div class="ico tone-ok">${icon('cash', 'sm')}</div><div class="v num">${money(pagado)}</div><div class="l">Total pagado</div></div>
    </div>
    <div class="card">
      <div class="row between"><h3 style="margin:0">Calificación</h3>${calBadge(r.cal)}</div>
      <ul class="small muted" style="margin:10px 0 0;padding-left:18px">${r.cal.motivos.map((m) => `<li>${esc(m)}</li>`).join('') || '<li>Sin préstamos todavía.</li>'}</ul>
    </div>
    ${cl.notas ? `<div class="card"><h3>Notas</h3><p style="margin:0;white-space:pre-wrap">${esc(cl.notas)}</p></div>` : ''}
    <div class="section-title">Préstamos activos <span class="muted">${r.activos.length}</span></div>
    ${r.activos.length ? `<div class="list">${r.activos.map((c) => itemPrestamo(c, { showCliente: false })).join('')}</div>` : emptyState('checkCircle', 'Sin deudas', calcs.length ? 'Todos sus préstamos están pagados.' : 'Crea uno con “Nuevo préstamo”.')}
    ${historial.length ? `<details class="card flat" style="padding:12px 14px">
      <summary class="row between" style="cursor:pointer;list-style:none">
        <span class="row" style="gap:8px">${icon('clock', 'sm')}<b>Historial</b><span class="muted small">${historial.length} pagado${historial.length > 1 ? 's' : ''}</span></span>
        <span class="small muted">Ganancia <b style="color:var(--ok)">${money(ganHist)}</b></span></summary>
      <div class="list" style="margin:12px 0 0;box-shadow:none;border:1px solid var(--border)">${historial.map((c) => itemPrestamo(c, { showCliente: false })).join('')}</div>
    </details>` : ''}
    <button class="btn danger block" data-del style="margin-top:10px">${icon('trash', 'sm')} Eliminar cliente</button>`;
  bindLista(main, app);
  main.parentElement.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => abrirFormCliente(app, cl, () => afterLayers(() => app.refresh()))));
  $('[data-del]', main).onclick = async () => {
    if (calcs.length) return toast('Primero elimina o pasa sus préstamos a otro cliente', 'err');
    if (!(await confirmDialog({ title: '¿Eliminar cliente?', text: `Se eliminará a ${esc(cl.nombre)}.`, ok: 'Eliminar', danger: true }))) return;
    app.state.clientes = app.state.clientes.filter((x) => x !== cl);
    await app.save();
    toast('Cliente eliminado');
    app.go('#/clientes');
  };
}

/** Formulario de cliente (nuevo o editar). onSaved(cliente) se llama después de guardar. */
export function abrirFormCliente(app, cl, onSaved, { stay = false } = {}) {
  const v = cl || {};
  sheet({
    title: cl ? 'Editar cliente' : 'Nuevo cliente',
    ico: cl ? 'edit' : 'userPlus',
    body: `<form autocomplete="off">
      ${field('Nombre y apellidos', `<input name="nombre" value="${esc(v.nombre || '')}" required autocapitalize="words">`)}
      <div class="grid2">
        ${field('Cédula', `<input name="cedula" inputmode="numeric" value="${esc(v.cedula || '')}">`)}
        ${field('Teléfono', `<input name="telefono" type="tel" inputmode="tel" value="${esc(v.telefono || '')}">`)}
      </div>
      ${field('Dirección', `<input name="direccion" value="${esc(v.direccion || '')}">`)}
      ${field('Barrio', `<input name="barrio" value="${esc(v.barrio || '')}">`)}
      ${field('Notas', `<textarea name="notas" placeholder="Referencias, fiador, etc.">${esc(v.notas || '')}</textarea>`)}
      <button class="btn primary block" type="submit">${icon('check', 'sm')} Guardar</button>
    </form>`,
    onMount(el, api) {
      const f = $('form', el);
      setTimeout(() => !cl && f.nombre.focus(), 300);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = {
          nombre: f.nombre.value.trim(),
          cedula: f.cedula.value.trim(),
          telefono: f.telefono.value.trim(),
          direccion: f.direccion.value.trim(),
          barrio: f.barrio.value.trim(),
          notas: f.notas.value.trim(),
        };
        if (!data.nombre) return toast('Escribe el nombre', 'err');
        let res;
        if (cl) res = Object.assign(cl, data);
        else res = store.addCliente(data);
        await app.save();
        api.close();
        toast(cl ? 'Cliente actualizado' : 'Cliente creado');
        if (stay) onSaved?.(res);
        else afterLayers(() => onSaved?.(res));
      };
    },
  });
}
