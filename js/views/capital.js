// Capital de los socios: aportes, retiros y saldo de base de cada uno.
import { icon } from '../icons.js';
import { $, esc, money, num, fdate, today, uid, parseMoney, avatarTone, initials } from '../utils.js';
import { resumenGeneral, movsSocio, saldoSocio, saldoDeudaSocio, movsDeudaSocio } from '../logic.js';
import { sheet, toast, field, moneyField, confirmDialog, emptyState, afterLayers, segHtml, segValue } from '../ui.js';
import * as store from '../store.js';

/** Texto corto del % de ganancia de un socio. */
export function textoPct(so) {
  if (so.pctGanancia === undefined || so.pctGanancia === null) return 'sin % de ganancia asignado';
  if (!(so.pctGanancia > 0)) return 'dinero guardado, sin ganancia';
  return `${String(so.pctGanancia).replace('.', ',')} % de la ganancia`;
}

export function lista(app) {
  const s = app.state;
  const r = resumenGeneral(s, today());
  const main = app.shell({
    title: 'Capital y socios',
    back: '#/mas',
    tab: 'mas',
    fab: { label: 'Nuevo socio', icon: 'userPlus', onClick: () => abrirSocio(app) },
  });
  main.innerHTML = `
    <div class="hero">
      <div class="label">Capital base de los socios</div>
      <div class="big num">${money(r.capitalBase)}</div>
      <div class="split">
        <div><span>En la calle</span><b class="num">${money(r.enCalle)}</b><span>capital prestado</span></div>
        <div><span>Disponible (caja)</span><b class="num">${money(r.disponible)}</b><span>base + ganancia − calle − gastos − socios</span></div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="ico tone-ok">${icon('trending', 'sm')}</div><div class="v num">${money(r.gananciaCobrada)}</div><div class="l">Ganancia cobrada</div></div>
      <div class="kpi"><div class="ico tone-violet">${icon('coins', 'sm')}</div><div class="v num">${money(r.capitalBase + r.gananciaCobrada)}</div><div class="l">Capital + ganancias</div></div>
      ${r.deudaSocios ? `<div class="kpi" style="grid-column:1/-1"><div class="ico tone-warn">${icon('user', 'sm')}</div><div class="v num">${money(r.deudaSocios)}</div><div class="l">Le deben los socios (préstamos sin interés)</div></div>` : ''}
    </div>
    <a class="btn primary block" href="#/informe" style="margin-bottom:14px">${icon('file', 'sm')} Informe del mes para socios</a>
    <div class="section-title">Socios <span class="muted">${s.socios.length}</span></div>
    ${s.socios.length ? `<div class="list">${s.socios.map((so) => {
      const n = (so.movs || []).length;
      const debe = saldoDeudaSocio(so);
      return `<div class="item" data-href="#/socio/${so.id}"><div class="avatar ${avatarTone(so.nombre)}">${esc(initials(so.nombre))}</div>
        <div class="grow"><div class="t ellipsis">${esc(so.nombre)}</div><div class="s">${esc(textoPct(so))} · ${n} movimiento${n === 1 ? '' : 's'}</div>
          ${debe > 0 ? `<div class="s" style="color:var(--warn);font-weight:650">Debe ${money(debe)}</div>` : ''}</div>
        <div class="end"><span class="amt num">${money(saldoSocio(so))}</span>${r.capitalBase > 0 ? `<span class="small muted">${Math.round((saldoSocio(so) / r.capitalBase) * 100)}% del capital</span>` : ''}</div></div>`;
    }).join('')}</div>` : emptyState('bank', 'Sin socios registrados', 'Agrega a cada socio con su aporte de capital.')}
    <p class="tiny muted" style="margin:6px 4px">El <b>disponible</b> (la caja) es el capital de los socios más la ganancia ya cobrada, menos el capital que está prestado a clientes, los gastos y retiros${r.gastos + r.retiros ? ` (${money(r.gastos + r.retiros)})` : ''} y lo que le deben los socios${r.deudaSocios ? ` (${money(r.deudaSocios)})` : ''}.</p>`;
  main.addEventListener('click', (e) => {
    const it = e.target.closest('[data-href]');
    if (it) app.go(it.dataset.href);
  });
}

