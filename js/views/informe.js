// Informe mensual para socios: movimiento del mes, reparto de la ganancia, estado al cierre. Se comparte por WhatsApp.
import { icon } from '../icons.js';
import { $, esc, money, today, addMonths, monthKey, parseYmd, fdate, avatarTone, initials, parseMoney } from '../utils.js';
import { informeMes } from '../logic.js';
import { sheet, toast, field, moneyField } from '../ui.js';

const dfMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const nombreMes = (mes) => dfMes.format(parseYmd(mes + '-01')).replace(/^./, (x) => x.toUpperCase());
const pctTxt = (x) => `${Math.round(x * 1000) / 10}`.replace('.', ',') + ' %';

export function render(app, _p, query) {
  const s = app.state;
  const hoy = today();
  const mesHoy = monthKey(hoy);
  const mes = /^\d{4}-\d{2}$/.test(query.mes || '') && query.mes <= mesHoy ? query.mes : mesHoy;
  const i = informeMes(s, mes, hoy);
  const r = i.r;
  const main = app.shell({ title: 'Informe para socios', back: '#/capital', tab: 'mas' });
  const fila = (label, valor, extra = '') => `<dt>${label}</dt><dd ${extra}>${valor}</dd>`;
  const participan = i.socios.filter((x) => x.participa);
  const guardan = i.socios.filter((x) => !x.participa);

  const itemSocio = (x) => `<div class="item" data-desc="${x.socio.id}">
      <div class="avatar ${avatarTone(x.socio.nombre)}">${esc(initials(x.socio.nombre))}</div>
      <div class="grow"><div class="t ellipsis">${esc(x.socio.nombre)} · ${pctTxt(x.pct)}</div>
        <div class="s">Ganancia ${money(x.parteGanancia)}${x.descuento ? ` · deuda − ${money(x.descuento)}` : ' · toca para descontar deuda'}</div></div>
      <div class="end"><span class="amt num" style="color:${x.aRecibir < 0 ? 'var(--danger)' : 'var(--ok)'}">${money(x.aRecibir)}</span><span class="small muted">a recibir</span></div></div>`;

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
      <div class="label">Ganancia neta a repartir</div>
      <div class="big num">${money(i.aRepartir)}</div>
      <div class="split">
        <div><span>Ganancia pactada</span><b class="num">${money(i.pactada)}</b><span>intereses + adicionales</span></div>
        <div><span>Gastos</span><b class="num">− ${money(i.gastos)}</b><span>del mes</span></div>
      </div>
    </div>
    <div class="btn-row" style="margin-bottom:14px">
      <button class="btn primary" data-compartir>${icon('share', 'sm')} Compartir</button>
      <a class="btn" href="#/reporte?desde=${mes.slice(0, 4)}-01&hasta=${mes}">${icon('download', 'sm')} Reporte PDF</a>
    </div>

    <div class="section-title">Reparto de la ganancia</div>
    ${!i.repartoConfigurado
      ? `<div class="alert warn">${icon('alert')}<div class="grow small"><b>Falta asignar el % de ganancia de cada socio.</b>
          <p style="margin:4px 0 8px">En Capital y socios, entra a cada socio → editar (lápiz) y pon su %. Ejemplo: 50 y 50. A quien solo dejó dinero guardado, ponle 0.</p>
          <a class="btn sm" href="#/capital">${icon('bank', 'sm')} Ir a Capital y socios</a></div></div>`
      : `${i.sumaPct !== 100 ? `<div class="alert warn">${icon('alert')}<div class="grow small">Los % de los socios suman ${String(i.sumaPct).replace('.', ',')} %, no 100 %. Revísalos en Capital y socios.</div></div>` : ''}
        <div class="list">${participan.map(itemSocio).join('')}</div>
        <p class="tiny muted" style="margin:6px 4px 14px">Se reparte la ganancia <b>pactada</b> del mes menos los gastos. Toca un socio para descontarle lo que deba al negocio este mes.</p>`}

    <div class="card"><h3>Movimiento del mes</h3>
      <dl class="kv">
        ${fila('Prestado', `${money(i.prestado)} <span class="small muted">(${i.nNuevos})</span>`)}
        ${fila('Cobrado', `${money(i.cobrado)} <span class="small muted">(${i.nPagos})</span>`)}
        ${fila('Ganancia pactada', money(i.pactada))}
        ${fila('<span class="small muted">· Intereses de préstamos</span>', `<span class="small">${money(i.intereses)}</span>`)}
        ${fila(`<span class="small muted">· Adicionales (${i.nAdicionales})</span>`, `<span class="small">${money(i.adicionales)}</span>`)}
        ${fila('Gastos', '− ' + money(i.gastos), 'style="color:var(--danger)"')}
        ${fila('<b>Ganancia neta a repartir</b>', `<b>${money(i.aRepartir)}</b>`)}
        ${fila('Ganancia ya cobrada', money(i.gananciaCobrada), 'style="color:var(--ok)"')}
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

    ${guardan.length ? `<div class="section-title">Dinero guardado y otros aportes</div>
      <div class="list">${guardan.map((x) => `<div class="item" data-href="#/socio/${x.socio.id}">
        <div class="avatar ${avatarTone(x.socio.nombre)}">${esc(initials(x.socio.nombre))}</div>
        <div class="grow"><div class="t ellipsis">${esc(x.socio.nombre)}</div><div class="s">${x.socio.pctGanancia === undefined ? 'Sin % de ganancia asignado' : 'Sin derecho a ganancia'}${x.retiros ? ` · retiró ${money(x.retiros)}` : ''}</div></div>
        <div class="end"><span class="amt num">${money(x.base)}</span><span class="small muted">${x.socio.pctGanancia === undefined ? 'aporte' : 'guardado'}</span></div></div>`).join('')}</div>` : ''}`;

  $('[data-mes]', main).addEventListener('change', (e) => e.target.value && app.go(`#/informe?mes=${e.target.value}`));
  main.addEventListener('click', (e) => {
    const d = e.target.closest('[data-desc]');
    if (d) return abrirDescuento(app, i.socios.find((x) => x.socio.id === d.dataset.desc), mes);
    const it = e.target.closest('[data-href]');
    if (it) app.go(it.dataset.href);
  });
  $('[data-compartir]', main).onclick = () => compartir(i, mes);
}

