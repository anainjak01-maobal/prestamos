// Detalle de un préstamo, nuevo préstamo y todas sus acciones (cobrar, intereses, renovación, ajustes, tarjeta).
import { icon } from '../icons.js';
import { $, $$, esc, money, num, fdate, fshort, today, parseMoney, parseNum, relDays, avatarTone, initials, moneyInput } from '../utils.js';
import { calcular, generarFechas, cuotaSugerida, interesDe, MODALIDADES, CUOTAS_DEFECTO } from '../logic.js';
import { sheet, confirmDialog, toast, field, moneyField, segHtml, segValue, switchHtml, fullscreen, afterLayers, emptyState, bindSegs } from '../ui.js';
import { getCliente, getPrestamo, addMov, addPrestamo } from '../store.js';
import * as store from '../store.js';
import { estadoBadge } from './prestamos.js';
import { abrirFormCliente } from './clientes.js';
import { drawCard, shareCardImage, textoEstadoCuenta, openWhatsApp } from '../card.js';

const cfg = () => store.state.config;
const refreshLuego = (app, fn) => afterLayers(() => (fn ? fn() : app.refresh()));

// =====================================================================
// Formulario de condiciones (nuevo préstamo, editar, renovación)
// =====================================================================
function condicionesHtml(v, { conCapital = true, labelFecha = 'Fecha del préstamo', conFecha = true } = {}) {
  return `
    ${conFecha ? field(labelFecha, `<input type="date" name="fecha" value="${esc(v.fecha)}" required>`) : ''}
    ${conCapital ? moneyField('capital', 'Valor prestado (capital)', v.capital) : ''}
    <div class="field"><span class="lbl">Modalidad de pago</span>${segHtml('modalidad', MODALIDADES, v.modalidad)}</div>
    <div class="grid2">
      ${field('Interés (%)', `<input type="number" name="tasa" inputmode="decimal" min="0" max="300" step="0.5" value="${esc(v.tasa)}">`)}
      ${field('Nº de cuotas', `<input type="number" name="nCuotas" inputmode="numeric" min="1" max="1000" value="${esc(v.nCuotas)}">`)}
    </div>
    ${moneyField('valorCuota', 'Valor de cada cuota', v.valorCuota, 'Se calcula solo. Puedes cambiarlo.')}
    ${switchHtml('cobraDomingos', 'Cobrar los domingos', v.cobraDomingos, 'Si lo apagas, los domingos no cuentan como día de cobro')}`;
}

/** Enlaza el formulario de condiciones. getCapital() da el capital base cuando no hay campo de capital. */
function bindCondiciones(el, { getCapital, onChange }) {
  let cuotaManual = false;
  let nManual = false;
  const read = () => ({
    fecha: el.querySelector('[name=fecha]')?.value || today(),
    capital: el.querySelector('[name=capital]') ? parseMoney(el.querySelector('[name=capital]').value) : getCapital(),
    modalidad: segValue(el, 'modalidad'),
    tasa: parseNum(el.querySelector('[name=tasa]').value),
    nCuotas: Math.max(1, parseInt(el.querySelector('[name=nCuotas]').value, 10) || 1),
    valorCuota: parseMoney(el.querySelector('[name=valorCuota]').value),
    cobraDomingos: el.querySelector('[name=cobraDomingos]').checked,
  });
  const recalc = () => {
    const v = read();
    if (!cuotaManual) {
      const vc = cuotaSugerida(v.capital, v.tasa, v.nCuotas);
      el.querySelector('[name=valorCuota]').value = vc ? num(vc) : '';
    }
    onChange?.(read());
  };
  el.querySelector('[name=valorCuota]').addEventListener('input', () => { cuotaManual = true; onChange?.(read()); });
  el.querySelector('[name=nCuotas]').addEventListener('input', () => { nManual = true; recalc(); });
  el.querySelector('[data-seg=modalidad]').addEventListener('change', () => {
    if (!nManual) el.querySelector('[name=nCuotas]').value = CUOTAS_DEFECTO[segValue(el, 'modalidad')] || 1;
    recalc();
  });
  ['capital', 'tasa', 'fecha', 'cobraDomingos'].forEach((n) => {
    const i = el.querySelector(`[name=${n}]`);
    i?.addEventListener(i.type === 'checkbox' ? 'change' : 'input', recalc);
  });
  return { read, recalc, setManual: (b) => { cuotaManual = b; nManual = b; } };
}

const PLURAL = { Diario: 'diarias', Semanal: 'semanales', Quincenal: 'quincenales', Mensual: 'mensuales' };
const SINGULAR = { Diario: 'diaria', Semanal: 'semanal', Quincenal: 'quincenal', Mensual: 'mensual' };

