// Estadísticas, gráficas y proyecciones.
import { icon } from '../icons.js';
import { esc, money, today, addDays, addMonths, monthKey, fmonth, parseYmd, diffDays, avatarTone, initials } from '../utils.js';
import { resumenGeneral, gananciaPorMes, cobrosPorDia, prestadoPorMes, proyeccion, gastosPorMes, gananciaCobradaPorMes } from '../logic.js';
import { bars, donut } from '../charts.js';
import { getCliente } from '../store.js';
import { emptyState } from '../ui.js';
import { bindLista } from './prestamos.js';

export function render(app) {
  const s = app.state;
  const hoy = today();
  const r = resumenGeneral(s, hoy);
  const main = app.shell({ title: 'Estadísticas', tab: 'estadisticas' });
  if (!s.prestamos.length) {
    main.innerHTML = emptyState('chart', 'Aún no hay datos', 'Las gráficas aparecen cuando registres préstamos y cobros.');
    return;
  }

  // Cobros últimos 30 días
  const porDia = cobrosPorDia(s);
  const dias = Array.from({ length: 30 }, (_, i) => addDays(hoy, i - 29));
  const cobros30 = dias.map((d) => porDia[d] || 0);
  const total30 = cobros30.reduce((a, b) => a + b, 0);
  const total7 = cobros30.slice(-7).reduce((a, b) => a + b, 0);

  // Últimos 6 meses
  const meses = Array.from({ length: 6 }, (_, i) => monthKey(addMonths(hoy.slice(0, 7) + '-01', i - 5)));
  const gan = gananciaPorMes(r.calcs);
  const prest = prestadoPorMes(s);
  const cobMes = {};
  for (const [d, v] of Object.entries(porDia)) cobMes[monthKey(d)] = (cobMes[monthKey(d)] || 0) + v;
  const mesActual = monthKey(hoy);
  const gxm = gastosPorMes(s);
  const gcm = gananciaCobradaPorMes(s);
  const gMes = gxm[mesActual] || { gastos: 0, retiros: 0 };
  const ganCobMes = gcm[mesActual] || 0;

  // Proyección 8 semanas
  const fin = addDays(hoy, 55);
  const semanas = Array(8).fill(0);
  let prox7 = 0, prox30 = 0;
  for (const c of r.activos) {
    for (const [f, v] of Object.entries(proyeccion(c, hoy, fin))) {
      const d = diffDays(f, hoy);
      semanas[Math.min(7, Math.floor(d / 7))] += v;
      if (d < 7) prox7 += v;
      if (d < 30) prox30 += v;
    }
  }
  const labelsSem = semanas.map((_, i) => (i === 0 ? 'Esta' : `${parseYmd(addDays(hoy, i * 7)).getDate()}/${parseYmd(addDays(hoy, i * 7)).getMonth() + 1}`));

  // Estado de la cartera
  const grupos = [
    ['Al día', ['al_dia'], 'var(--ok)'],
    ['Cobran hoy', ['hoy'], 'var(--info)'],
    ['Atrasados', ['atrasado'], 'var(--warn)'],
    ['Plazo vencido', ['vencido'], 'var(--danger)'],
  ].map(([label, est, color]) => {
    const cs = r.activos.filter((c) => est.includes(c.estado));
    return { label, color, value: cs.length, sub: `${cs.length} · ${money(cs.reduce((a, c) => a + c.saldo, 0))}` };
  });

  const topMora = [...r.activos].filter((c) => c.diasMora > 0).sort((a, b) => b.diasMora - a.diasMora).slice(0, 5);
  const recuperacion = r.gananciaPactada > 0 ? Math.round((r.gananciaCobrada / r.gananciaPactada) * 100) : 0;

  main.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="ico tone-ok">${icon('cash', 'sm')}</div><div class="v num">${money(cobMes[mesActual] || 0)}</div><div class="l">Cobrado este mes</div></div>
      <div class="kpi"><div class="ico tone-primary">${icon('wallet', 'sm')}</div><div class="v num">${money(prest[mesActual] || 0)}</div><div class="l">Prestado este mes</div></div>
      <div class="kpi"><div class="ico tone-violet">${icon('trending', 'sm')}</div><div class="v num">${money(gan[mesActual] || 0)}</div><div class="l">Ganancia del mes (pactada)</div></div>
      <div class="kpi"><div class="ico tone-info">${icon('target', 'sm')}</div><div class="v num">${money(prox30)}</div><div class="l">Por cobrar próximos 30 días</div></div>
    </div>

    <div class="card"><h3>Resultado del mes</h3>
      <dl class="kv">
        <dt>Ganancia cobrada</dt><dd style="color:var(--ok)">${money(ganCobMes)}</dd>
        <dt>Gastos</dt><dd style="color:var(--danger)">− ${money(gMes.gastos)}</dd>
        <dt><b>Ganancia neta</b></dt><dd><b>${money(ganCobMes - gMes.gastos)}</b></dd>
        <dt>Retiros de ganancia</dt><dd style="color:var(--violet)">− ${money(gMes.retiros)}</dd>
        <dt>Queda en el negocio</dt><dd>${money(ganCobMes - gMes.gastos - gMes.retiros)}</dd>
      </dl>
      <a class="btn sm" href="#/gastos" style="margin-top:12px">${icon('cash', 'sm')} Ver gastos y retiros</a>
    </div>

    <div class="card"><h3>Cobros · últimos 30 días</h3>
      <div class="row between small" style="margin-bottom:8px"><span class="muted">Últimos 7 días <b style="color:var(--text)">${money(total7)}</b></span><span class="muted">30 días <b style="color:var(--text)">${money(total30)}</b></span></div>
      ${bars({ labels: dias.map((d) => String(parseYmd(d).getDate())), series: [{ name: 'Cobrado', color: 'var(--primary)', values: cobros30 }], labelEvery: 5, highlightLast: true })}
    </div>

    <div class="card"><h3>Proyección de cobros · 8 semanas</h3>
      <div class="row between small" style="margin-bottom:8px"><span class="muted">Próximos 7 días <b style="color:var(--text)">${money(prox7)}</b></span><span class="muted">Total por cobrar <b style="color:var(--text)">${money(r.porCobrar)}</b></span></div>
      ${bars({ labels: labelsSem, series: [{ name: 'Esperado', color: 'var(--info)', values: semanas }] })}
      <p class="tiny muted" style="margin:8px 0 0">Según el plan de cuotas de cada préstamo. “Esta” incluye lo atrasado.</p>
    </div>

    <div class="card"><h3>Últimos 6 meses</h3>
      ${bars({ labels: meses.map(fmonth), series: [
        { name: 'Prestado', color: 'var(--text-3)', values: meses.map((m) => prest[m] || 0) },
        { name: 'Cobrado', color: 'var(--primary)', values: meses.map((m) => cobMes[m] || 0) },
        { name: 'Ganancia pactada', color: 'var(--violet)', values: meses.map((m) => gan[m] || 0) },
        { name: 'Gastos', color: 'var(--danger)', values: meses.map((m) => gxm[m]?.gastos || 0) },
      ] })}
    </div>

    <div class="card"><h3>Estado de la cartera</h3>
      ${donut({ segments: grupos, center: String(r.activos.length), centerSub: 'activos' })}
    </div>

    <div class="card"><h3>Ganancias</h3>
      <dl class="kv">
        <dt>Ganancia pactada (total)</dt><dd>${money(r.gananciaPactada)}</dd>
        <dt>Ganancia ya cobrada</dt><dd>${money(r.gananciaCobrada)}</dd>
        <dt>Capital en la calle</dt><dd>${money(r.enCalle)}</dd>
        <dt>Por cobrar (capital + interés)</dt><dd>${money(r.porCobrar)}</dd>
      </dl>
      <div class="progress dark" style="margin-top:14px"><i style="width:${Math.min(100, recuperacion)}%"></i></div>
      <div class="tiny muted">${recuperacion}% de la ganancia pactada ya está cobrada</div>
    </div>

    ${topMora.length ? `<div class="section-title">Mayor mora</div><div class="list">${topMora.map((c) => {
      const n = getCliente(c.p.clienteId)?.nombre || '—';
      return `<div class="item" data-href="#/prestamo/${c.p.id}"><div class="avatar ${avatarTone(n)}">${esc(initials(n))}</div>
        <div class="grow"><div class="t ellipsis">${esc(n)}</div><div class="s">${c.diasMora} días · debe ${money(c.atraso)}</div></div>
        <div class="end"><span class="amt num">${money(c.saldo)}</span></div></div>`;
    }).join('')}</div>` : ''}`;
  bindLista(main, app);
}
