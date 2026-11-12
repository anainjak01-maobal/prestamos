// Tarjeta de totales generales, como en el Excel: TOTAL DEUDA (hoja RESUMEN) y GANANCIA + ADICIONALES (hoja GANANCIAS).
import { icon } from '../icons.js';
import { money } from '../utils.js';

export function tarjetaTotales(r) {
  const n = r.activos.length;
  return `<div class="card totales"><h3>${icon('file', 'sm')} Totales generales</h3>
    <dl class="kv">
      <dt><b>Total deuda por cobrar</b></dt><dd class="tot-deuda"><b>${money(r.porCobrar)}</b></dd>
      <dt class="tiny muted" style="margin-top:-6px">${n} préstamo${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}</dt><dd></dd>
      <dt>Ganancias (intereses)</dt><dd>${money(r.interesesPrestamos)}</dd>
      <dt><a class="link-row" href="#/adicionales">Adicionales ${icon('next', 'sm')}</a></dt><dd><a class="link-row" href="#/adicionales">${money(r.adicionales)}</a></dd>
      <dt><b>Ganancia + adicionales</b></dt><dd style="color:var(--ok)"><b>${money(r.gananciaTotal)}</b></dd>
      <dt>Capital base</dt><dd>${money(r.capitalBase)}</dd>
      <dt><b>Ganancia + capital</b></dt><dd style="color:var(--violet)"><b>${money(r.gananciaMasCapital)}</b></dd>
    </dl>
    <p class="tiny muted" style="margin:8px 0 0">Toca “Adicionales” para ver el detalle${r.adicionalesAnteriores ? ` (incluye ${money(r.adicionalesAnteriores)} históricos del Excel, ya cobrados)` : ''}.</p>
  </div>`;
}