function resumenCondiciones(v, capital = v.capital) {
  const interes = interesDe(capital, v.tasa);
  const total = capital + interes;
  const fechas = generarFechas(v.fecha, v.modalidad, v.nCuotas, v.cobraDomingos);
  const ultimo = total - v.valorCuota * (v.nCuotas - 1);
  return `
    <div class="r"><span>Capital</span><b>${money(capital)}</b></div>
    <div class="r"><span>Interés ${num(v.tasa)}%</span><b>${money(interes)}</b></div>
    <div class="r"><span>${v.nCuotas} ${v.nCuotas > 1 ? `cuotas ${PLURAL[v.modalidad]}` : `cuota ${SINGULAR[v.modalidad]}`} de</span><b>${money(v.valorCuota)}</b></div>
    ${v.nCuotas > 1 && v.valorCuota && ultimo !== v.valorCuota && ultimo > 0 ? `<div class="r small muted"><span>Última cuota</span><span>${money(ultimo)}</span></div>` : ''}
    <div class="r"><span>Primer cobro</span><b>${fdate(fechas[0])}</b></div>
    <div class="r"><span>Fin del plazo</span><b>${fdate(fechas[fechas.length - 1])}</b></div>
    <div class="r total"><span>Total a pagar</span><b>${money(total)}</b></div>
    ${v.valorCuota * v.nCuotas < total ? `<div class="r small" style="color:var(--warn)"><span>Las cuotas no alcanzan el total</span><span>faltan ${money(total - v.valorCuota * v.nCuotas)}</span></div>` : ''}`;
}

// =====================================================================
// Nuevo préstamo
// =====================================================================
export function nuevo(app, _p, query) {
  const c = cfg();
  const main = app.shell({ title: 'Nuevo préstamo', back: query.cliente ? `#/cliente/${query.cliente}` : '#/prestamos', tab: 'prestamos' });
  const clientes = [...store.state.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const v = { fecha: today(), capital: '', modalidad: 'Diario', tasa: c.tasa, nCuotas: CUOTAS_DEFECTO.Diario, valorCuota: '', cobraDomingos: c.cobraDomingos };
  const opts = (sel) => `<option value="">— Elige el cliente —</option>${clientes.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nombre)}${x.codigo ? ` (${esc(x.codigo)})` : ''}</option>`).join('')}`;
  main.innerHTML = `<form class="card" autocomplete="off">
      <div class="field"><label>Cliente</label>
        <div class="row"><select name="cliente" class="input grow">${opts(query.cliente)}</select>
        <button type="button" class="btn sm" data-nuevo-cliente>${icon('userPlus', 'sm')} Nuevo</button></div></div>
      ${condicionesHtml(v)}
      ${field('Notas (opcional)', '<textarea name="notas" placeholder="Ej: fiador, acuerdo especial…"></textarea>')}
    </form>
    <div class="summary" data-res></div>
    <button class="btn primary block" data-guardar>${icon('check', 'sm')} Crear préstamo</button>`;
  const form = $('form', main);
  $$('input.money', form).forEach(moneyInput);
  bindSegs(form);
  const res = $('[data-res]', main);
  const cond = bindCondiciones(form, { onChange: (x) => { res.innerHTML = x.capital > 0 ? resumenCondiciones(x) : '<div class="r muted small">Escribe el valor prestado para ver el resumen.</div>'; } });
  cond.recalc();
  $('[data-nuevo-cliente]', main).onclick = () => abrirFormCliente(app, null, (cl) => {
    clientes.push(cl);
    clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    form.cliente.innerHTML = opts(cl.id);
  }, { stay: true });
  $('[data-guardar]', main).onclick = async () => {
    const x = cond.read();
    const clienteId = form.cliente.value;
    if (!clienteId) return toast('Elige el cliente', 'err');
    if (!(x.capital > 0)) return toast('Escribe el valor prestado', 'err');
    if (!(x.valorCuota > 0)) return toast('Revisa el valor de la cuota', 'err');
    const p = addPrestamo({ clienteId, ...x, notas: form.notas.value.trim() });
    await app.save();
    toast(`Préstamo #${p.id} creado`);
    app.go(`#/prestamo/${p.id}`);
  };
}

// =====================================================================
// Detalle
// =====================================================================
let tabActual = 'movs';