export function socio(app, id) {
  const so = store.getSocio(id);
  if (!so) {
    const main = app.shell({ title: 'Socio', back: '#/capital', tab: 'mas' });
    main.innerHTML = emptyState('user', 'Socio no encontrado');
    return;
  }
  const movs = movsSocio(so);
  const saldo = saldoSocio(so);
  const aportes = movs.filter((m) => m.tipo === 'aporte').reduce((a, m) => a + m.valor, 0);
  const retiros = movs.filter((m) => m.tipo === 'retiro').reduce((a, m) => a + m.valor, 0);
  const deuda = saldoDeudaSocio(so);
  const movsDeuda = movsDeudaSocio(so).reverse(); // lo más reciente arriba
  const main = app.shell({
    title: so.nombre,
    back: '#/capital',
    tab: 'mas',
    actions: `<button class="icon-btn" data-edit aria-label="Editar">${icon('edit')}</button>`,
  });
  main.innerHTML = `
    <div class="hero">
      <div class="label">Saldo de base · ${esc(textoPct(so))}</div>
      <div class="big num">${money(saldo)}</div>
      <div class="split">
        <div><span>Aportes</span><b class="num">${money(aportes)}</b></div>
        <div><span>Retiros</span><b class="num">${money(retiros)}</b></div>
      </div>
    </div>
    <div class="btn-row" style="margin-bottom:14px">
      <button class="btn" data-mov="retiro">${icon('arrowOut', 'sm')} Retiro</button>
      <button class="btn primary" data-mov="aporte">${icon('arrowIn', 'sm')} Aporte</button>
    </div>
    ${movs.length ? `<div class="card" style="padding:6px 12px"><table class="ledger"><thead><tr><th>Fecha</th><th>Valor</th><th>Saldo</th></tr></thead><tbody>
      ${movs.map((m) => `<tr class="tap" data-id="${m.id}"><td>${fdate(m.fecha)}<span class="note">${m.tipo === 'retiro' ? 'Retiro' : 'Aporte'}${m.nota ? ' · ' + esc(m.nota) : ''}</span></td>
        <td><span class="${m.tipo === 'retiro' ? 'cargo' : 'abono'}">${m.tipo === 'retiro' ? '−' : '+'}${num(m.valor)}</span></td><td class="resta">${num(m.saldo)}</td></tr>`).join('')}
    </tbody></table></div>` : emptyState('bank', 'Sin movimientos', 'Registra el aporte de este socio.')}

    <div class="section-title">Deuda con el negocio <span class="muted">sin interés</span></div>
    <div class="card">
      <div class="row between"><span class="muted">Debe hoy</span><b class="num" style="font-size:24px;color:${deuda > 0 ? 'var(--warn)' : 'var(--ok)'}">${money(deuda)}</b></div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn" data-deuda="prestamo">${icon('arrowOut', 'sm')} Prestarle</button>
        <button class="btn primary" data-deuda="abono" ${deuda > 0 ? '' : 'disabled'}>${icon('arrowIn', 'sm')} Recibir abono</button>
      </div>
      ${movsDeuda.length ? `<table class="ledger" style="margin-top:12px"><thead><tr><th>Fecha</th><th>Valor</th><th>Debe</th></tr></thead><tbody>
        ${movsDeuda.map((d) => `<tr class="tap" data-deuda-id="${d.id}"><td>${fdate(d.fecha)}<span class="note">${d.tipo === 'prestamo' ? 'Préstamo' : `Abono · ${esc(ORIGEN_CORTO[d.origen] || '')}`}${d.nota ? ' · ' + esc(d.nota) : ''}</span></td>
          <td><span class="${d.tipo === 'prestamo' ? 'cargo' : 'abono'}">${d.tipo === 'prestamo' ? '+' : '−'}${num(d.valor)}</span></td><td class="resta">${num(d.saldo)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="small muted" style="margin:10px 0 0">Cuando le prestes dinero sin interés, regístralo aquí: sale de la caja y queda como deuda del socio.</p>'}
    </div>
    ${so.notas ? `<div class="card"><h3>Notas</h3><p style="margin:0;white-space:pre-wrap">${esc(so.notas)}</p></div>` : ''}
    <button class="btn danger block" data-del>${icon('trash', 'sm')} Eliminar socio</button>`;
  main.parentElement.querySelector('[data-edit]').onclick = () => abrirSocio(app, so);
  main.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mov]');
    if (b) return abrirMovSocio(app, so, b.dataset.mov);
    const bd = e.target.closest('[data-deuda]');
    if (bd && !bd.disabled) return bd.dataset.deuda === 'prestamo' ? abrirPrestamoSocio(app, so) : abrirAbonoSocio(app, so);
    const trd = e.target.closest('[data-deuda-id]');
    if (trd) {
      const d = (so.deudas || []).find((x) => x.id === trd.dataset.deudaId);
      if (d) return d.tipo === 'prestamo' ? abrirPrestamoSocio(app, so, d) : abrirAbonoSocio(app, so, d);
    }
    const tr = e.target.closest('[data-id]');
    if (tr) return abrirMovSocio(app, so, null, so.movs.find((m) => m.id === tr.dataset.id));
    if (e.target.closest('[data-del]')) {
      if (!(await confirmDialog({ title: '¿Eliminar socio?', text: `Se borrará ${esc(so.nombre)} con todos sus movimientos de capital${deuda > 0 ? ` y su deuda de ${money(deuda)}` : ''}.`, ok: 'Eliminar', danger: true }))) return;
      app.state.gastos = (app.state.gastos || []).filter((g) => !(g.deudaId && g.socioId === so.id));
      app.state.socios = app.state.socios.filter((x) => x !== so);
      await app.save();
      toast('Socio eliminado');
      app.go('#/capital');
    }
  });
}

