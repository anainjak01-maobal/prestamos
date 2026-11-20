// Exportar a Excel (.xlsx): préstamos, pagos y movimientos, clientes, gastos y socios.
// A diferencia del respaldo, este archivo NO está cifrado: es para revisar en la PC o mandárselo a un socio.
import { icon } from '../icons.js';
import { $, esc, today, fdate, monthKey } from '../utils.js';
import { calcular, resumenGeneral, ESTADOS, calificarCliente, saldoSocio, saldoDeudaSocio, esTransferencia } from '../logic.js';
import { sheet, toast, field, segHtml, segValue } from '../ui.js';
import { crearXlsx } from '../xlsx.js';
import { download } from '../backup.js';

const TIPO_MOV = { pago: 'Pago', renovacion: 'Interés + abono a capital', interes: 'Interés adicional', ajuste: 'Ajuste' };

/** Arma las hojas del libro. rango = { desde: 'AAAA-MM', hasta: 'AAAA-MM' } o null (todo). */
export function hojasExcel(state, rango = null, hoy = today()) {
  const d = rango ? `${rango.desde}-01` : null;
  const h = rango ? `${rango.hasta}-31` : null;
  const enRango = (f) => !rango || (f >= d && f <= h);
  const cfg = state.config || {};
  const clientes = new Map(state.clientes.map((c) => [c.id, c]));
  const nombre = (id) => clientes.get(id)?.nombre || '';
  const socios = new Map(state.socios.map((s) => [s.id, s]));
  const calcs = state.prestamos.map((p) => calcular(p, hoy, cfg));
  const r = resumenGeneral(state, hoy);

  // ---- Movimientos de los préstamos
  const movs = [];
  for (const c of calcs) {
    if (c.p.estado === 'anulado') continue;
    const saldoDe = new Map(c.lineas.filter((l) => l.mov).map((l) => [l.mov.id, l.saldo]));
    for (const m of c.p.movs || []) {
      if (!TIPO_MOV[m.tipo] || !enRango(m.fecha)) continue;
      const abono = m.tipo === 'pago' || m.tipo === 'renovacion' ? m.valor : m.tipo === 'ajuste' && m.valor < 0 ? -m.valor : null;
      const cargo = m.tipo === 'interes' || (m.tipo === 'ajuste' && m.valor > 0) ? m.valor : null;
      const esPago = m.tipo === 'pago' || m.tipo === 'renovacion';
      movs.push({
        orden: `${m.fecha}|${String(m.ts || 0).padStart(15, '0')}`,
        fila: [m.fecha, nombre(c.p.clienteId), c.p.id, TIPO_MOV[m.tipo], abono, cargo,
          saldoDe.has(m.id) ? Math.max(0, saldoDe.get(m.id)) : null,
          esPago ? (esTransferencia(m) ? 'Transferencia' : 'Efectivo') : '', m.cuenta || '', m.retirado || null,
          [m.nota && m.nota !== 'Importado del Excel' ? m.nota : m.nota === 'Importado del Excel' ? 'Importado del Excel (fecha aproximada)' : '', m.resumen ? 'resumen' : ''].filter(Boolean).join(' · ')],
      });
    }
  }
  movs.sort((a, b) => (a.orden < b.orden ? -1 : 1));
  const cobrado = movs.reduce((a, x) => a + (x.fila[3] === 'Pago' || x.fila[3] === 'Interés + abono a capital' ? x.fila[4] || 0 : 0), 0);

  // ---- Préstamos (con actividad en el rango, o todos)
  const prestamos = calcs.filter((c) => !rango || enRango(c.p.fecha) || (c.p.movs || []).some((m) => enRango(m.fecha)))
    .sort((a, b) => (a.p.fecha < b.p.fecha ? -1 : a.p.fecha > b.p.fecha ? 1 : a.p.id - b.p.id));
  const prestado = calcs.filter((c) => c.p.estado !== 'anulado' && enRango(c.p.fecha)).reduce((a, c) => a + c.p.capital, 0);

  // ---- Gastos y retiros
  const gastos = (state.gastos || []).filter((g) => enRango(g.fecha)).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const totGastos = gastos.filter((g) => g.tipo !== 'retiro').reduce((a, g) => a + g.valor, 0);
  const totRetiros = gastos.filter((g) => g.tipo === 'retiro').reduce((a, g) => a + g.valor, 0);

  const periodo = rango ? (rango.desde === rango.hasta ? rango.desde : `${rango.desde} a ${rango.hasta}`) : 'Todo';
  const dinero = (titulo, ancho) => ({ titulo, tipo: 'dinero', ancho });

  return [
    {
      nombre: 'Resumen',
      columnas: [{ titulo: 'Concepto', ancho: 38 }, { titulo: 'Valor', tipo: 'dinero', ancho: 18 }],
      filas: [
        ['Negocio', cfg.negocio || 'Control de Cobros'],
        ['Generado el', fdate(hoy)],
        ['Periodo', periodo],
        ['', ''],
        [`Cobrado en el periodo (${movs.filter((x) => x.fila[4] && (x.fila[3] === 'Pago' || x.fila[3] === 'Interés + abono a capital')).length} pagos)`, cobrado],
        ['Prestado en el periodo (capital)', prestado],
        ['Gastos en el periodo', totGastos],
        ['Retiros de ganancia en el periodo', totRetiros],
        ['', ''],
        ['Estado actual (hoy)', ''],
        ['Total deuda por cobrar', r.porCobrar],
        ['Capital en la calle', r.enCalle],
        ['Ganancia pactada (intereses + adicionales)', r.gananciaTotal],
        ['Ganancia cobrada', r.gananciaCobrada],
        ['Capital de los socios', r.capitalBase],
        ['Le deben los socios', r.deudaSocios || 0],
        ['Disponible (caja)', r.disponible],
        ['De eso, en cuentas por retirar', r.porRetirar || 0],
        ['Préstamos activos', String(r.activos.length)],
      ],
    },
    {
      nombre: 'Préstamos',
      columnas: [{ titulo: '#', tipo: 'numero', ancho: 7 }, { titulo: 'Cliente', ancho: 26 }, { titulo: 'Código', ancho: 10 }, { titulo: 'Fecha', tipo: 'fecha' },
        dinero('Capital'), { titulo: 'Interés %', tipo: 'pct', ancho: 10 }, dinero('Interés'), dinero('Total pactado'), { titulo: 'Modalidad', ancho: 11 },
        { titulo: 'Cuotas', tipo: 'numero', ancho: 8 }, dinero('Valor cuota'), dinero('Pagado'), dinero('Saldo'), { titulo: 'Estado', ancho: 14 },
        { titulo: 'Vence', tipo: 'fecha' }, { titulo: 'Días de mora', tipo: 'numero', ancho: 11 }, { titulo: 'Renovaciones', tipo: 'numero', ancho: 12 },
        dinero('Intereses adicionales'), dinero('Ganancia cobrada'), { titulo: 'Notas', ancho: 30 }],
      filas: prestamos.map((c) => [c.p.id, nombre(c.p.clienteId), clientes.get(c.p.clienteId)?.codigo || '', c.p.fecha,
        c.p.capital, c.p.tasa, c.ciclos[0].interes, c.ciclos[0].total, c.p.modalidad, c.p.nCuotas, c.p.valorCuota, c.pagado, c.saldo,
        ESTADOS[c.estado]?.txt || c.estado, c.activo ? c.fechaFin : null, c.activo ? c.diasMora : null, c.ciclos.length - 1,
        c.adicionales || null, c.gananciaCobrada, [c.p.cartonEliminado ? 'Cartón eliminado' : '', c.p.notas || ''].filter(Boolean).join(' · ')]),
    },
    {
      nombre: 'Pagos y movimientos',
      columnas: [{ titulo: 'Fecha', tipo: 'fecha' }, { titulo: 'Cliente', ancho: 26 }, { titulo: 'Préstamo #', tipo: 'numero', ancho: 11 }, { titulo: 'Tipo', ancho: 22 },
        dinero('Abono'), dinero('Cargo'), dinero('Saldo después'), { titulo: 'Medio', ancho: 13 }, { titulo: 'Cuenta', ancho: 12 },
        { titulo: 'Retirado de la cuenta', tipo: 'fecha', ancho: 18 }, { titulo: 'Nota', ancho: 34 }],
      filas: movs.map((x) => x.fila),
    },
    {
      nombre: 'Clientes',
      columnas: [{ titulo: 'Código', ancho: 10 }, { titulo: 'Nombre', ancho: 28 }, { titulo: 'Cédula', ancho: 14 }, { titulo: 'Teléfono', ancho: 14 },
        { titulo: 'Dirección', ancho: 24 }, { titulo: 'Barrio', ancho: 16 }, { titulo: 'Calificación', ancho: 16 }, { titulo: 'Préstamos activos', tipo: 'numero', ancho: 10 },
        dinero('Debe'), dinero('Total pagado'), { titulo: 'Préstamos en total', tipo: 'numero', ancho: 10 }, { titulo: 'No prestarle más', ancho: 30 }, { titulo: 'Notas', ancho: 30 }],
      filas: [...state.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((cl) => {
        const cs = calcs.filter((c) => c.p.clienteId === cl.id);
        const act = cs.filter((c) => c.activo);
        const cal = calificarCliente(cs, cfg, hoy);
        return [cl.codigo || '', cl.nombre, cl.cedula || '', cl.telefono || '', cl.direccion || '', cl.barrio || '', cal.txt, act.length,
          act.reduce((a, c) => a + c.saldo, 0), cs.reduce((a, c) => a + c.pagado, 0), cs.length,
          cl.noPrestar ? `Sí${cl.noPrestar.motivo ? ': ' + cl.noPrestar.motivo : ''}` : '', cl.notas || ''];
      }),
    },
    {
      nombre: 'Gastos y retiros',
      columnas: [{ titulo: 'Fecha', tipo: 'fecha' }, { titulo: 'Tipo', ancho: 18 }, { titulo: 'Categoría', ancho: 16 }, { titulo: 'Socio', ancho: 16 }, dinero('Valor'), { titulo: 'Nota', ancho: 34 }],
      filas: gastos.map((g) => [g.fecha, g.tipo === 'retiro' ? 'Retiro de ganancia' : 'Gasto', g.tipo === 'retiro' ? '' : g.categoria || '',
        g.socioId ? socios.get(g.socioId)?.nombre || '' : '', g.valor, g.nota || '']),
    },
    {
      nombre: 'Socios',
      columnas: [{ titulo: 'Socio', ancho: 20 }, { titulo: '% de la ganancia', tipo: 'pct', ancho: 16 }, dinero('Capital (aporte actual)', 22), dinero('Le debe al negocio', 18), { titulo: 'Notas', ancho: 34 }],
      filas: state.socios.map((s) => [s.nombre, typeof s.pctGanancia === 'number' ? s.pctGanancia : null, saldoSocio(s), saldoDeudaSocio(s) || null, s.notas || '']),
    },
  ];
}

/** Hoja para elegir el periodo y compartir o descargar el Excel. */
export function abrirExportar(app) {
  const mesHoy = monthKey(today());
  sheet({
    title: 'Exportar a Excel',
    ico: 'file',
    tone: 'tone-ok',
    body: `<p class="small muted" style="margin-top:-6px">Un archivo .xlsx con hojas de Resumen, Préstamos, Pagos y movimientos, Clientes, Gastos y Socios. Se abre en Excel, Google Sheets o en el teléfono.</p>
      <div class="field"><span class="lbl">¿Qué quieres exportar?</span>${segHtml('que', ['Todo', 'Por meses'], 'Todo')}</div>
      <div class="grid2" data-rango hidden>
        ${field('Desde', `<input type="month" name="desde" value="${mesHoy}" max="${mesHoy}">`)}
        ${field('Hasta', `<input type="month" name="hasta" value="${mesHoy}" max="${mesHoy}">`)}
      </div>
      <p class="tiny muted" data-nota-rango hidden>Con meses: salen los pagos, movimientos y gastos de esos meses, y los préstamos que tuvieron algo en esos meses. Clientes y socios salen completos.</p>
      <div class="alert warn">${icon('alert')}<div class="grow small">Este archivo <b>no tiene contraseña</b> y lleva nombres, cédulas y teléfonos. Compártelo solo con quien debe verlo. Para cambiar de teléfono usa el respaldo, no este archivo.</div></div>
      <div class="btn-row"><button class="btn" data-ok="descargar">${icon('download', 'sm')} Descargar</button><button class="btn primary" data-ok="compartir">${icon('share', 'sm')} Compartir</button></div>`,
    onMount(el, api) {
      const rangoEl = $('[data-rango]', el);
      const nota = $('[data-nota-rango]', el);
      const upd = () => { const m = segValue(el, 'que') === 'Por meses'; rangoEl.style.display = m ? '' : 'none'; nota.style.display = m ? '' : 'none'; };
      el.addEventListener('click', () => setTimeout(upd));
      upd();
      el.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = async () => {
        let rango = null;
        if (segValue(el, 'que') === 'Por meses') {
          const desde = $('[name=desde]', el).value;
          const hasta = $('[name=hasta]', el).value;
          if (!desde || !hasta) return toast('Elige los meses', 'err');
          rango = desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
        }
        let blob;
        try {
          blob = crearXlsx(hojasExcel(app.state, rango));
        } catch (e) {
          console.error(e);
          return toast('No se pudo crear el archivo: ' + e.message, 'err');
        }
        const nombreArchivo = `cobros-${rango ? (rango.desde === rango.hasta ? rango.desde : `${rango.desde}_a_${rango.hasta}`) : today()}.xlsx`;
        if (b.dataset.ok === 'compartir') {
          const file = new File([blob], nombreArchivo, { type: blob.type });
          if (navigator.canShare?.({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: 'Control de Cobros (Excel)' });
              api.close();
              return;
            } catch (e) {
              if (e?.name === 'AbortError') return;
            }
          }
          toast('Este navegador no puede compartir archivos: se descargó');
        }
        download(blob, nombreArchivo);
        api.close();
        toast(`Excel descargado: ${nombreArchivo}`);
      }));
    },
  });
}
