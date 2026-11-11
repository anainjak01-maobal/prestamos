// Lógica de negocio: plan de cuotas, saldo, estado, intereses adicionales, ganancias y proyecciones.
//
// Un préstamo guarda sus condiciones iniciales y una lista de movimientos (p.movs):
//   pago             { valor }                       → resta al saldo
//   interes          { valor, pct, base }            → interés sobre interés: suma al saldo
//   interes_omitido  { }                             → el usuario decidió no aplicar el interés que tocaba
//   ajuste           { valor (+/-) }                 → corrección manual del saldo
//   renovacion       { valor, interesPagado, abonoCapital, ciclo:{tasa,nCuotas,valorCuota,modalidad,cobraDomingos} }
//                    → el cliente paga interés + abono a capital; el saldo que queda pasa a ser el capital
//                      de un ciclo nuevo y se le calcula de nuevo el interés y las cuotas.
import { addDays, addMonths, isSunday, diffDays, today, monthKey, sum } from './utils.js';

export const MODALIDADES = ['Diario', 'Semanal', 'Quincenal', 'Mensual'];
export const CUOTAS_DEFECTO = { Diario: 30, Semanal: 4, Quincenal: 2, Mensual: 1 };

export const ESTADOS = {
  al_dia: { txt: 'Al día', cls: 'b-ok' },
  hoy: { txt: 'Cobra hoy', cls: 'b-info' },
  atrasado: { txt: 'Atrasado', cls: 'b-warn' },
  vencido: { txt: 'Plazo vencido', cls: 'b-danger' },
  pagado: { txt: 'Pagado', cls: 'b-muted' },
  anulado: { txt: 'Anulado', cls: 'b-muted' },
};

export const interesDe = (capital, tasa) => Math.round((capital * tasa) / 100);

/** Cuota sugerida: total / n, redondeada hacia arriba a múltiplos de 100. */
export function cuotaSugerida(capital, tasa, n) {
  const total = capital + interesDe(capital, tasa);
  if (!n || n < 1) return total;
  const c = total / n;
  return total >= 10000 ? Math.ceil(c / 100) * 100 : Math.ceil(c);
}

/** Fechas de cobro a partir de la fecha de inicio (la primera cuota es un periodo después). */
export function generarFechas(inicio, modalidad, n, cobraDomingos = true) {
  const out = [];
  n = Math.min(Math.max(0, n | 0), 3000);
  if (modalidad === 'Diario') {
    let d = inicio;
    while (out.length < n) {
      d = addDays(d, 1);
      if (!cobraDomingos && isSunday(d)) continue;
      out.push(d);
    }
    return out;
  }
  for (let i = 1; i <= n; i++) {
    let d = modalidad === 'Semanal' ? addDays(inicio, 7 * i)
      : modalidad === 'Quincenal' ? addDays(inicio, 15 * i)
      : addMonths(inicio, i);
    if (!cobraDomingos && isSunday(d)) d = addDays(d, 1);
    out.push(d);
  }
  return out;
}

const ordenMovs = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.ts || 0) - (b.ts || 0));

/** Fecha en que toca el interés adicional número k (0 = al día siguiente de vencer el plazo; luego cada mes). */
export function fechaInteresAdicional(fechaFin, k) {
  return addDays(k === 0 ? fechaFin : addMonths(fechaFin, k), 1);
}