function abrirSocio(app, so = null) {
  sheet({
    title: so ? 'Editar socio' : 'Nuevo socio',
    ico: 'bank',
    tone: 'tone-violet',
    body: `${field('Nombre', `<input name="nombre" value="${esc(so?.nombre || '')}" autocapitalize="words">`)}
      ${so ? '' : `${moneyField('aporte', 'Aporte inicial')}${field('Fecha del aporte', `<input type="date" name="fecha" value="${today()}">`)}`}
      ${field('% de la ganancia que le corresponde', `<input name="pct" inputmode="decimal" value="${so?.pctGanancia ?? ''}" placeholder="Ej: 50">`, 'Pon 0 si solo dejó dinero guardado, sin derecho a ganancia. Entre todos los socios deben sumar 100 %.')}
      ${field('Notas', `<textarea name="notas">${esc(so?.notas || '')}</textarea>`)}
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>`,
    onMount(el, api) {
      $('[data-ok]', el).onclick = async () => {
        const nombre = $('[name=nombre]', el).value.trim();
        if (!nombre) return toast('Escribe el nombre', 'err');
        const notas = $('[name=notas]', el).value.trim();
        const pctTxt = $('[name=pct]', el).value.trim().replace(',', '.');
        const pctGanancia = pctTxt === '' ? undefined : Number(pctTxt);
        if (pctGanancia !== undefined && !(pctGanancia >= 0 && pctGanancia <= 100)) return toast('El % debe estar entre 0 y 100', 'err');
        let target = so;
        if (so) Object.assign(so, { nombre, notas, pctGanancia });
        else {
          target = { id: uid(), nombre, notas, pctGanancia, movs: [] };
          const v = parseMoney($('[name=aporte]', el).value);
          if (v > 0) target.movs.push({ id: uid(), ts: Date.now(), tipo: 'aporte', fecha: $('[name=fecha]', el).value || today(), valor: v, nota: 'Aporte inicial' });
          app.state.socios.push(target);
        }
        await app.save();
        api.close();
        toast(so ? 'Socio actualizado' : 'Socio agregado');
        afterLayers(() => (so ? app.refresh() : app.go(`#/socio/${target.id}`)));
      };
    },
  });
}

// ---- Deuda del socio con el negocio (préstamos sin interés) ----
const ORIGEN_CORTO = { caja: 'en efectivo', aporte: 'de su aporte', ganancia: 'de su ganancia' };
const ORIGEN_SEG = { 'Efectivo': 'caja', 'De su aporte': 'aporte', 'De su ganancia': 'ganancia' };
const SEG_ORIGEN = { caja: 'Efectivo', aporte: 'De su aporte', ganancia: 'De su ganancia' };

