// Gastos del negocio y retiros de ganancia.
import { icon } from '../icons.js';
import { $, esc, money, fdate, today, uid, parseMoney, monthKey, fmonth } from '../utils.js';
import { CATEGORIAS_GASTO, gastosPorMes, gananciaCobradaPorMes } from '../logic.js';
import { sheet, toast, field, moneyField, segHtml, segValue, confirmDialog, emptyState, afterLayers } from '../ui.js';

const ICONO_CAT = { Transporte: 'pin', 'Teléfono': 'phone', 'Papelería': 'file', Comida: 'coins', Otro: 'sliders' };

let mesActual = null;

export function lista(app, _p, query) {
  const s = app.state;
  const hoy = today();
  if (query.mes) mesActual = query.mes;
  const meses = [...new Set([monthKey(hoy), ...s.gastos.map((g) => monthKey(g.fecha))])].sort().reverse();
  if (!mesActual || !meses.includes(mesActual)) mesActual = monthKey(hoy);
  const main = app.shell({
    title: 'Gastos y retiros',
    back: '#/mas',
    tab: 'mas',
    fab: { label: 'Registrar', icon: 'plus', onClick: () => abrirGasto(app) },
  });
  const porMes = gastosPorMes(s)[mesActual] || { gastos: 0, retiros: 0 };
  const ganancia = gananciaCobradaPorMes(s)[mesActual] || 0;
  const neta = ganancia - porMes.gastos;
  const items = s.gastos.filter((g) => monthKey(g.fecha) === mesActual).sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : (b.ts || 0) - (a.ts || 0)));
  const y = mesActual.slice(0, 4);

  main.innerHTML = `
    <div class="chips">${meses.map((k) => `<button class="chip ${k === mesActual ? 'on' : ''}" data-mes="${k}">${fmonth(k)} ${k.slice(0, 4)}</button>`).join('')}</div>
    <div class="hero">
      <div class="label">Ganancia neta · ${fmonth(mesActual)} ${y}</div>
      <div class="big num">${money(neta)}</div>
      <div class="split">
        <div><span>Ganancia cobrada</span><b class="num">${money(ganancia)}</b></div>
        <div><span>Gastos</span><b class="num">− ${money(porMes.gastos)}</b></div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="ico tone-violet">${icon('arrowOut', 'sm')}</div><div class="v num">${money(porMes.retiros)}</div><div class="l">Retiros de ganancia</div></div>
      <div class="kpi"><div class="ico tone-ok">${icon('wallet', 'sm')}</div><div class="v num">${money(neta - porMes.retiros)}</div><div class="l">Queda en el negocio</div></div>
    </div>
    <div class="section-title">Movimientos del mes <span class="muted">${items.length}</span></div>
    ${items.length ? `<div class="list">${items.map((g) => `
      <div class="item" data-id="${g.id}">
        <div class="avatar ${g.tipo === 'retiro' ? 'tone-violet' : 'tone-warn'}">${icon(g.tipo === 'retiro' ? 'arrowOut' : ICONO_CAT[g.categoria] || 'sliders', 'sm')}</div>
        <div class="grow"><div class="t ellipsis">${esc(g.tipo === 'retiro' ? 'Retiro de ganancia' : g.categoria || 'Gasto')}</div>
          <div class="s ellipsis">${fdate(g.fecha)}${g.nota ? ' · ' + esc(g.nota) : ''}</div></div>
        <div class="end"><span class="amt num" style="color:${g.tipo === 'retiro' ? 'var(--violet)' : 'var(--danger)'}">− ${money(g.valor)}</span></div>
      </div>`).join('')}</div>`
      : emptyState('cash', 'Sin gastos este mes', 'Registra gasolina, recargas, papelería o lo que retiras de la ganancia.')}
    <p class="tiny muted" style="margin:6px 4px">Los <b>gastos</b> se restan de la ganancia. Los <b>retiros</b> son lo que sacas para ti: no son pérdida, pero se descuentan del dinero disponible.</p>`;
  main.addEventListener('click', (e) => {
    const mes = e.target.closest('[data-mes]');
    if (mes) { mesActual = mes.dataset.mes; return app.refresh(); }
    const it = e.target.closest('[data-id]');
    if (it) abrirGasto(app, s.gastos.find((g) => g.id === it.dataset.id));
  });
}

/** Formulario para registrar o editar un gasto o retiro. */
export function abrirGasto(app, g = null, { tipo: tipoInicial = 'gasto' } = {}) {
  const tipo0 = g?.tipo || tipoInicial;
  sheet({
    title: g ? 'Editar movimiento' : 'Registrar gasto o retiro',
    ico: 'cash',
    tone: 'tone-warn',
    body: `<div class="field"><span class="lbl">Tipo</span>${segHtml('tipo', ['Gasto', 'Retiro de ganancia'], tipo0 === 'retiro' ? 'Retiro de ganancia' : 'Gasto')}</div>
      <div class="field" data-cat><span class="lbl">Categoría</span>${segHtml('categoria', CATEGORIAS_GASTO, g?.categoria || 'Transporte', 'wrap')}</div>
      ${moneyField('valor', 'Valor', g?.valor || '')}
      ${field('Fecha', `<input type="date" name="fecha" value="${g?.fecha || today()}">`)}
      ${field('Nota', `<input name="nota" value="${esc(g?.nota || '')}" placeholder="Ej: gasolina moto, recarga…">`)}
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>
      ${g ? `<div style="height:10px"></div><button class="btn danger block" data-del>${icon('trash', 'sm')} Eliminar</button>` : ''}`,
    onMount(el, api) {
      const cat = $('[data-cat]', el);
      const syncCat = () => cat.classList.toggle('hidden', segValue(el, 'tipo') !== 'Gasto');
      $('[data-seg=tipo]', el).addEventListener('change', syncCat);
      syncCat();
      $('[data-ok]', el).onclick = async () => {
        const valor = parseMoney($('[name=valor]', el).value);
        if (!(valor > 0)) return toast('Escribe el valor', 'err');
        const esRetiro = segValue(el, 'tipo') !== 'Gasto';
        const datos = {
          tipo: esRetiro ? 'retiro' : 'gasto',
          categoria: esRetiro ? '' : segValue(el, 'categoria'),
          valor,
          fecha: $('[name=fecha]', el).value || today(),
          nota: $('[name=nota]', el).value.trim(),
        };
        if (g) Object.assign(g, datos);
        else app.state.gastos.push({ id: uid(), ts: Date.now(), ...datos });
        await app.save();
        api.close();
        toast(esRetiro ? 'Retiro registrado' : 'Gasto registrado');
        afterLayers(() => app.refresh());
      };
      $('[data-del]', el)?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '¿Eliminar?', text: 'Se borrará este movimiento.', ok: 'Eliminar', danger: true }))) return;
        app.state.gastos = app.state.gastos.filter((x) => x !== g);
        await app.save();
        api.close();
        toast('Eliminado');
        afterLayers(() => app.refresh());
      });
    },
  });
}