/** Calcula todo lo de un préstamo a la fecha `hoy`. */
export function calcular(p, hoy = today(), cfg = {}) {
  const movs = [...(p.movs || [])].sort(ordenMovs);
  const mkCiclo = (inicio, capital, d, ref) => {
    const interes = interesDe(capital, d.tasa);
    return {
      inicio, capital, tasa: d.tasa, nCuotas: d.nCuotas, valorCuota: d.valorCuota,
      modalidad: d.modalidad, cobraDomingos: d.cobraDomingos !== false,
      interes, total: capital + interes, ref, pagado: 0, extra: 0, decisiones: 0,
    };
  };
  const ciclos = [mkCiclo(p.fecha, p.capital, p, null)];
  let saldo = ciclos[0].total;
  let pagado = 0, adicionales = 0, ajustes = 0;
  const lineas = [{ fecha: p.fecha, tipo: 'prestamo', cargo: saldo, saldo, nota: `Préstamo: capital + ${p.tasa}% interés` }];

  for (const m of movs) {
    const c = ciclos[ciclos.length - 1];
    const v = Math.round(m.valor || 0);
    if (m.tipo === 'pago') {
      saldo -= v; pagado += v; c.pagado += v;
      lineas.push({ fecha: m.fecha, tipo: 'pago', abono: v, saldo, nota: m.nota, mov: m });
    } else if (m.tipo === 'interes') {
      saldo += v; adicionales += v; c.extra += v; c.decisiones++;
      lineas.push({ fecha: m.fecha, tipo: 'interes', cargo: v, saldo, nota: m.nota || `Interés adicional ${m.pct ?? ''}%`, mov: m });
    } else if (m.tipo === 'interes_omitido') {
      c.decisiones++;
      lineas.push({ fecha: m.fecha, tipo: 'interes_omitido', saldo, nota: m.nota || 'Interés adicional no aplicado', mov: m, oculto: true });
    } else if (m.tipo === 'ajuste') {
      saldo += v; ajustes += v; c.extra += v;
      lineas.push({ fecha: m.fecha, tipo: 'ajuste', [v >= 0 ? 'cargo' : 'abono']: Math.abs(v), saldo, nota: m.nota || 'Ajuste', mov: m });
    } else if (m.tipo === 'renovacion') {
      saldo -= v; pagado += v; c.pagado += v;
      lineas.push({ fecha: m.fecha, tipo: 'pago', abono: v, saldo, nota: 'Pago de interés + abono a capital', mov: m });
      const nc = mkCiclo(m.fecha, Math.max(0, saldo), m.ciclo || p, m);
      ciclos.push(nc);
      saldo = nc.total;
      lineas.push({ fecha: m.fecha, tipo: 'renovacion', cargo: nc.interes, saldo, nota: `Nuevo capital ${nc.capital.toLocaleString('es-CO')} + ${nc.tasa}% interés`, mov: m });
    }
  }

  const c = ciclos[ciclos.length - 1];
  const vc = Math.max(1, Math.round(c.valorCuota || c.total));
  const totalCiclo = c.total + c.extra;
  const fechasPlan = generarFechas(c.inicio, c.modalidad, c.nCuotas, c.cobraDomingos);
  const fechaFin = fechasPlan[fechasPlan.length - 1] || c.inicio;
  // Si el saldo creció (intereses adicionales) el plan sigue con la misma cuota y la misma frecuencia.
  const nTotal = Math.max(c.nCuotas, Math.ceil(totalCiclo / vc));
  const fechas = nTotal > fechasPlan.length ? generarFechas(c.inicio, c.modalidad, nTotal, c.cobraDomingos) : fechasPlan;

  const anulado = p.estado === 'anulado';
  const activo = !anulado && saldo > 0;
  const debidas = fechas.filter((f) => f <= hoy).length;
  const esperado = Math.min(debidas * vc, totalCiclo);
  const atraso = activo ? Math.max(0, Math.min(saldo, esperado - c.pagado)) : 0;
  const cubiertas = Math.min(fechas.length, Math.floor(Math.max(0, c.pagado) / vc));
  const proxima = activo ? (fechas[cubiertas] || fechas[fechas.length - 1]) : null;
  const diasMora = activo && proxima && proxima < hoy ? diffDays(hoy, proxima) : 0;
  const vencido = activo && hoy > fechaFin;

  let estado = 'al_dia';
  if (anulado) estado = 'anulado';
  else if (saldo <= 0) estado = 'pagado';
  else if (vencido) estado = 'vencido';
  else if (diasMora > 0) estado = 'atrasado';
  else if (proxima === hoy) estado = 'hoy';

  // Interés sobre interés: al vencer el plazo y luego cada mes, mientras siga debiendo.
  let interesPendiente = null;
  if (vencido) {
    let vencimientos = 0;
    for (let k = 0; k < 600; k++) {
      if (fechaInteresAdicional(fechaFin, k) > hoy) break;
      vencimientos++;
    }
    if (vencimientos > c.decisiones) {
      const pct = cfg.tasaAdicional ?? 20;
      interesPendiente = {
        numero: c.decisiones + 1,
        fecha: fechaInteresAdicional(fechaFin, c.decisiones),
        base: saldo,
        pct,
        valor: interesDe(saldo, pct),
        pendientes: vencimientos - c.decisiones,
      };
    }
  }

  // Lo que cobra hoy: lo atrasado + la cuota de hoy (ya incluida en "atraso" porque vence <= hoy).
  const aCobrarHoy = atraso;
  const cuotaSugeridaHoy = activo ? Math.min(saldo, atraso > 0 ? atraso : vc) : 0;

  // Los pagos se aplican primero al capital del ciclo actual (como el Excel: ganancia = pagado - capital).
  const capitalPendiente = activo ? Math.min(p.capital, Math.max(0, c.capital - c.pagado)) : 0;
  const gananciaCobrada = anulado ? 0 : Math.max(0, pagado - (p.capital - capitalPendiente));
  const interesesPactados = anulado ? 0 : sum(ciclos, (x) => x.interes) + adicionales;

  return {
    p, ciclos, ciclo: c, lineas, saldo: Math.max(0, saldo), saldoReal: saldo,
    pagado, adicionales, ajustes, totalCiclo, valorCuota: vc,
    fechas, fechasPlan, fechaFin, debidas, cubiertas, atraso, aCobrarHoy, cuotaSugeridaHoy,
    proxima, diasMora, vencido, estado, activo, interesPendiente,
    capitalPendiente, gananciaCobrada, interesesPactados,
    progreso: pagado + Math.max(0, saldo) > 0 ? pagado / (pagado + Math.max(0, saldo)) : 1,
  };
}