/** Quita el retiro (de capital o de ganancia) que creó un abono. */
function quitarEnlace(app, so, d) {
  if (d.origen === 'aporte') so.movs = (so.movs || []).filter((m) => m.deudaId !== d.id);
  if (d.origen === 'ganancia') app.state.gastos = (app.state.gastos || []).filter((g) => g.deudaId !== d.id);
}

function abrirPrestamoSocio(app, so, d = null) {
  const r = resumenGeneral(app.state, today());
  const cajaSin = r.disponible + (d ? d.valor : 0);
  sheet({
    title: d ? 'Editar préstamo al socio' : `Prestarle a ${so.nombre}`,
    ico: 'arrowOut',
    tone: 'tone-warn',
    body: `<p class="small muted" style="margin-top:-6px">Sin interés. Sale de la caja y queda como deuda de ${esc(so.nombre)}.</p>
      ${moneyField('valor', 'Valor que se le presta', d?.valor || '')}
      ${field('Fecha', `<input type="date" name="fecha" value="${d?.fecha || today()}">`)}
      ${field('Para qué (opcional)', `<input name="nota" value="${esc(d?.nota || '')}" placeholder="Ej: medicamentos, pasaje…">`)}
      <div class="summary" data-res></div>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar préstamo</button>
      ${d ? `<div style="height:10px"></div><button class="btn danger block" data-del>${icon('trash', 'sm')} Eliminar</button>` : ''}`,
    onMount(el, api) {
      const inp = $('[name=valor]', el);
      const deudaSin = saldoDeudaSocio(so) - (d ? d.valor : 0);
      const upd = () => {
        const v = parseMoney(inp.value);
        $('[data-res]', el).innerHTML = `<div class="r"><span>Caja disponible</span><b>${money(cajaSin)}</b></div>
          <div class="r"><span>Sale de la caja</span><b style="color:var(--danger)">− ${money(v)}</b></div>
          <div class="r total"><span>Queda en caja</span><b style="color:${cajaSin - v < 0 ? 'var(--danger)' : 'inherit'}">${money(cajaSin - v)}</b></div>
          <div class="r"><span>Deuda de ${esc(so.nombre)}</span><b style="color:var(--warn)">${money(deudaSin + v)}</b></div>`;
      };
      inp.addEventListener('input', upd);
      upd();
      $('[data-ok]', el).onclick = async () => {
        const v = parseMoney(inp.value);
        if (!(v > 0)) return toast('Escribe el valor', 'err');
        const datos = { tipo: 'prestamo', valor: v, fecha: $('[name=fecha]', el).value || today(), nota: $('[name=nota]', el).value.trim() };
        if (d) Object.assign(d, datos);
        else (so.deudas ||= []).push({ id: uid(), ts: Date.now(), ...datos });
        await app.save();
        api.close();
        toast(`Préstamo a ${so.nombre} registrado`);
        afterLayers(() => app.refresh());
      };
      $('[data-del]', el)?.addEventListener('click', async () => {
        if (saldoDeudaSocio(so) - d.valor < 0) return toast('Primero elimina los abonos que lo pagaron', 'err');
        if (!(await confirmDialog({ title: '¿Eliminar préstamo?', text: 'Se borra de su deuda y el dinero vuelve a contar en la caja.', ok: 'Eliminar', danger: true }))) return;
        so.deudas = so.deudas.filter((x) => x !== d);
        await app.save();
        api.close();
        toast('Préstamo eliminado');
        afterLayers(() => app.refresh());
      });
    },
  });
}