export function detalle(app, id) {
  const p = getPrestamo(id);
  if (!p) {
    const main = app.shell({ title: 'Préstamo', back: '#/prestamos', tab: 'prestamos' });
    main.innerHTML = emptyState('wallet', 'Préstamo no encontrado', 'Puede que haya sido eliminado.');
    return;
  }
  const hoy = today();
  const c = calcular(p, hoy, cfg());
  const cl = getCliente(p.clienteId);
  const nombre = cl?.nombre || 'Cliente';
  const main = app.shell({
    title: nombre,
    back: '#/prestamos',
    tab: 'prestamos',
    actions: `<button class="icon-btn" data-mas aria-label="Más opciones">${icon('more')}</button>`,
  });
  const ci = c.ciclo;

  let alertas = '';
  if (c.interesPendiente) {
    const ip = c.interesPendiente;
    alertas += `<div class="alert warn">${icon('percent')}<div class="grow">
      <b>Toca interés adicional${ip.pendientes > 1 ? ` (${ip.pendientes} meses)` : ''}</b>
      <p>El plazo venció el ${fdate(c.fechaFin)} y sigue debiendo. Interés #${ip.numero} desde el ${fdate(ip.fecha)}: ${ip.pct}% sobre ${money(ip.base)} = <b>${money(ip.valor)}</b>.</p>
      <div class="btn-row"><button class="btn sm" data-omitir>No aplicar</button><button class="btn primary sm" data-aplicar>Aplicar ${money(ip.valor)}</button></div>
    </div></div>`;
  }
  if (c.activo && c.atraso > 0 && c.diasMora > 0) {
    const n = Math.ceil(c.atraso / c.valorCuota);
    alertas += `<div class="alert ${c.diasMora >= cfg().alertaMora ? 'danger' : 'info'}">${icon('clock')}<div class="grow">
      <b>Debe ${money(c.atraso)}</b> <span class="small">(${n} cuota${n > 1 ? 's' : ''})</span>
      <p style="margin-bottom:0">Atrasado desde el ${fdate(c.proxima)} · ${c.diasMora} día${c.diasMora > 1 ? 's' : ''} de mora.</p></div></div>`;
  }
  if (p.estado === 'anulado') alertas += `<div class="alert info">${icon('ban')}<div class="grow"><b>Préstamo anulado</b><p style="margin:0">No cuenta en la cartera ni en las ganancias.</p></div></div>`;

  main.innerHTML = `
    <div class="hero loan-head">
      <div class="row between"><span class="label">${c.activo ? 'Saldo pendiente' : c.estado === 'pagado' ? 'Paz y salvo' : 'Saldo'}</span>
        <span style="background:rgba(255,255,255,.18);border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700">#${p.id} · ${esc(ci.modalidad)}</span></div>
      <div class="saldo num">${money(c.saldo)}</div>
      <div class="progress"><i style="width:${Math.round(c.progreso * 100)}%"></i></div>
      <div class="small" style="opacity:.9">Pagado ${money(c.pagado)} · ${Math.round(c.progreso * 100)}%</div>
      <div class="facts">
        <div><span>Cuota</span><b class="num">${money(c.valorCuota)}</b></div>
        <div><span>${c.activo ? 'Próximo cobro' : 'Estado'}</span><b>${c.activo ? (c.proxima ? fshort(c.proxima) : '—') : esc(c.estado === 'pagado' ? 'Pagado' : 'Anulado')}</b></div>
        <div><span>Fin del plazo</span><b>${fshort(c.fechaFin)}</b></div>
      </div>
    </div>
    <div class="row" style="margin:-4px 2px 14px;flex-wrap:wrap;gap:6px">${estadoBadge(c)}
      <span class="badge b-muted">${ci.cobraDomingos ? 'Cobra domingos' : 'Sin domingos'}</span>
      <span class="badge b-muted">Interés ${num(ci.tasa)}%</span>
      ${c.ciclos.length > 1 ? `<span class="badge b-violet">Renovado ${c.ciclos.length - 1}×</span>` : ''}</div>
    ${alertas}
    <div class="actions">
      <button data-a="pago" ${!c.activo ? 'disabled style="opacity:.45"' : ''}><span class="ico tone-ok">${icon('cash')}</span>Cobrar</button>
      <button data-a="interes" ${!c.activo ? 'disabled style="opacity:.45"' : ''}><span class="ico tone-warn">${icon('percent')}</span>Interés adicional</button>
      <button data-a="renovar" ${!c.activo ? 'disabled style="opacity:.45"' : ''}><span class="ico tone-violet">${icon('refresh')}</span>Interés + abono</button>
      <button data-a="editar"><span class="ico tone-info">${icon('edit')}</span>Editar</button>
      <button data-a="tarjeta"><span class="ico tone-primary">${icon('card')}</span>Enviar tarjeta</button>
      <button data-a="whatsapp"><span class="ico tone-ok">${icon('chat')}</span>WhatsApp texto</button>
      <button data-a="mostrar"><span class="ico tone-primary">${icon('expand')}</span>Mostrar al cliente</button>
      <button data-a="cliente"><span class="ico ${avatarTone(nombre)}" style="font-weight:800">${esc(initials(nombre))}</span>Ver cliente</button>
    </div>
    <div class="tabs"><button data-t="movs">Movimientos</button><button data-t="plan">Plan de cuotas</button><button data-t="datos">Detalles</button></div>
    <div data-tab></div>`;

  const tabEl = $('[data-tab]', main);
  const drawTab = () => {
    $$('.tabs button', main).forEach((b) => b.classList.toggle('on', b.dataset.t === tabActual));
    tabEl.innerHTML = tabActual === 'movs' ? movsHtml(c) : tabActual === 'plan' ? planHtml(c, hoy) : datosHtml(c, cl);
  };
  $('.tabs', main).onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (b) { tabActual = b.dataset.t; drawTab(); }
  };
  drawTab();

  tabEl.addEventListener('click', (e) => {
    const tr = e.target.closest('[data-mov]');
    if (!tr) return;
    if (tr.dataset.mov === 'prestamo') return abrirEditar(app, p);
    const m = p.movs.find((x) => x.id === tr.dataset.mov);
    if (m) abrirMovimiento(app, p, m);
  });

  const acciones = {
    pago: () => abrirPago(app, p),
    interes: () => abrirInteres(app, p),
    renovar: () => abrirRenovacion(app, p),
    editar: () => abrirEditar(app, p),
    tarjeta: () => enviarTarjeta(p),
    whatsapp: () => enviarTexto(p),
    mostrar: () => mostrarTarjeta(p),
    cliente: () => app.go(`#/cliente/${p.clienteId}`),
  };
  $('.actions', main).onclick = (e) => {
    const b = e.target.closest('[data-a]');
    if (b && !b.disabled) acciones[b.dataset.a]();
  };
  $('[data-aplicar]', main)?.addEventListener('click', () => abrirInteres(app, p, c.interesPendiente));
  $('[data-omitir]', main)?.addEventListener('click', async () => {
    const ip = c.interesPendiente;
    if (!(await confirmDialog({ title: 'No aplicar interés', text: `Se dejará anotado que el interés #${ip.numero} (${money(ip.valor)}) no se cobró.`, ok: 'No aplicar' }))) return;
    addMov(p, { tipo: 'interes_omitido', fecha: ip.fecha, nota: `Interés adicional #${ip.numero} no aplicado` });
    await app.save();
    toast('Anotado');
    refreshLuego(app);
  });
  $('[data-mas]', main.parentElement).onclick = () => abrirMas(app, p, c);
}