/** Lo que se espera cobrar por día entre `desde` y `hasta` (incluye lo atrasado en `desde`). */
export function proyeccion(calc, desde, hasta) {
  const out = {};
  if (!calc.activo) return out;
  const { fechas, valorCuota: vc, totalCiclo, ciclo, saldo } = calc;
  let restante = saldo;
  if (calc.atraso > 0) {
    out[desde] = Math.min(restante, calc.atraso);
    restante -= out[desde];
  }
  let acumuladoPrevio = Math.min(fechas.filter((f) => f <= desde).length * vc, totalCiclo);
  for (const f of fechas) {
    if (f <= desde) continue;
    if (f > hasta || restante <= 0) break;
    const acum = Math.min(fechas.filter((x) => x <= f).length * vc, totalCiclo);
    let monto = acum - Math.max(acumuladoPrevio, ciclo.pagado);
    acumuladoPrevio = Math.max(acumuladoPrevio, acum);
    if (monto <= 0) continue;
    monto = Math.min(monto, restante);
    out[f] = (out[f] || 0) + monto;
    restante -= monto;
  }
  return out;
}

/** Resumen general de la cartera y el capital. */
export function resumenGeneral(state, hoy = today()) {
  const calcs = state.prestamos.map((p) => calcular(p, hoy, state.config));
  const activos = calcs.filter((c) => c.activo);
  const pagosHoy = [];
  for (const c of calcs) {
    for (const m of c.p.movs || []) {
      if ((m.tipo === 'pago' || m.tipo === 'renovacion') && m.fecha === hoy) pagosHoy.push(m);
    }
  }
  const capitalBase = sum(state.socios, (s) => saldoSocio(s));
  const enCalle = sum(activos, (c) => c.capitalPendiente);
  const gananciaCobrada = sum(calcs, (c) => c.gananciaCobrada);
  return {
    calcs,
    activos,
    porCobrar: sum(activos, (c) => c.saldo),
    enCalle,
    aCobrarHoy: sum(activos, (c) => c.aCobrarHoy),
    cobradoHoy: sum(pagosHoy, (m) => m.valor),
    nCobrarHoy: activos.filter((c) => c.aCobrarHoy > 0).length,
    atrasados: activos.filter((c) => c.estado === 'atrasado' || c.estado === 'vencido'),
    interesesPendientes: activos.filter((c) => c.interesPendiente),
    gananciaCobrada,
    gananciaPactada: sum(calcs, (c) => c.interesesPactados),
    capitalBase,
    disponible: capitalBase + gananciaCobrada - enCalle,
  };
}

/** Ganancia pactada por mes (interés al prestar o renovar + intereses adicionales), como la hoja GANANCIAS. */
export function gananciaPorMes(calcs) {
  const out = {};
  for (const c of calcs) {
    if (c.p.estado === 'anulado') continue;
    for (const ci of c.ciclos) out[monthKey(ci.inicio)] = (out[monthKey(ci.inicio)] || 0) + ci.interes;
    for (const m of c.p.movs || []) if (m.tipo === 'interes') out[monthKey(m.fecha)] = (out[monthKey(m.fecha)] || 0) + (m.valor || 0);
  }
  return out;
}

/** Cobros (pagos recibidos) por día. */
export function cobrosPorDia(state) {
  const out = {};
  for (const p of state.prestamos) {
    if (p.estado === 'anulado') continue;
    for (const m of p.movs || []) {
      if (m.tipo === 'pago' || m.tipo === 'renovacion') out[m.fecha] = (out[m.fecha] || 0) + (m.valor || 0);
    }
  }
  return out;
}

/** Préstamos (capital) entregados por mes. */
export function prestadoPorMes(state) {
  const out = {};
  for (const p of state.prestamos) {
    if (p.estado === 'anulado') continue;
    out[monthKey(p.fecha)] = (out[monthKey(p.fecha)] || 0) + p.capital;
  }
  return out;
}

// ---- Capital de socios ----
export function movsSocio(s) {
  const movs = [...(s.movs || [])].sort(ordenMovs);
  let saldo = 0;
  return movs.map((m) => {
    saldo += m.tipo === 'retiro' ? -m.valor : m.valor;
    return { ...m, saldo };
  });
}
export const saldoSocio = (s) => sum(s.movs || [], (m) => (m.tipo === 'retiro' ? -m.valor : m.valor));
