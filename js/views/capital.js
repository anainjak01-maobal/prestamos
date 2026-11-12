// Capital de los socios: aportes, retiros y saldo de base de cada uno.
import { icon } from '../icons.js';
import { $, esc, money, num, fdate, today, uid, parseMoney, avatarTone, initials } from '../utils.js';
import { resumenGeneral, movsSocio, saldoSocio } from '../logic.js';
import { sheet, toast, field, moneyField, confirmDialog, emptyState, afterLayers } from '../ui.js';
import * as store from '../store.js';

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
        <div><span>Disponible</span><b class="num">${money(r.disponible)}</b><span>base + ganancia − calle − gastos</span></div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="ico tone-ok">${icon('trending', 'sm')}</div><div class="v num">${money(r.gananciaCobrada)}</div><div class="l">Ganancia cobrada</div></div>
      <div class="kpi"><div class="ico tone-violet">${icon('coins', 'sm')}</div><div class="v num">${money(r.capitalBase + r.gananciaCobrada)}</div><div class="l">Capital + ganancias</div></div>
    </div>
    <a class="btn primary block" href="#/informe" style="margin-bottom:14px">${icon('file', 'sm')} Informe del mes para socios</a>
    <div class="section-title">Socios <span class="muted">${s.socios.length}</span></div>
    ${s.socios.length ? `<div class="list">${s.socios.map((so) => {
      const n = (so.movs || []).length;
      return `<div class="item" data-href="#/socio/${so.id}"><div class="avatar ${avatarTone(so.nombre)}">${esc(initials(so.nombre))}</div>
        <div class="grow"><div class="t ellipsis">${esc(so.nombre)}</div><div class="s">${n} movimiento${n === 1 ? '' : 's'}</div></div>
        <div class="end"><span class="amt num">${money(saldoSocio(so))}</span>${r.capitalBase > 0 ? `<span class="small muted">${Math.round((saldoSocio(so) / r.capitalBase) * 100)}%</span>` : ''}</div></div>`;
    }).join('')}</div>` : emptyState('bank', 'Sin socios registrados', 'Agrega a cada socio con su aporte de capital.')}
    <p class="tiny muted" style="margin:6px 4px">El <b>disponible</b> es el capital de los socios más la ganancia ya cobrada, menos el capital que está prestado y menos los gastos y retiros${r.gastos + r.retiros ? ` (${money(r.gastos + r.retiros)})` : ''}.</p>`;
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
  const main = app.shell({
    title: so.nombre,
    back: '#/capital',
    tab: 'mas',
    actions: `<button class="icon-btn" data-edit aria-label="Editar">${icon('edit')}</button>`,
  });
  main.innerHTML = `
    <div class="hero">
      <div class="label">Saldo de base</div>
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
    ${so.notas ? `<div class="card"><h3>Notas</h3><p style="margin:0;white-space:pre-wrap">${esc(so.notas)}</p></div>` : ''}
    <button class="btn danger block" data-del>${icon('trash', 'sm')} Eliminar socio</button>`;
  main.parentElement.querySelector('[data-edit]').onclick = () => abrirSocio(app, so);
  main.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mov]');
    if (b) return abrirMovSocio(app, so, b.dataset.mov);
    const tr = e.target.closest('[data-id]');
    if (tr) return abrirMovSocio(app, so, null, so.movs.find((m) => m.id === tr.dataset.id));
    if (e.target.closest('[data-del]')) {
      if (!(await confirmDialog({ title: '¿Eliminar socio?', text: `Se borrará ${esc(so.nombre)} con todos sus movimientos de capital.`, ok: 'Eliminar', danger: true }))) return;
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
      ${field('Notas', `<textarea name="notas">${esc(so?.notas || '')}</textarea>`)}
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>`,
    onMount(el, api) {
      $('[data-ok]', el).onclick = async () => {
        const nombre = $('[name=nombre]', el).value.trim();
        if (!nombre) return toast('Escribe el nombre', 'err');
        const notas = $('[name=notas]', el).value.trim();
        let target = so;
        if (so) Object.assign(so, { nombre, notas });
        else {
          target = { id: uid(), nombre, notas, movs: [] };
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

function abrirMovSocio(app, so, tipo, mov = null) {
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