function movsHtml(c) {
  const rows = c.lineas.map((l) => {
    const id = l.mov ? l.mov.id : 'prestamo';
    const etiqueta = {
      prestamo: 'Préstamo', pago: 'Abono', interes: 'Interés adicional', interes_omitido: 'Interés no aplicado', ajuste: 'Ajuste', renovacion: 'Nuevo ciclo',
    }[l.tipo];
    const nota = l.nota && l.tipo !== 'pago' ? l.nota : l.nota || '';
    const val = l.abono ? `<span class="abono">${num(l.abono)}</span>` : l.cargo ? `<span class="cargo">+${num(l.cargo)}</span>` : '<span class="muted">—</span>';
    return `<tr class="tap" data-mov="${id}"><td>${fdate(l.fecha)}<span class="note">${esc(etiqueta)}${nota && l.tipo !== 'prestamo' ? ' · ' + esc(nota) : ''}</span></td>
      <td>${val}</td><td class="resta">${num(Math.max(0, l.saldo))}</td></tr>`;
  }).join('');
  return `<div class="card" style="padding:6px 12px">
    <table class="ledger"><thead><tr><th>Fecha</th><th>Abono</th><th>Resta</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted" style="text-align:center">Toca un movimiento para corregirlo o eliminarlo.</p>`;
}

function planHtml(c, hoy) {
  const ci = c.ciclo;
  let pagadoRest = Math.max(0, ci.pagado);
  const cells = c.fechas.map((f, i) => {
    const vc = c.valorCuota;
    const cubre = Math.min(vc, pagadoRest);
    pagadoRest -= cubre;
    let cls = '';
    let estado = '';
    if (cubre >= vc) { cls = 'paid'; estado = 'Pagada'; }
    else if (f < hoy) { cls = 'late'; estado = cubre > 0 ? `Parcial ${num(cubre)}` : 'Atrasada'; }
    else if (f === hoy) { cls = 'today'; estado = cubre > 0 ? `Parcial ${num(cubre)}` : 'Hoy'; }
    else estado = cubre > 0 ? `Parcial ${num(cubre)}` : relDays(f, hoy);
    if (i >= ci.nCuotas) cls += ' extra';
    return `<div class="${cls}"><b>#${i + 1}</b>${fshort(f)}<br><span class="tiny">${esc(estado)}</span></div>`;
  }).join('');
  return `<div class="card">
    <div class="row between small muted" style="margin-bottom:10px"><span>${ci.nCuotas} cuotas de ${money(c.valorCuota)}</span><span>${c.cubiertas} cubiertas</span></div>
    <div class="plan">${cells}</div>
    ${c.fechas.length > ci.nCuotas ? '<p class="small muted" style="margin-bottom:0">Las cuotas con borde punteado son extra: aparecen porque el saldo aumentó con intereses adicionales.</p>' : ''}
  </div>`;
}

