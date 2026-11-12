// Informe mensual para socios: movimiento del mes, estado al cierre y parte de cada socio. Se comparte por WhatsApp.
import { icon } from '../icons.js';
import { $, esc, money, today, addMonths, monthKey, parseYmd, fdate, avatarTone, initials } from '../utils.js';
import { informeMes } from '../logic.js';
import { toast } from '../ui.js';

const dfMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const nombreMes = (mes) => dfMes.format(parseYmd(mes + '-01')).replace(/^./, (x) => x.toUpperCase());
const pct = (x) => `${Math.round(x * 1000) / 10}%`.replace('.', ',');

export function render(app, _p, query) {
  const s = app.state;
  const hoy = today();
  const mesHoy = monthKey(hoy);
  const mes = /^\d{4}-\d{2}$/.test(query.mes || '') && query.mes <= mesHoy ? query.mes : mesHoy;
  const i = informeMes(s, mes, hoy);
  const r = i.r;
  const main = app.shell({ title: 'Informe para socios', back: '#/capital', tab: 'mas' });
  const fila = (label, valor, extra = '') => `<dt>${label}</dt><dd ${extra}>${valor}</dd>`;

  main.innerHTML = `
    <div class="row between" style="margin-bottom:12px">
      <a class="icon-btn" href="#/informe?mes=${monthKey(addMonths(mes + '-01', -1))}" aria-label="Mes anterior">${icon('back')}</a>
      <label class="grow" style="text-align:center;font-weight:700;position:relative">
        ${esc(nombreMes(mes))}${i.enCurso ? ' · en curso' : ''}
        <input type="month" value="${mes}" max="${mesHoy}" data-mes style="position:absolute;inset:0;opacity:0">
      </label>
      ${mes === mesHoy ? '<span class="icon-btn"></span>' : `<a class="icon-btn" href="#/informe?mes=${monthKey(addMonths(mes + '-01', 1))}" aria-label="Mes siguiente">${icon('next')}</a>`}
    </div>

    <div class="hero">
      <div class="label">Ganancia neta del mes</div>
      <div class="big num">${money(i.gananciaNeta)}</div>
      <div class="split">
        <div><span>Cobrado</span><b class="num">${money(i.cobrado)}</b><span>${i.nPagos} pago${i.nPagos === 1 ? '' : 's'}</span></div>
        <div><span>Prestado</span><b class="num">${money(i.prestado)}</b><span>${i.nNuevos} préstamo${i.nNuevos === 1 ? '' : 's'}</span></div>
      </div>
    </div>
    <button class="btn primary block" data-compartir style="margin-bottom:14px">${icon('share', 'sm')} Compartir informe con los socios</button>

    <div class="card"><h3>Movimiento del mes</h3>
      <dl class="kv">
        ${fila('Ganancia pactada', money(i.pactada))}
        ${fila('<span class="small muted">· Intereses de préstamos</span>', `<span class="small">${money(i.intereses)}</span>`)}
        ${fila(`<span class="small muted">· Adicionales (${i.nAdicionales})</span>`, `<span class="small">${money(i.adicionales)}</span>`)}
        ${fila('Ganancia cobrada', money(i.gananciaCobrada), 'style="color:var(--ok)"')}
        ${fila('Gastos', '− ' + money(i.gastos), 'style="color:var(--danger)"')}
        ${fila('<b>Ganancia neta</b>', `<b>${money(i.gananciaNeta)}</b>`)}
        ${fila('Retiros de ganancia', '− ' + money(i.retiros), 'style="color:var(--violet)"')}
        ${fila('Préstamos terminados', i.terminados)}
      </dl>
    </div>

    <div class="card"><h3>Estado al ${esc(fdate(i.corte))}</h3>
      <dl class="kv">
        ${fila('Capital base', money(r.capitalBase))}
        ${fila('Dinero en la calle', money(r.enCalle))}
        ${fila('<b>Total deuda por cobrar</b>', `<b>${money(r.porCobrar)}</b>`)}
        ${fila('Disponible', money(r.disponible), 'style="color:var(--ok)"')}
        ${fila('Ganancia + adicionales', money(r.gananciaTotal))}
        ${fila('Ganancia + capital', money(r.gananciaMasCapital))}
      </dl>
      <p class="tiny muted" style="margin:8px 0 0">Ganancias acumuladas desde el inicio. ${i.enCurso ? 'El mes no ha terminado: las cifras son a hoy.' : ''}</p>
    </div>

    <div class="section-title">Socios <span class="muted">${i.socios.length}</span></div>
    ${i.socios.length ? `<div class="list">${i.socios.map((x) => `<div class="item" data-href="#/socio/${x.socio.id}">
        <div class="avatar ${avatarTone(x.socio.nombre)}">${esc(initials(x.socio.nombre))}</div>
        <div class="grow"><div class="t ellipsis">${esc(x.socio.nombre)}</div>
          <div class="s">Base ${money(x.base)} · ${pct(x.pct)}${x.aportes ? ` · aportó ${money(x.aportes)}` : ''}${x.retiros ? ` · retiró ${money(x.retiros)}` : ''}</div></div>
        <div class="end"><span class="amt num" style="color:${x.parteGanancia < 0 ? 'var(--danger)' : 'var(--ok)'}">${money(x.parteGanancia)}</span><span class="small muted">de la ganancia</span></div></div>`).join('')}</div>
      <p class="tiny muted" style="margin:6px 4px 0">La parte de cada socio es una <b>referencia</b>: la ganancia neta del mes repartida según el % de su aporte al cierre.</p>`
    : '<p class="small muted">No hay socios registrados (Más → Capital y socios).</p>'}`;

  $('[data-mes]', main).addEventListener('change', (e) => e.target.value && app.go(`#/informe?mes=${e.target.value}`));
  main.addEventListener('click', (e) => {
    const it = e.target.closest('[data-href]');
    if (it) app.go(it.dataset.href);
  });
  $('[data-compartir]', main).onclick = async () => {
    const t = [
      `*Informe para socios · ${nombreMes(mes)}*${i.enCurso ? ` (a ${fdate(i.corte)})` : ''}`,
      '',
      '*Movimiento del mes*',
      `Prestado: ${money(i.prestado)} (${i.nNuevos} préstamo${i.nNuevos === 1 ? '' : 's'})`,
      `Cobrado: ${money(i.cobrado)} (${i.nPagos} pago${i.nPagos === 1 ? '' : 's'})`,
      `Ganancia pactada: ${money(i.pactada)} (intereses ${money(i.intereses)} + adicionales ${money(i.adicionales)})`,
      `Ganancia cobrada: ${money(i.gananciaCobrada)}`,
      `Gastos: − ${money(i.gastos)}`,
      `*Ganancia neta: ${money(i.gananciaNeta)}*`,
      `Retiros de ganancia: − ${money(i.retiros)}`,
      `Préstamos terminados: ${i.terminados}`,
      '',
      `*Estado al ${fdate(i.corte)}*`,
      `Capital base: ${money(r.capitalBase)}`,
      `Dinero en la calle: ${money(r.enCalle)}`,
      `Total deuda por cobrar: ${money(r.porCobrar)}`,
      `Disponible: ${money(r.disponible)}`,
      `Ganancia + adicionales (acumulada): ${money(r.gananciaTotal)}`,
      `Ganancia + capital: ${money(r.gananciaMasCapital)}`,
    ];
    if (i.socios.length) {
      t.push('', '*Socios* (parte de la ganancia neta según % de aporte)');
      i.socios.forEach((x) => t.push(`• ${x.socio.nombre}: base ${money(x.base)} (${pct(x.pct)}) → ${money(x.parteGanancia)}${x.aportes ? ` · aportó ${money(x.aportes)}` : ''}${x.retiros ? ` · retiró ${money(x.retiros)}` : ''}`));
    }
    const texto = t.join('\n');
    try {
      if (navigator.share) await navigator.share({ text: texto, title: 'Informe para socios' });
      else { await navigator.clipboard.writeText(texto); toast('Informe copiado'); }
    } catch { /* cancelado */ }
  };
}