/** Descuento por lo que el socio le debe al negocio (lo lleva la administradora en sus cuadernos). */
function abrirDescuento(app, x, mes) {
  const so = x.socio;
  const actual = so.descuentos?.[mes];
  sheet({
    title: `Descontar deuda · ${so.nombre}`,
    ico: 'arrowOut',
    tone: 'tone-warn',
    body: `<div class="summary">
        <div class="r"><span>Ganancia de ${esc(nombreMes(mes).toLowerCase())}</span><b>${money(x.parteGanancia)}</b></div>
      </div>
      ${moneyField('valor', 'Valor que debe y se le descuenta', actual?.valor || '', 'Déjalo vacío o en 0 si no debe nada este mes.')}
      ${field('Nota', `<input name="nota" value="${esc(actual?.nota || '')}" placeholder="Ej: préstamo del 24/06 (cuaderno)">`)}
      <div class="summary" data-res></div>
      <button class="btn primary block" data-ok>${icon('check', 'sm')} Guardar</button>`,
    onMount(el, api) {
      const inp = $('[name=valor]', el);
      const upd = () => {
        const v = parseMoney(inp.value) || 0;
        $('[data-res]', el).innerHTML = `<div class="r total"><span>Le queda por recibir</span><b style="color:${x.parteGanancia - v < 0 ? 'var(--danger)' : 'inherit'}">${money(x.parteGanancia - v)}</b></div>`;
      };
      inp.addEventListener('input', upd);
      upd();
      $('[data-ok]', el).onclick = async () => {
        const v = parseMoney(inp.value) || 0;
        so.descuentos ||= {};
        if (v > 0) so.descuentos[mes] = { valor: v, nota: $('[name=nota]', el).value.trim() };
        else delete so.descuentos[mes];
        await app.save();
        api.close();
        toast('Guardado');
        app.refresh();
      };
    },
  });
}

async function compartir(i, mes) {
  const r = i.r;
  const t = [`*Informe para socios · ${nombreMes(mes)}*${i.enCurso ? ` (a ${fdate(i.corte)})` : ''}`, ''];
  t.push(
    '*Ganancia del mes*',
    `Ganancia pactada: ${money(i.pactada)} (intereses ${money(i.intereses)} + adicionales ${money(i.adicionales)})`,
    `Gastos: − ${money(i.gastos)}`,
    `*Ganancia neta a repartir: ${money(i.aRepartir)}*`,
  );
  const participan = i.socios.filter((x) => x.participa);
  if (participan.length) {
    t.push('', '*Reparto*');
    participan.forEach((x) => {
      t.push(`• ${x.socio.nombre} (${pctTxt(x.pct)}): ${money(x.parteGanancia)}${x.descuento ? ` − deuda ${money(x.descuento)}${x.notaDescuento ? ` (${x.notaDescuento})` : ''} = *${money(x.aRecibir)}*` : ''}`);
    });
  }
  t.push(
    '',
    '*Movimiento del mes*',
    `Prestado: ${money(i.prestado)} (${i.nNuevos} préstamo${i.nNuevos === 1 ? '' : 's'})`,
    `Cobrado: ${money(i.cobrado)} (${i.nPagos} pago${i.nPagos === 1 ? '' : 's'})`,
    `Ganancia ya cobrada: ${money(i.gananciaCobrada)}`,
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
  );
  const guardan = i.socios.filter((x) => !x.participa && x.socio.pctGanancia !== undefined);
  if (guardan.length) {
    t.push('', '*Dinero guardado (sin ganancia)*');
    guardan.forEach((x) => t.push(`• ${x.socio.nombre}: ${money(x.base)}`));
  }
  const texto = t.join('\n');
  try {
    if (navigator.share) await navigator.share({ text: texto, title: 'Informe para socios' });
    else { await navigator.clipboard.writeText(texto); toast('Informe copiado'); }
  } catch { /* cancelado */ }
}