function datosHtml(c, cl) {
  const p = c.p;
  const ciclos = c.ciclos.length > 1
    ? `<div class="card"><h3>Ciclos (renovaciones)</h3>${c.ciclos.map((x, i) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--border)">
        <span><b>${i === 0 ? 'Inicial' : `Renovación ${i}`}</b> · ${fdate(x.inicio)}</span>
        <span class="num">${money(x.capital)} + ${num(x.tasa)}% = <b>${money(x.total)}</b></span></div>`).join('')}</div>`
    : '';
  return `<div class="card"><dl class="kv">
      <dt>Cliente</dt><dd>${esc(cl?.nombre || '—')}</dd>
      <dt>Fecha del préstamo</dt><dd>${fdate(p.fecha)}</dd>
      <dt>Capital prestado</dt><dd>${money(p.capital)}</dd>
      <dt>Interés inicial</dt><dd>${num(p.tasa)}% · ${money(interesDe(p.capital, p.tasa))}</dd>
      <dt>Modalidad actual</dt><dd>${esc(c.ciclo.modalidad)} · ${c.ciclo.nCuotas} cuotas</dd>
      <dt>Valor cuota</dt><dd>${money(c.valorCuota)}</dd>
      <dt>Fin del plazo</dt><dd>${fdate(c.fechaFin)}</dd>
      <dt>Total pagado</dt><dd>${money(c.pagado)}</dd>
      <dt>Intereses adicionales</dt><dd>${money(c.adicionales)}</dd>
      ${c.ajustes ? `<dt>Ajustes</dt><dd>${money(c.ajustes)}</dd>` : ''}
      <dt>Ganancia pactada</dt><dd>${money(c.interesesPactados)}</dd>
      <dt>Ganancia cobrada</dt><dd>${money(c.gananciaCobrada)}</dd>
      <dt>Capital por recuperar</dt><dd>${money(c.capitalPendiente)}</dd>
    </dl></div>${ciclos}
    ${p.notas ? `<div class="card"><h3>Notas</h3><p style="margin:0;white-space:pre-wrap">${esc(p.notas)}</p></div>` : ''}`;
}

// =====================================================================
// Acciones
// =====================================================================
export function abrirPago(app, p, { onDone } = {}) {
  const c = calcular(p, today(), cfg());
  const cl = getCliente(p.clienteId);
  const sug = c.cuotaSugeridaHoy || Math.min(c.saldo, c.valorCuota);
  const chips = [[`Cuota ${money(Math.min(c.valorCuota, c.saldo))}`, Math.min(c.valorCuota, c.saldo)]];
  if (c.atraso > c.valorCuota) chips.push([`Lo atrasado ${money(c.atraso)}`, c.atraso]);
  chips.push([`Todo ${money(c.saldo)}`, c.saldo]);
  sheet({
    title: 'Registrar pago',
    ico: 'cash',
    tone: 'tone-ok',
    body: `<p class="small muted" style="margin-top:-6px">${esc(cl?.nombre || '')} · Préstamo #${p.id} · Saldo <b>${money(c.saldo)}</b></p>
      ${moneyField('valor', 'Valor que paga', sug)}
      <div class="quick-amts">${chips.map(([t, v]) => `<button type="button" data-v="${v}">${esc(t)}</button>`).join('')}</div>
      <div class="grid2">
        ${field('Fecha', `<input type="date" name="fecha" value="${today()}">`)}
        ${field('Nota', '<input name="nota" placeholder="Opcional">')}
      </div>
      <div class="summary" data-res></div>
      <div class="btn-row"><button class="btn" data-ok="wa">${icon('chat', 'sm')} Guardar y avisar</button><button class="btn primary" data-ok="1">${icon('check', 'sm')} Guardar</button></div>`,
    onMount(el, api) {
      const inp = $('[name=valor]', el);
      const upd = () => {
        const v = parseMoney(inp.value);
        const queda = c.saldo - v;
        $('[data-res]', el).innerHTML = `<div class="r"><span>Saldo actual</span><b>${money(c.saldo)}</b></div>
          <div class="r"><span>Abono</span><b style="color:var(--ok)">- ${money(v)}</b></div>
          <div class="r total"><span>${queda <= 0 ? '¡Queda a paz y salvo!' : 'Queda debiendo'}</span><b>${money(Math.max(0, queda))}</b></div>
          ${queda < 0 ? `<div class="r small" style="color:var(--danger)"><span>El pago supera el saldo en ${money(-queda)}</span></div>` : ''}`;
      };
      inp.addEventListener('input', upd);
      $('.quick-amts', el).onclick = (e) => {
        const b = e.target.closest('[data-v]');
        if (b) { inp.value = num(+b.dataset.v); upd(); }
      };
      upd();
      $$('[data-ok]', el).forEach((b) => (b.onclick = async () => {
        const v = parseMoney(inp.value);
        if (!(v > 0)) return toast('Escribe el valor del pago', 'err');
        if (v > c.saldo) return toast('El pago no puede ser mayor que el saldo', 'err');
        addMov(p, { tipo: 'pago', fecha: $('[name=fecha]', el).value || today(), valor: v, nota: $('[name=nota]', el).value.trim() });
        await app.save();
        api.close();
        toast(v >= c.saldo ? '¡Préstamo pagado completo!' : `Pago de ${money(v)} registrado`);
        if (b.dataset.ok === 'wa') enviarTexto(p);
        refreshLuego(app, onDone);
      }));
    },
  });
}

export function abrirInteres(app, p, pendiente = null) {
  const c = calcular(p, today(), cfg());
  const pct0 = pendiente?.pct ?? cfg().tasaAdicional;
  sheet({
    title: 'Interés adicional',
    ico: 'percent',
    tone: 'tone-warn',
    body: `<p class="small muted" style="margin-top:-6px">Se suma al saldo pendiente y queda anotado con su fecha.</p>
      <div class="grid2">
        ${field('Porcentaje (%)', `<input type="number" name="pct" inputmode="decimal" step="0.5" min="0" value="${pct0}">`)}
        ${field('Fecha', `<input type="date" name="fecha" value="${pendiente?.fecha || today()}">`)}
      </div>
      ${moneyField('base', 'Sobre el saldo de', c.saldo)}
      ${moneyField('valor', 'Valor del interés', interesDe(c.saldo, pct0), 'Se calcula solo; puedes cambiarlo.')}
      ${field('Nota', `<input name="nota" value="">`)}
      <div class="summary" data-res></div>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Aplicar interés</button>`,
    onMount(el, api) {
      let manual = false;
      const q = (n) => $(`[name=${n}]`, el);
      const upd = () => {
        const pct = parseNum(q('pct').value), base = parseMoney(q('base').value);
        if (!manual) q('valor').value = num(interesDe(base, pct));
        const v = parseMoney(q('valor').value);
        $('[data-res]', el).innerHTML = `<div class="r"><span>Saldo actual</span><b>${money(c.saldo)}</b></div>
          <div class="r"><span>Interés ${num(pct)}%</span><b style="color:var(--danger)">+ ${money(v)}</b></div>
          <div class="r total"><span>Nuevo saldo</span><b>${money(c.saldo + v)}</b></div>`;
      };
      q('valor').addEventListener('input', () => { manual = true; upd(); });
      q('pct').addEventListener('input', () => { manual = false; upd(); });
      q('base').addEventListener('input', () => { manual = false; upd(); });
      upd();
      $('[data-ok]', el).onclick = async () => {
        const v = parseMoney(q('valor').value), pct = parseNum(q('pct').value), base = parseMoney(q('base').value);
        if (!(v > 0)) return toast('El valor del interés debe ser mayor que 0', 'err');
        const nota = q('nota').value.trim() || `Interés adicional ${num(pct)}% sobre ${money(base)}`;
        addMov(p, { tipo: 'interes', fecha: q('fecha').value || today(), valor: v, pct, base, nota });
        await app.save();
        api.close();
        toast(`Interés de ${money(v)} aplicado`);
        refreshLuego(app);
      };
    },
  });
}

export function abrirRenovacion(app, p) {
  const c = calcular(p, today(), cfg());
  const ci = c.ciclo;
  const interesSug = Math.min(c.saldo, ci.interes + Math.max(0, ci.extra));
  const v0 = { fecha: today(), modalidad: ci.modalidad, tasa: ci.tasa, nCuotas: ci.nCuotas, valorCuota: '', cobraDomingos: ci.cobraDomingos };
  sheet({
    title: 'Interés + abono a capital',
    ico: 'refresh',
    tone: 'tone-violet',
    body: `<p class="small muted" style="margin-top:-6px">El cliente paga los intereses y abona al capital. Lo que queda debiendo pasa a ser el nuevo capital y se recalculan las cuotas.</p>
      <div class="summary"><div class="r"><span>Saldo actual</span><b>${money(c.saldo)}</b></div></div>
      <div class="grid2">
        ${moneyField('interesPagado', 'Paga de interés', interesSug)}
        ${moneyField('abonoCapital', 'Abono a capital', '')}
      </div>
      <h3 style="font-size:13px;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin:4px 0 12px">Nuevas condiciones</h3>
      ${condicionesHtml(v0, { conCapital: false, labelFecha: 'Fecha del pago' })}
      <div class="summary" data-res></div>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar y recalcular</button>`,
    onMount(el, api) {
      const q = (n) => $(`[name=${n}]`, el);
      const pago = () => parseMoney(q('interesPagado').value) + parseMoney(q('abonoCapital').value);
      const nuevoCap = () => c.saldo - pago();
      const res = $('[data-res]', el);
      const cond = bindCondiciones(el, {
        getCapital: () => Math.max(0, nuevoCap()),
        onChange: (x) => {
          const nc = nuevoCap();
          res.innerHTML = nc <= 0
            ? `<div class="r" style="color:var(--warn)"><span>Con ese pago queda a paz y salvo. Usa “Cobrar”.</span></div>`
            : `<div class="r"><span>Paga hoy</span><b style="color:var(--ok)">${money(pago())}</b></div>
               <div class="r"><span>Nuevo capital</span><b>${money(nc)}</b></div>${resumenCondiciones(x, nc).replace(/<div class="r"><span>Capital<\/span>.*?<\/div>/, '')}`;
        },
      });
      ['interesPagado', 'abonoCapital'].forEach((n) => q(n).addEventListener('input', cond.recalc));
      cond.recalc();
      $('[data-ok]', el).onclick = async () => {
        const x = cond.read();
        const nc = nuevoCap();
        if (pago() < 0) return toast('Revisa los valores', 'err');
        if (nc <= 0) return toast('Con ese pago queda a paz y salvo: usa “Cobrar”', 'err');
        if (!(x.valorCuota > 0)) return toast('Revisa el valor de la cuota', 'err');
        addMov(p, {
          tipo: 'renovacion',
          fecha: x.fecha,
          valor: pago(),
          interesPagado: parseMoney(q('interesPagado').value),
          abonoCapital: parseMoney(q('abonoCapital').value),
          ciclo: { tasa: x.tasa, nCuotas: x.nCuotas, valorCuota: x.valorCuota, modalidad: x.modalidad, cobraDomingos: x.cobraDomingos },
        });
        await app.save();
        api.close();
        toast(`Nuevo capital ${money(nc)} · cuotas recalculadas`);
        refreshLuego(app);
      };
    },
  });
}

export function abrirEditar(app, p) {
  const c = calcular(p, today(), cfg());
  const ref = c.ciclo.ref; // movimiento de renovación si el ciclo actual viene de una
  const v = ref
    ? { fecha: ref.fecha, ...ref.ciclo }
    : { fecha: p.fecha, capital: p.capital, modalidad: p.modalidad, tasa: p.tasa, nCuotas: p.nCuotas, valorCuota: p.valorCuota, cobraDomingos: p.cobraDomingos !== false };
  sheet({
    title: ref ? 'Editar ciclo actual' : 'Editar préstamo',
    ico: 'edit',
    tone: 'tone-info',
    body: `${ref ? `<p class="small muted" style="margin-top:-6px">Este préstamo fue renovado el ${fdate(ref.fecha)}. Aquí cambias las condiciones del ciclo actual (capital ${money(c.ciclo.capital)}).</p>` : ''}
      ${condicionesHtml(v, { conCapital: !ref, labelFecha: ref ? 'Fecha de la renovación' : 'Fecha del préstamo' })}
      ${!ref ? field('Notas', `<textarea name="notas">${esc(p.notas || '')}</textarea>`) : ''}
      ${!ref ? `<div class="field"><label>Cliente</label><select name="cliente" class="input">${[...store.state.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((x) => `<option value="${x.id}" ${x.id === p.clienteId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>` : ''}
      <div class="summary" data-res></div>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar cambios</button>`,
    onMount(el, api) {
      const res = $('[data-res]', el);
      const cond = bindCondiciones(el, { getCapital: () => c.ciclo.capital, onChange: (x) => (res.innerHTML = resumenCondiciones(x)) });
      cond.setManual(true); // respeta la cuota guardada; si cambian datos, el usuario la ajusta o la borra
      el.querySelector('[name=valorCuota]').insertAdjacentHTML('afterend', '<button type="button" class="btn ghost sm" data-auto style="justify-self:start;padding-left:0">Recalcular cuota automáticamente</button>');
      $('[data-auto]', el).onclick = () => { cond.setManual(false); cond.recalc(); };
      cond.recalc();
      $('[data-ok]', el).onclick = async () => {
        const x = cond.read();
        if (!(x.valorCuota > 0)) return toast('Revisa el valor de la cuota', 'err');
        if (ref) {
          ref.fecha = x.fecha;
          ref.ciclo = { tasa: x.tasa, nCuotas: x.nCuotas, valorCuota: x.valorCuota, modalidad: x.modalidad, cobraDomingos: x.cobraDomingos };
        } else {
          if (!(x.capital > 0)) return toast('Escribe el capital', 'err');
          Object.assign(p, x, { notas: $('[name=notas]', el).value.trim(), clienteId: $('[name=cliente]', el).value || p.clienteId });
        }
        await app.save();
        api.close();
        toast('Cambios guardados');
        refreshLuego(app);
      };
    },
  });
}

