// Detalle de los adicionales (interés sobre interés): los aplicados en la app y los históricos del Excel.
import { icon } from '../icons.js';
import { $, esc, money, fdate, fshort, today, uid, norm, parseMoney, avatarTone, initials, sum } from '../utils.js';
import { resumenGeneral } from '../logic.js';
import { sheet, toast, field, moneyField, segHtml, segValue, confirmDialog, emptyState } from '../ui.js';
import { pickAdicionalesFile } from '../backup.js';
import * as store from '../store.js';

/** Adicionales aplicados en los préstamos de la app (no anulados), del más reciente al más viejo. */
export function adicionalesApp(calcs) {
  const out = [];
  for (const c of calcs) {
    if (c.p.estado === 'anulado') continue;
    for (const l of c.lineas) {
      if (l.tipo === 'interes' && l.cargo) out.push({ p: c.p, fecha: l.fecha, valor: l.cargo, nota: l.nota });
    }
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

const nombreCliente = (id) => store.getCliente(id)?.nombre || '';

/** Busca el cliente cuyo nombre contiene todas las palabras del nombre del Excel (solo si hay uno). */
function buscarCliente(nombre, clientes) {
  const pal = norm(nombre).split(/\s+/).filter((w) => w.length >= 3);
  if (!pal.length) return null;
  const cand = clientes.filter((c) => {
    const tc = norm(c.nombre).split(/\s+/);
    return pal.every((w) => tc.includes(w));
  });
  return cand.length === 1 ? cand[0].id : null;
}

export function render(app) {
  const s = app.state;
  const r = resumenGeneral(s, today());
  const deApp = adicionalesApp(r.calcs);
  const totApp = sum(deApp, (a) => a.valor);
  const hist = s.adicionalesHist || [];
  const manual = Math.round(Number(s.config.adicionalesAnteriores) || 0);
  const totHist = sum(hist, (a) => a.valor) + manual;
  const main = app.shell({
    title: 'Adicionales',
    back: '#/inicio',
    tab: 'inicio',
    actions: `<button class="icon-btn" data-share aria-label="Compartir">${icon('share')}</button>`,
  });

  const itemHist = (a) => {
    const cli = a.clienteId ? nombreCliente(a.clienteId) : '';
    const n = a.nombre || '—';
    return `<div class="item" data-hist="${a.id}"><div class="avatar ${avatarTone(n)}">${esc(initials(n))}</div>
      <div class="grow"><div class="t ellipsis">${esc(n)}</div><div class="s">${esc([cli && cli !== n ? cli : '', a.nota].filter(Boolean).join(' · '))}</div></div>
      <div class="end"><span class="amt num" ${a.valor < 0 ? 'style="color:var(--danger)"' : ''}>${money(a.valor)}</span></div></div>`;
  };

  main.innerHTML = `
    <div class="hero">
      <div class="label">Adicionales · interés sobre interés</div>
      <div class="big num">${money(r.adicionales)}</div>
      <div class="split">
        <div><span>De la app</span><b class="num">${money(totApp)}</b><span>${deApp.length} aplicado${deApp.length === 1 ? '' : 's'}</span></div>
        <div><span>Históricos (Excel)</span><b class="num">${money(totHist)}</b><span>ya cobrados</span></div>
      </div>
    </div>
    <button class="btn block" data-share style="margin-bottom:14px">${icon('share', 'sm')} Compartir detalle con los socios</button>

    <div class="section-title">De la app <span class="muted">${money(totApp)}</span></div>
    ${deApp.length ? `<div class="list">${deApp.map((a) => {
      const n = nombreCliente(a.p.clienteId) || '—';
      return `<div class="item" data-href="#/prestamo/${a.p.id}"><div class="avatar ${avatarTone(n)}">${esc(initials(n))}</div>
        <div class="grow"><div class="t ellipsis">${esc(n)}</div><div class="s">Préstamo #${a.p.id} · ${esc(fshort(a.fecha))}</div></div>
        <div class="end"><span class="amt num">${money(a.valor)}</span></div></div>`;
    }).join('')}</div>` : `<p class="small muted" style="margin:0 4px 14px">Aún no se ha aplicado ningún interés adicional en la app. Cuando apliques uno en un préstamo, aparece aquí solo.</p>`}

    <div class="section-title">Históricos del Excel <span class="muted">${money(totHist)}</span></div>
    ${hist.length || manual ? `<div class="list">${hist.map(itemHist).join('')}
      ${manual ? `<div class="item" data-manual><div class="avatar tone-violet">${icon('edit', 'sm')}</div>
        <div class="grow"><div class="t">Valor único puesto a mano</div><div class="s">Toca para cambiarlo o quitarlo</div></div>
        <div class="end"><span class="amt num">${money(manual)}</span></div></div>` : ''}</div>
      <p class="tiny muted" style="margin:6px 4px 0">Importados del Excel (columna ADICIONALES de GANANCIAS). Ya están cobrados: suman en la ganancia cobrada y en el disponible. Toca una línea para corregirla.</p>`
    : emptyState('file', 'Sin adicionales históricos', 'Importa la columna ADICIONALES del Excel para verla aquí, línea por línea.', `<button class="btn primary" data-importar>${icon('upload', 'sm')} Importar adicionales del Excel</button>`)}
    <div class="btn-row" style="margin-top:14px">
      <button class="btn sm" data-nuevo>${icon('plus', 'sm')} Agregar línea</button>
      ${hist.length ? `<button class="btn sm" data-importar>${icon('upload', 'sm')} Volver a importar</button>` : ''}
    </div>`;

  main.parentElement.querySelectorAll('[data-share]').forEach((b) => (b.onclick = () => compartir(r, deApp, totApp, hist, manual, totHist)));
  main.addEventListener('click', (e) => {
    const t = e.target;
    const h = t.closest('[data-hist]');
    if (h) return abrirLinea(app, hist.find((a) => a.id === h.dataset.hist));
    if (t.closest('[data-manual]')) return abrirManual(app);
    if (t.closest('[data-nuevo]')) return abrirLinea(app, null);
    if (t.closest('[data-importar]')) return importarAdicionales(app);
    const go = t.closest('[data-href]');
    if (go) app.go(go.dataset.href);
  });
}

async function compartir(r, deApp, totApp, hist, manual, totHist) {
  const t = [`*Adicionales (interés sobre interés)* · ${fdate(today())}`, `Total: *${money(r.adicionales)}*`, ''];
  t.push(`*De la app: ${money(totApp)}*`);
  if (deApp.length) deApp.forEach((a) => t.push(`• ${nombreCliente(a.p.clienteId) || '—'} · préstamo #${a.p.id} · ${fshort(a.fecha)}: ${money(a.valor)}`));
  else t.push('(ninguno todavía)');
  t.push('', `*Históricos del Excel (ya cobrados): ${money(totHist)}*`);
  hist.forEach((a) => t.push(`• ${a.nombre}: ${money(a.valor)}${a.nota ? ` (${a.nota})` : ''}`));
  if (manual) t.push(`• Valor único puesto a mano: ${money(manual)}`);
  const texto = t.join('\n');
  try {
    if (navigator.share) await navigator.share({ text: texto, title: 'Adicionales' });
    else { await navigator.clipboard.writeText(texto); toast('Detalle copiado'); }
  } catch { /* cancelado */ }
}

/** Agregar o corregir una línea histórica. */
function abrirLinea(app, a) {
  const s = app.state;
  const v = a || { nombre: '', clienteId: null, valor: 0, nota: 'Pagó' };
  const opciones = [...s.clientes].sort((x, y) => x.nombre.localeCompare(y.nombre))
    .map((c) => `<option value="${c.id}" ${c.id === v.clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  sheet({
    title: a ? 'Adicional histórico' : 'Nuevo adicional histórico',
    ico: 'percent',
    tone: 'tone-violet',
    body: `${a?.fila ? `<p class="small muted" style="margin-top:-6px">Importado del Excel (hoja GANANCIAS, fila ${a.fila}).</p>` : ''}
      ${field('Nombre (como estaba en el Excel)', `<input name="nombre" value="${esc(v.nombre)}">`)}
      ${field('Cliente de la app', `<select name="cliente"><option value="">— Sin cliente —</option>${opciones}</select>`, 'Si lo eliges, aparece también en la ficha del cliente.')}
      <div class="field"><span class="lbl">Tipo</span>${segHtml('signo', ['Suma', 'Resta (cuadre)'], v.valor < 0 ? 'Resta (cuadre)' : 'Suma')}</div>
      ${moneyField('valor', 'Valor', Math.abs(v.valor) || '')}
      ${field('Nota', `<input name="nota" value="${esc(v.nota || '')}">`)}
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>
      ${a ? `<div style="height:10px"></div><button class="btn danger block" data-del>${icon('trash', 'sm')} Eliminar línea</button>` : ''}`,
    onMount(el, api) {
      $('[data-ok]', el).onclick = async () => {
        const val = parseMoney($('[name=valor]', el).value);
        const nombre = $('[name=nombre]', el).value.trim();
        if (!(val > 0)) return toast('Escribe el valor', 'err');
        if (!nombre) return toast('Escribe el nombre', 'err');
        const datos = {
          nombre,
          clienteId: $('[name=cliente]', el).value || null,
          valor: segValue(el, 'signo').startsWith('Resta') ? -val : val,
          nota: $('[name=nota]', el).value.trim(),
        };
        if (a) Object.assign(a, datos);
        else s.adicionalesHist.push({ id: uid(), origen: 'manual', ...datos });
        await app.save();
        api.close();
        toast('Guardado');
        app.refresh();
      };
      $('[data-del]', el)?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: '¿Eliminar línea?', text: `${esc(a.nombre)} · ${money(a.valor)}`, ok: 'Eliminar', danger: true }))) return;
        s.adicionalesHist = s.adicionalesHist.filter((x) => x !== a);
        await app.save();
        api.close();
        toast('Línea eliminada');
        app.refresh();
      });
    },
  });
}

/** El valor único que se podía poner a mano en la v1.4 (antes del detalle). */
function abrirManual(app) {
  const s = app.state;
  sheet({
    title: 'Valor único puesto a mano',
    ico: 'edit',
    tone: 'tone-violet',
    body: `<p class="small muted" style="margin-top:-6px">Si ya importaste el detalle del Excel, deja este valor en 0 para no contar dos veces.</p>
      ${moneyField('valor', 'Valor', s.config.adicionalesAnteriores || '')}
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>`,
    onMount(el, api) {
      $('[data-ok]', el).onclick = async () => {
        s.config.adicionalesAnteriores = parseMoney($('[name=valor]', el).value) || 0;
        await app.save();
        api.close();
        toast('Guardado');
        app.refresh();
      };
    },
  });
}

/** Importa adicionales-excel.json: agrega las líneas sin tocar nada más. */
export async function importarAdicionales(app) {
  let f;
  try { f = await pickAdicionalesFile(); } catch (e) { return toast(e.message, 'err'); }
  if (!f) return;
  const s = app.state;
  const lineas = f.lineas.map((l) => ({
    id: uid(), origen: 'excel', fila: l.fila, nombre: String(l.nombre || '—'),
    clienteId: buscarCliente(l.nombre, s.clientes), valor: Math.round(Number(l.valor) || 0), nota: l.nota || '',
  }));
  const total = sum(lineas, (l) => l.valor);
  const previas = s.adicionalesHist.filter((a) => a.origen === 'excel');
  const manual = Math.round(Number(s.config.adicionalesAnteriores) || 0);
  sheet({
    title: 'Importar adicionales del Excel',
    ico: 'upload',
    tone: 'tone-info',
    body: `<div class="summary">
        <div class="r"><span>Líneas</span><b>${lineas.length}</b></div>
        <div class="r"><span>Total</span><b>${money(total)}</b></div>
        <div class="r"><span>Con cliente encontrado</span><b>${lineas.filter((l) => l.clienteId).length}</b></div>
      </div>
      <p class="small muted">Solo se agregan estas líneas como adicionales históricos (ya cobrados). No se borra ni se cambia nada más.</p>
      ${previas.length ? `<div class="alert warn">${icon('alert')}<div class="grow small">Ya había ${previas.length} líneas importadas del Excel: se reemplazan por estas.</div></div>` : ''}
      ${manual ? `<div class="alert info">${icon('info')}<div class="grow small">El valor único de ${money(manual)} que pusiste a mano se quita, porque ahora queda el detalle.</div></div>` : ''}
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Importar</button>
      <p class="tiny muted" style="text-align:center">Después de importar, borra el archivo adicionales-excel.json: no está cifrado.</p>`,
    onMount(el, api) {
      $('[data-ok]', el).onclick = async () => {
        s.adicionalesHist = [...s.adicionalesHist.filter((a) => a.origen !== 'excel'), ...lineas];
        s.config.adicionalesAnteriores = 0;
        await app.save();
        api.close();
        toast(`${lineas.length} adicionales importados`);
        app.go('#/adicionales');
      };
    },
  });
}