function abrirAbonoSocio(app, so, d = null) {
  const deudaSin = saldoDeudaSocio(so) + (d ? d.valor : 0); // lo que debe sin contar este abono
  const aporteSin = saldoSocio(so) + (d?.origen === 'aporte' ? d.valor : 0);
  const repartoActivo = Number(so.pctGanancia) > 0;
  sheet({
    title: d ? 'Editar abono del socio' : `Abono de ${so.nombre}`,
    ico: 'arrowIn',
    tone: 'tone-ok',
    body: `<p class="small muted" style="margin-top:-6px">Debe <b>${money(deudaSin)}</b> · aporte de capital <b>${money(aporteSin)}</b></p>
      ${moneyField('valor', 'Valor del abono', d?.valor || deudaSin)}
      <div class="quick-amts"><button type="button" data-v="${deudaSin}">Todo ${money(deudaSin)}</button></div>
      ${field('Fecha', `<input type="date" name="fecha" value="${d?.fecha || today()}">`)}
      <div class="field"><span class="lbl">¿De dónde sale el abono?</span>${segHtml('origen', ['Efectivo', 'De su aporte', 'De su ganancia'], SEG_ORIGEN[d?.origen || 'caja'])}</div>
      <p class="small" data-explica style="margin:-6px 0 14px"></p>
      ${field('Nota (opcional)', `<input name="nota" value="${esc(d?.nota || '')}">`)}
      <div class="summary" data-res></div>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar abono</button>
      ${d ? `<div style="height:10px"></div><button class="btn danger block" data-del>${icon('trash', 'sm')} Eliminar</button>` : ''}`,
    onMount(el, api) {
      const inp = $('[name=valor]', el);
      const origen = () => ORIGEN_SEG[segValue(el, 'origen')] || 'caja';
      const upd = () => {
        const v = parseMoney(inp.value);
        const o = origen();
        $('[data-explica]', el).innerHTML = {
          caja: 'El socio entrega el dinero: <b>entra a la caja</b> y baja su deuda.',
          aporte: `Se le <b>resta de su capital</b> (aporte). La caja no cambia: ese dinero ya había salido cuando se le prestó.${v > aporteSin ? ' <b style="color:var(--danger)">No le alcanza el aporte.</b>' : ''}`,
          ganancia: `Se registra como <b>retiro de su ganancia</b>: en el informe del mes se le resta de lo que le toca. La caja no cambia.${repartoActivo ? '' : ' <b style="color:var(--warn)">Este socio no tiene % de ganancia.</b>'}`,
        }[o];
        $('[data-res]', el).innerHTML = `<div class="r"><span>Debe</span><b>${money(deudaSin)}</b></div>
          <div class="r"><span>Abono</span><b style="color:var(--ok)">− ${money(v)}</b></div>
          <div class="r total"><span>${deudaSin - v <= 0 ? '¡Queda a paz y salvo!' : 'Queda debiendo'}</span><b>${money(Math.max(0, deudaSin - v))}</b></div>
          ${o === 'caja' ? `<div class="r"><span>Entra a la caja</span><b style="color:var(--ok)">+ ${money(v)}</b></div>` : ''}
          ${o === 'aporte' ? `<div class="r"><span>Su aporte queda en</span><b>${money(aporteSin - v)}</b></div>` : ''}`;
      };
      inp.addEventListener('input', upd);
      $('[data-seg=origen]', el).addEventListener('change', upd);
      $('.quick-amts', el).onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { inp.value = num(+b.dataset.v); upd(); } };
      upd();
      $('[data-ok]', el).onclick = async () => {
        const v = parseMoney(inp.value);
        const o = origen();
        if (!(v > 0)) return toast('Escribe el valor del abono', 'err');
        if (v > deudaSin) return toast(`El abono supera lo que debe (${money(deudaSin)})`, 'err');
        if (o === 'aporte' && v > aporteSin) return toast(`Su aporte (${money(aporteSin)}) no alcanza para este abono`, 'err');
        const fecha = $('[name=fecha]', el).value || today();
        const nota = $('[name=nota]', el).value.trim();
        let ab = d;
        if (ab) { quitarEnlace(app, so, ab); Object.assign(ab, { valor: v, fecha, nota, origen: o }); delete ab.enlace; }
        else { ab = { id: uid(), ts: Date.now(), tipo: 'abono', valor: v, fecha, nota, origen: o }; (so.deudas ||= []).push(ab); }
        if (o === 'aporte') {
          const m = { id: uid(), ts: Date.now(), tipo: 'retiro', fecha, valor: v, nota: 'Abono a su deuda con el negocio', deudaId: ab.id };
          (so.movs ||= []).push(m);
          ab.enlace = m.id;
        } else if (o === 'ganancia') {
          const g = { id: uid(), ts: Date.now(), fecha, tipo: 'retiro', categoria: '', valor: v, nota: 'Abono a su deuda con el negocio', socioId: so.id, deudaId: ab.id };
          (app.state.gastos ||= []).push(g);
          ab.enlace = g.id;
        }
        await app.save();
        api.close();
        toast(`Abono de ${money(v)} registrado`);
        afterLayers(() => app.refresh());
      };
      $('[data-del]', el)?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '¿Eliminar abono?', text: `Vuelve a su deuda${d.origen === 'aporte' ? ' y se le devuelve al aporte' : d.origen === 'ganancia' ? ' y se borra el retiro de ganancia' : ' y sale de la caja'}.`, ok: 'Eliminar', danger: true }))) return;
        quitarEnlace(app, so, d);
        so.deudas = so.deudas.filter((x) => x !== d);
        await app.save();
        api.close();
        toast('Abono eliminado');
        afterLayers(() => app.refresh());
      });
    },
  });
}