function abrirAjuste(app, p) {
  const c = calcular(p, today(), cfg());
  sheet({
    title: 'Ajuste manual',
    ico: 'sliders',
    tone: 'tone-info',
    body: `<p class="small muted" style="margin-top:-6px">Para corregir el saldo (descuentos, cargos acordados, errores). Queda anotado.</p>
      <div class="field"><span class="lbl">Tipo</span>${segHtml('tipo', ['Restar al saldo', 'Sumar al saldo'], 'Restar al saldo')}</div>
      ${moneyField('valor', 'Valor')}
      ${field('Fecha', `<input type="date" name="fecha" value="${today()}">`)}
      ${field('Motivo (obligatorio)', '<input name="nota" placeholder="Ej: descuento por pronto pago">')}
      <div class="summary"><div class="r"><span>Saldo actual</span><b>${money(c.saldo)}</b></div></div>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar ajuste</button>`,
    onMount(el, api) {
      $('[data-ok]', el).onclick = async () => {
        const v = parseMoney($('[name=valor]', el).value);
        const nota = $('[name=nota]', el).value.trim();
        if (!(v > 0)) return toast('Escribe el valor', 'err');
        if (!nota) return toast('Escribe el motivo del ajuste', 'err');
        const signo = segValue(el, 'tipo').startsWith('Sumar') ? 1 : -1;
        addMov(p, { tipo: 'ajuste', fecha: $('[name=fecha]', el).value || today(), valor: signo * v, nota });
        await app.save();
        api.close();
        toast('Ajuste guardado');
        refreshLuego(app);
      };
    },
  });
}

