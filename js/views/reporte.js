// Reporte por rango de meses para guardar en PDF (con la ventana de imprimir del teléfono → "Guardar como PDF").
import { icon } from '../icons.js';
import { $, esc, money, today, addMonths, monthKey, parseYmd, fdate, sum } from '../utils.js';
import { informeMes } from '../logic.js';
import { toast } from '../ui.js';

const MAX_MESES = 36;
const dfMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const dfCorto = new Intl.DateTimeFormat('es-CO', { month: 'short' });
const nombreMes = (mes) => dfMes.format(parseYmd(mes + '-01')).replace(/^./, (x) => x.toUpperCase());
const mesCorto = (mes) => `${dfCorto.format(parseYmd(mes + '-01')).replace('.', '').replace(/^./, (x) => x.toUpperCase())} ${mes.slice(0, 4)}`;
const pctTxt = (x) => `${Math.round(x * 1000) / 10}`.replace('.', ',') + ' %';
const okMes = (m) => /^\d{4}-\d{2}$/.test(m || '');

function meses(desde, hasta) {
  const out = [];
  for (let m = desde; m <= hasta && out.length < MAX_MESES; m = monthKey(addMonths(m + '-01', 1))) out.push(m);
  return out;
}

export function render(app, _p, query) {
  const s = app.state;
  const hoy = today();
  const mesHoy = monthKey(hoy);
  let hasta = okMes(query.hasta) && query.hasta <= mesHoy ? query.hasta : mesHoy;
  let desde = okMes(query.desde) ? query.desde : `${hasta.slice(0, 4)}-01`;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const lista = meses(desde, hasta);
  hasta = lista[lista.length - 1];

  const infos = lista.map((m) => informeMes(s, m, hoy));
  const ultimo = infos[infos.length - 1];
  const r = ultimo.r;
  const tot = (k) => sum(infos, (i) => i[k]);
  const T = {
    prestado: tot('prestado'), nNuevos: tot('nNuevos'), cobrado: tot('cobrado'),
    intereses: tot('intereses'), adicionales: tot('adicionales'), pactada: tot('pactada'),
    gastos: tot('gastos'), aRepartir: tot('aRepartir'), gananciaCobrada: tot('gananciaCobrada'), retiros: tot('retiros'),
    terminados: tot('terminados'),
  };
  // Reparto acumulado por socio en el rango
  const porSocio = new Map();
  for (const i of infos) {
    for (const x of i.socios) {
      if (!x.participa) continue;
      const a = porSocio.get(x.socio.id) || { socio: x.socio, pct: x.pct, ganancia: 0, descuento: 0, notas: [] };
      a.ganancia += x.parteGanancia;
      a.descuento += x.descuento;
      if (x.descuento) a.notas.push(`${mesCorto(i.mes)}: ${money(x.descuento)}${x.notaDescuento ? ` (${x.notaDescuento})` : ''}`);
      a.pct = x.pct;
      porSocio.set(x.socio.id, a);
    }
  }
  const reparto = [...porSocio.values()];
  const guardan = ultimo.socios.filter((x) => !x.participa && x.socio.pctGanancia !== undefined);
  const rango = desde === hasta ? nombreMes(desde) : `${nombreMes(desde)} a ${nombreMes(hasta)}`;
  const negocio = s.config.negocio || 'Control de Cobros';

  const main = app.shell({ title: 'Reporte PDF', back: '#/informe', tab: 'mas' });
  const n = (v) => `<td class="num">${money(v)}</td>`;
  main.innerHTML = `
    <div class="card no-print">
      <div class="grid2">
        <div class="field"><label>Desde</label><input type="month" data-desde value="${desde}" max="${mesHoy}"></div>
        <div class="field"><label>Hasta</label><input type="month" data-hasta value="${hasta}" max="${mesHoy}"></div>
      </div>
      <button class="btn primary block" data-pdf style="margin-top:6px">${icon('download', 'sm')} Guardar PDF</button>
      <p class="tiny muted" style="margin:8px 0 0">Se abre la ventana de imprimir: elige <b>“Guardar como PDF”</b> y luego compártelo por WhatsApp o guárdalo en Drive. Máximo ${MAX_MESES} meses.</p>
    </div>

    <article class="reporte">
      <header class="rep-head">
        <div><div class="rep-neg">${esc(negocio)}</div><h2>Reporte para socios</h2><div class="rep-rango">${esc(rango)}</div></div>
        <div class="rep-fecha">Generado el ${esc(fdate(hoy))}${ultimo.enCurso ? `<br>${esc(nombreMes(hasta))}: cifras a hoy` : ''}</div>
      </header>

      <section class="rep-kpis">
        <div><span>Ganancia neta a repartir</span><b>${money(T.aRepartir)}</b></div>
        <div><span>Ganancia pactada</span><b>${money(T.pactada)}</b></div>
        <div><span>Prestado</span><b>${money(T.prestado)}</b></div>
        <div><span>Cobrado</span><b>${money(T.cobrado)}</b></div>
      </section>

      <h3>Mes por mes</h3>
      <div class="rep-tabla"><table>
        <thead><tr><th>Mes</th><th>Prestado</th><th>Cobrado</th><th>Intereses</th><th>Adicionales</th><th>Gastos</th><th>Neta a repartir</th><th>Retiros</th></tr></thead>
        <tbody>${infos.map((i) => `<tr><td>${esc(mesCorto(i.mes))}</td>${n(i.prestado)}${n(i.cobrado)}${n(i.intereses)}${n(i.adicionales)}${n(i.gastos)}<td class="num"><b>${money(i.aRepartir)}</b></td>${n(i.retiros)}</tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>${n(T.prestado)}${n(T.cobrado)}${n(T.intereses)}${n(T.adicionales)}${n(T.gastos)}${n(T.aRepartir)}${n(T.retiros)}</tr></tfoot>
      </table></div>
      <p class="rep-nota">Neta a repartir = ganancia pactada (intereses de los préstamos del mes + adicionales) − gastos. Préstamos nuevos: ${T.nNuevos} · terminados: ${T.terminados} · ganancia ya cobrada en el rango: ${money(T.gananciaCobrada)}.</p>

      <h3>Reparto entre socios</h3>
      ${reparto.length ? `<div class="rep-tabla"><table>
        <thead><tr><th>Socio</th><th>%</th><th>Ganancia</th><th>Descuentos por deuda</th><th>A recibir</th></tr></thead>
        <tbody>${reparto.map((a) => `<tr><td>${esc(a.socio.nombre)}</td><td class="num">${pctTxt(a.pct)}</td>${n(a.ganancia)}<td class="num">${a.descuento ? '− ' + money(a.descuento) : '—'}</td><td class="num"><b>${money(a.ganancia - a.descuento)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td>${n(sum(reparto, (a) => a.ganancia))}<td class="num">${sum(reparto, (a) => a.descuento) ? '− ' + money(sum(reparto, (a) => a.descuento)) : '—'}</td>${n(sum(reparto, (a) => a.ganancia - a.descuento))}</tr></tfoot>
      </table></div>
      ${reparto.some((a) => a.notas.length) ? `<p class="rep-nota">Descuentos: ${reparto.filter((a) => a.notas.length).map((a) => `<b>${esc(a.socio.nombre)}</b> — ${esc(a.notas.join('; '))}`).join(' · ')}</p>` : ''}`
      : '<p class="rep-nota">No hay % de ganancia asignado a los socios (Capital y socios → socio → lápiz).</p>'}

      <h3>Estado al ${esc(fdate(ultimo.corte))}</h3>
      <dl class="rep-kv">
        <dt>Capital base</dt><dd>${money(r.capitalBase)}</dd>
        <dt>Dinero en la calle</dt><dd>${money(r.enCalle)}</dd>
        <dt><b>Total deuda por cobrar</b></dt><dd><b>${money(r.porCobrar)}</b></dd>
        <dt>Disponible</dt><dd>${money(r.disponible)}</dd>
        <dt>Ganancia + adicionales (acumulada)</dt><dd>${money(r.gananciaTotal)}</dd>
        <dt>Ganancia + capital</dt><dd>${money(r.gananciaMasCapital)}</dd>
      </dl>

      ${guardan.length ? `<h3>Dinero guardado (sin ganancia)</h3>
        <dl class="rep-kv">${guardan.map((x) => `<dt>${esc(x.socio.nombre)}</dt><dd>${money(x.base)}</dd>`).join('')}</dl>` : ''}
    </article>`;

  const ir = () => {
    const d = $('[data-desde]', main).value;
    const h = $('[data-hasta]', main).value;
    if (okMes(d) && okMes(h)) app.go(`#/reporte?desde=${d}&hasta=${h}`);
  };
  $('[data-desde]', main).addEventListener('change', ir);
  $('[data-hasta]', main).addEventListener('change', ir);
  $('[data-pdf]', main).onclick = () => {
    const titulo = document.title;
    document.title = `Reporte socios ${desde === hasta ? desde : `${desde} a ${hasta}`}`; // nombre sugerido del PDF
    const volver = () => { document.title = titulo; window.removeEventListener('afterprint', volver); };
    window.addEventListener('afterprint', volver);
    try { window.print(); } catch { toast('Este teléfono no permite imprimir desde la app', 'err'); volver(); }
  };
}
