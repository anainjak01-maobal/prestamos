// Tarjeta de totales generales, como en el Excel: TOTAL DEUDA (hoja RESUMEN) y GANANCIA + ADICIONALES (hoja GANANCIAS).
import { icon } from '../icons.js';
import { $, money, parseMoney } from '../utils.js';
import { sheet, toast, moneyField } from '../ui.js';

export function tarjetaTotales(r) {
  const n = r.activos.length;
  return `<div class="card totales"><h3>${icon('file', 'sm')} Totales generales</h3>
    <dl class="kv">
      <dt><b>Total deuda por cobrar</b></dt><dd class="tot-deuda"><b>${money(r.porCobrar)}</b></dd>
      <dt class="tiny muted" style="margin-top:-6px">${n} préstamo${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}</dt><dd></dd>
      <dt>Ganancias (intereses)</dt><dd>${money(r.interesesPrestamos)}</dd>
      <dt>Adicionales <button type="button" class="link-btn" data-adic-ant aria-label="Adicionales anteriores">${icon('edit', 'sm')}</button></dt><dd>${money(r.adicionales)}</dd>
      <dt><b>Ganancia + adicionales</b></dt><dd style="color:var(--ok)"><b>${money(r.gananciaTotal)}</b></dd>
      <dt>Capital base</dt><dd>${money(r.capitalBase)}</dd>
      <dt><b>Ganancia + capital</b></dt><dd style="color:var(--violet)"><b>${money(r.gananciaMasCapital)}</b></dd>
    </dl>
    ${r.adicionalesAnteriores ? `<p class="tiny muted" style="margin:8px 0 0">Adicionales incluye ${money(r.adicionalesAnteriores)} anteriores (del Excel).</p>` : ''}
  </div>`;
}

/** Botón para registrar los adicionales anteriores (los del Excel, que no tienen préstamo). */
export function bindTotales(main, app) {
  $('[data-adic-ant]', main)?.addEventListener('click', () => {
    const actual = Number(app.state.config.adicionalesAnteriores) || 0;
    sheet({
      title: 'Adicionales anteriores',
      ico: 'percent',
      tone: 'tone-violet',
      body: `<p class="small muted" style="margin-top:-6px">Los adicionales que se registran en cada préstamo se suman solos. Aquí puedes poner el total de adicionales anteriores que no están en ningún préstamo (por ejemplo, la columna ADICIONALES de la hoja GANANCIAS del Excel).</p>
        ${moneyField('valor', 'Total de adicionales anteriores', actual || '', 'Déjalo en 0 si no hay.')}
        <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>`,
      onMount(el, api) {
        $('[data-ok]', el).onclick = async () => {
          app.state.config.adicionalesAnteriores = parseMoney($('[name=valor]', el).value) || 0;
          await app.save();
          api.close();
          toast('Guardado');
          app.refresh();
        };
      },
    });
  });
}