function abrirMovimiento(app, p, m) {
  const nombres = { pago: 'Abono', interes: 'Interés adicional', interes_omitido: 'Interés no aplicado', ajuste: 'Ajuste', renovacion: 'Interés + abono a capital' };
  const editable = m.tipo === 'pago' || m.tipo === 'interes' || m.tipo === 'ajuste';
  sheet({
    title: nombres[m.tipo] || 'Movimiento',
    ico: 'edit',
    tone: 'tone-info',
    body: `${editable
      ? `${field('Fecha', `<input type="date" name="fecha" value="${m.fecha}">`)}
         ${moneyField('valor', m.tipo === 'ajuste' ? `Valor (${m.valor >= 0 ? 'suma' : 'resta'})` : 'Valor', Math.abs(m.valor))}
         ${field('Nota', `<input name="nota" value="${esc(m.nota || '')}">`)}
         <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar cambios</button><div style="height:10px"></div>`
      : `<div class="summary"><div class="r"><span>Fecha</span><b>${fdate(m.fecha)}</b></div>
          ${m.valor ? `<div class="r"><span>Pagó</span><b>${money(m.valor)}</b></div>` : ''}
          ${m.tipo === 'renovacion' ? `<div class="r"><span>Interés / abono</span><b>${money(m.interesPagado || 0)} / ${money(m.abonoCapital || 0)}</b></div>` : ''}
          ${m.nota ? `<div class="r"><span>Nota</span><b>${esc(m.nota)}</b></div>` : ''}</div>
          <p class="small muted">${m.tipo === 'renovacion' ? 'Para cambiar las condiciones del ciclo usa “Editar”. Si lo eliminas, el préstamo vuelve a las condiciones anteriores.' : 'Si lo eliminas, la app volverá a avisarte de este interés.'}</p>`}
      <button class="btn danger block" data-del>${icon('trash', 'sm')} Eliminar movimiento</button>`,
    onMount(el, api) {
      $('[data-ok]', el)?.addEventListener('click', async () => {
        const v = parseMoney($('[name=valor]', el).value);
        if (!(v > 0)) return toast('Escribe el valor', 'err');
        m.fecha = $('[name=fecha]', el).value || m.fecha;
        m.valor = m.tipo === 'ajuste' && m.valor < 0 ? -v : v;
        m.nota = $('[name=nota]', el).value.trim();
        await app.save();
        api.close();
        toast('Movimiento actualizado');
        refreshLuego(app);
      });
      $('[data-del]', el).onclick = async () => {
        if (!(await confirmDialog({ title: '¿Eliminar movimiento?', text: 'El saldo se recalculará.', ok: 'Eliminar', danger: true }))) return;
        p.movs = p.movs.filter((x) => x.id !== m.id);
        await app.save();
        api.close();
        toast('Movimiento eliminado');
        refreshLuego(app);
      };
    },
  });
}

