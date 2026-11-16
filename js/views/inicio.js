// Pantalla de inicio: resumen del día, alertas y cobros pendientes.
import { icon } from '../icons.js';
import { $, money, ffull, today, diffDays, esc } from '../utils.js';
import { resumenGeneral, diasPorVencer } from '../logic.js';
import { emptyState } from '../ui.js';
import { itemPrestamo, bindLista } from './prestamos.js';
import { abrirPago } from './prestamo.js';
import { abrirFormCliente } from './clientes.js';
import { abrirGasto } from './gastos.js';
import { exportBackup, estadoRespaldo } from '../backup.js';
import { getPrestamo } from '../store.js';
import * as store from '../store.js';
import { toast } from '../ui.js';
import { tarjetaTotales } from './totales.js';

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function render(app) {
  const s = app.state;
  const hoy = today();
  const r = resumenGeneral(s, hoy);
  const main = app.shell({
    title: saludo(),
    tab: 'inicio',
    actions: `<button class="icon-btn" data-lock aria-label="Bloquear">${icon('lock')}</button>`,
    fab: { label: 'Nuevo préstamo', icon: 'plus', onClick: () => app.go('#/nuevo') },
  });
  document.querySelector('[data-lock]').onclick = () => app.lock();

  const cobrar = r.activos.filter((c) => c.aCobrarHoy > 0).sort((a, b) => b.diasMora - a.diasMora || b.aCobrarHoy - a.aCobrarHoy);

  // Recordatorio de respaldo: va arriba de todo
  const er = estadoRespaldo(s, hoy);
  let avisoRespaldo = '';
  if (er.mostrar) {
    const titulo = er.dias === null ? 'Aún no has hecho ningún respaldo'
      : `Tu último respaldo fue hace ${er.dias} día${er.dias === 1 ? '' : 's'}`;
    const cambios = er.cambios ? `Llevas <b>${er.cambios} cambio${er.cambios === 1 ? '' : 's'}</b> sin respaldar (pagos, préstamos, gastos…). ` : '';
    avisoRespaldo = `<div class="alert ${er.nivel} respaldo-aviso">${icon('shield')}<div class="grow"><b>${titulo}</b>
      <p>${cambios}Si pierdes o te roban el teléfono, <b>solo podrás recuperar los datos con un respaldo</b>. Guárdalo en Drive, en tu correo o envíatelo por WhatsApp.</p>
      <div class="btn-row"><button class="btn primary sm" data-respaldo>${icon('download', 'sm')} Hacer respaldo ahora</button>${er.nivel === 'warn' ? '<button class="btn ghost sm" data-posponer>Recordar mañana</button>' : ''}</div></div></div>`;
  }
  let alertas = '';
  if (r.interesesPendientes.length) {
    alertas += `<div class="alert warn">${icon('percent')}<div class="grow"><b>${r.interesesPendientes.length} préstamo${r.interesesPendientes.length > 1 ? 's' : ''} con interés adicional por aplicar</b>
      <p>El plazo venció y siguen debiendo.</p><a class="btn sm" href="#/prestamos?filtro=interes">Revisar</a></div></div>`;
  }

  if (r.porRetirar > 0) {
    alertas += `<div class="alert info" data-href="#/transferencias" style="cursor:pointer">${icon('transfer')}<div class="grow"><b>${money(r.porRetirar)} en transferencias por retirar</b>
      <p>${r.nPorRetirar} pago${r.nPorRetirar === 1 ? '' : 's'} que llegaron a la cuenta. Márcalos cuando los saques.</p></div>${icon('next', 'sm')}</div>`;
  }

  main.innerHTML = `
    <p class="muted" style="margin:-4px 4px 12px">${esc(ffull(hoy).replace(/^./, (x) => x.toUpperCase()))}</p>
    ${avisoRespaldo}
    <div class="hero">
      <div class="label">Total deuda por cobrar</div>
      <div class="big num">${money(r.porCobrar)}</div>
      <div class="split">
        <div><span>Para cobrar hoy</span><b class="num">${money(r.aCobrarHoy)}</b><span>${r.nCobrarHoy} cliente${r.nCobrarHoy === 1 ? '' : 's'}</span></div>
        <div><span>Cobrado hoy</span><b class="num">${money(r.cobradoHoy)}</b><span>${r.aCobrarHoy + r.cobradoHoy > 0 ? Math.round((r.cobradoHoy / (r.aCobrarHoy + r.cobradoHoy)) * 100) : 0}% del día</span></div>
      </div>
    </div>
    ${alertas}
    <div class="quick">
      <button data-q="nuevo"><span class="ico tone-primary">${icon('plus')}</span>Préstamo</button>
      <button data-q="cliente"><span class="ico tone-info">${icon('userPlus')}</span>Cliente</button>
      <button data-q="gasto"><span class="ico tone-warn">${icon('cash')}</span>Gasto</button>
      <button data-q="cierre"><span class="ico tone-ok">${icon('checkCircle')}</span>Cierre del día</button>
    </div>
    <div class="kpis" style="margin-top:14px">
      <div class="kpi"><div class="ico tone-info">${icon('coins', 'sm')}</div><div class="v num">${money(r.enCalle)}</div><div class="l">Capital en la calle</div></div>
      <div class="kpi"><div class="ico tone-ok">${icon('trending', 'sm')}</div><div class="v num">${money(r.gananciaCobrada)}</div><div class="l">Ganancia cobrada</div></div>
      <div class="kpi"><div class="ico tone-violet">${icon('bank', 'sm')}</div><div class="v num">${money(r.disponible)}</div><div class="l">Disponible</div></div>
      <div class="kpi"><div class="ico tone-danger">${icon('alert', 'sm')}</div><div class="v num">${r.atrasados.length}</div><div class="l">Atrasados / vencidos</div></div>
    </div>
    ${s.prestamos.length ? `<div style="margin-top:14px">${tarjetaTotales(r)}</div>` : ''}
    <div class="section-title">Cobros de hoy <a href="#/prestamos?filtro=hoy">Ver todos</a></div>
    ${cobrar.length
      ? `<div class="list">${cobrar.map((c) => itemPrestamo(c, { cobrar: true })).join('')}</div>`
      : s.prestamos.length
        ? emptyState('checkCircle', '¡Todo al día!', 'No hay cobros pendientes para hoy.')
        : emptyState('wallet', 'Bienvenido', 'Empieza creando un cliente y su primer préstamo.', `<button class="btn primary" data-q="nuevo">${icon('plus', 'sm')} Nuevo préstamo</button>`)}
    ${r.porVencer.length ? `
    <div class="section-title">Por vencer · próximos ${diasPorVencer(s.config)} días <a href="#/prestamos?filtro=porvencer">Ver todos</a></div>
    <div class="list">${r.porVencer.slice(0, 8).map((c) => itemPrestamo(c, { porVencer: true })).join('')}</div>
    ${r.porVencer.length > 8 ? `<a class="btn ghost block" href="#/prestamos?filtro=porvencer">Ver los ${r.porVencer.length}</a>` : ''}` : ''}`;

  bindLista(main, app, (id) => abrirPago(app, getPrestamo(id)));
  const respaldo = async () => {
    const via = await exportBackup();
    if (via) toast(via === 'compartido' ? 'Respaldo compartido' : 'Respaldo descargado');
    app.refresh();
  };
  main.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]')?.dataset.q;
    if (q === 'nuevo') app.go('#/nuevo');
    else if (q === 'cliente') abrirFormCliente(app, null, (c) => app.go(`#/cliente/${c.id}`));
    else if (q === 'gasto') abrirGasto(app);
    else if (q === 'cierre') app.go('#/cierre');
    if (e.target.closest('[data-respaldo]')) respaldo();
    if (e.target.closest('[data-posponer]')) {
      s.config.respaldoPospuesto = hoy;
      store.save(); // no cuenta como cambio de datos
      toast('Te lo recuerdo mañana');
      app.refresh();
    }
    const h = e.target.closest('.alert[data-href]');
    if (h) app.go(h.dataset.href);
  });
}