function abrirMovSocio(app, so, tipo, mov = null) {
  if (mov?.deudaId) {
    const d = (so.deudas || []).find((x) => x.id === mov.deudaId);
    if (d) return abrirAbonoSocio(app, so, d);
  }
  tipo = mov?.tipo || tipo;
  const saldoSin = saldoSocio(so) - (mov ? (mov.tipo === 'retiro' ? -mov.valor : mov.valor) : 0);
  sheet({
    title: `${mov ? 'Editar ' : ''}${tipo === 'retiro' ? 'retiro' : 'aporte'}`.replace(/^./, (c) => c.toUpperCase()),
    ico: tipo === 'retiro' ? 'arrowOut' : 'arrowIn',
    tone: tipo === 'retiro' ? 'tone-warn' : 'tone-ok',
    body: `<p class="small muted" style="margin-top:-6px">${esc(so.nombre)} · saldo de base ${money(saldoSocio(so))}</p>
      ${moneyField('valor', tipo === 'retiro' ? 'Valor que retira' : 'Valor que aporta', mov?.valor || '')}
      ${field('Fecha', `<input type="date" name="fecha" value="${mov?.fecha || today()}">`)}
      ${field('Nota', `<input name="nota" value="${esc(mov?.nota || '')}" placeholder="Opcional">`)}
      <div class="summary" data-res></div>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>
      ${mov ? `<div style="height:10px"></div><button class="btn danger block" data-del>${icon('trash', 'sm')} Eliminar</button>` : ''}`,
    onMount(el, api) {
      const inp = $('[name=valor]', el);
      const upd = () => {
        const v = parseMoney(inp.value);
        const nuevo = saldoSin + (tipo === 'retiro' ? -v : v);
        $('[data-res]', el).innerHTML = `<div class="r total"><span>Nuevo saldo de base</span><b style="color:${nuevo < 0 ? 'var(--danger)' : 'inherit'}">${money(nuevo)}</b></div>`;
      };
      inp.addEventListener('input', upd);
      upd();
      $('[data-ok]', el).onclick = async () => {
        const v = parseMoney(inp.value);
        if (!(v > 0)) return toast('Escribe el valor', 'err');
        if (tipo === 'retiro' && v > saldoSin) return toast('El retiro supera el saldo de base del socio', 'err');
        const datos = { tipo, valor: v, fecha: $('[name=fecha]', el).value || today(), nota: $('[name=nota]', el).value.trim() };
        if (mov) Object.assign(mov, datos);
        else (so.movs ||= []).push({ id: uid(), ts: Date.now(), ...datos });
        await app.save();
        api.close();
        toast(tipo === 'retiro' ? 'Retiro registrado' : 'Aporte registrado');
        afterLayers(() => app.refresh());
      };
      $('[data-del]', el)?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '¿Eliminar movimiento?', ok: 'Eliminar', danger: true }))) return;
        so.movs = so.movs.filter((m) => m !== mov);
        await app.save();
        api.close();
        toast('Movimiento eliminado');
        afterLayers(() => app.refresh());
      });
    },
  });
}