function abrirMas(app, p, c) {
  sheet({
    title: `Préstamo #${p.id}`,
    ico: 'wallet',
    body: `<div class="list menu">
      <button class="item" data-o="ajuste"><span class="ico tone-info">${icon('sliders')}</span><span class="grow t">Ajuste manual del saldo</span>${icon('next', 'sm')}</button>
      <button class="item" data-o="anular"><span class="ico tone-warn">${icon('ban')}</span><span class="grow t">${p.estado === 'anulado' ? 'Reactivar préstamo' : 'Anular préstamo'}</span>${icon('next', 'sm')}</button>
      <button class="item" data-o="eliminar"><span class="ico tone-danger">${icon('trash')}</span><span class="grow t">Eliminar préstamo</span>${icon('next', 'sm')}</button>
    </div>`,
    onMount(el, api) {
      $('.menu', el).onclick = async (e) => {
        const b = e.target.closest('[data-o]');
        if (!b) return;
        if (b.dataset.o === 'ajuste') {
          api.close();
          afterLayers(() => abrirAjuste(app, p));
        } else if (b.dataset.o === 'anular') {
          const anular = p.estado !== 'anulado';
          if (anular && !(await confirmDialog({ title: 'Anular préstamo', text: 'Dejará de contar en la cartera y en las ganancias. Puedes reactivarlo después.', ok: 'Anular', danger: true }))) return;
          p.estado = anular ? 'anulado' : 'activo';
          await app.save();
          api.close();
          toast(anular ? 'Préstamo anulado' : 'Préstamo reactivado');
          refreshLuego(app);
        } else if (b.dataset.o === 'eliminar') {
          if (!(await confirmDialog({ title: '¿Eliminar préstamo?', text: `Se borrará el préstamo #${p.id} con sus ${p.movs.length} movimientos. <b>No se puede deshacer.</b>`, ok: 'Eliminar', danger: true }))) return;
          store.state.prestamos = store.state.prestamos.filter((x) => x !== p);
          await app.save();
          api.close();
          toast('Préstamo eliminado');
          app.go('#/prestamos');
        }
      };
    },
  });
}

// ---- Tarjeta ----
function datosTarjeta(p) {
  return { negocio: cfg().negocio, cliente: getCliente(p.clienteId), calc: calcular(p, today(), cfg()) };
}
export async function enviarTarjeta(p) {
  const d = datosTarjeta(p);
  const r = await shareCardImage(drawCard(d), d.cliente);
  if (r === 'descarga') toast('Imagen descargada. Envíala por WhatsApp desde tu galería.');
}
export async function enviarTexto(p) {
  const d = datosTarjeta(p);
  const texto = textoEstadoCuenta(d);
  if (d.cliente?.telefono) return openWhatsApp(d.cliente.telefono, texto, cfg().indicativo);
  if (navigator.share) {
    try { await navigator.share({ text: texto }); return; } catch { /* cancelado */ }
  }
  try {
    await navigator.clipboard.writeText(texto);
    toast('El cliente no tiene teléfono. Texto copiado.');
  } catch {
    toast('El cliente no tiene teléfono registrado', 'err');
  }
}
export function mostrarTarjeta(p) {
  const url = drawCard(datosTarjeta(p)).toDataURL('image/png');
  fullscreen(`<img src="${url}" alt="Tarjeta del cliente">`);
}
