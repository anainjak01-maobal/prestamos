// Tarjeta digital del cliente (como la tarjeta física): imagen para compartir y texto para WhatsApp.
import { money, num, fdate, today, waPhone } from './utils.js';
import { download } from './backup.js';

const W = 1080;
const PAD = 56;
const ROW = 66;
const BLUE = '#1e4fa8';
const BLUE_SOFT = '#e7effb';
const LINE = '#b9cdea';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja la tarjeta y devuelve el canvas. */
export function drawCard({ negocio, cliente, calc }) {
  const lineas = calc.lineas.filter((l) => !l.oculto);
  const headH = 470;
  const footH = 230;
  const H = headH + ROW * (lineas.length + 1) + footH;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;

  ctx.fillStyle = '#f3f6fb';
  ctx.fillRect(0, 0, W, H);
  rr(ctx, 24, 24, W - 48, H - 48, 36);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Encabezado
  rr(ctx, 24, 24, W - 48, 130, 36);
  ctx.fillStyle = BLUE;
  ctx.fill();
  ctx.fillRect(24, 110, W - 48, 44);
  ctx.fillStyle = '#fff';
  ctx.font = font(800, 44);
  ctx.fillText((negocio || 'Control de Cobros').toUpperCase(), PAD, 100);
  ctx.font = font(600, 26);
  ctx.globalAlpha = 0.85;
  ctx.textAlign = 'right';
  ctx.fillText(`Préstamo #${calc.p.id}`, W - PAD, 100);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;

  // Datos del cliente
  const c = calc.ciclo;
  const datos = [
    ['Nombre', cliente?.nombre || '—'],
    ['Cédula', cliente?.cedula || '—'],
    ['Dirección', [cliente?.direccion, cliente?.barrio].filter(Boolean).join(' · ') || '—'],
    ['Fecha', fdate(calc.p.fecha)],
  ];
  let y = 200;
  ctx.font = font(600, 27);
  for (const [k, v] of datos) {
    ctx.fillStyle = BLUE;
    ctx.fillText(`${k}:`, PAD, y);
    ctx.fillStyle = '#111';
    ctx.font = font(700, 30);
    ctx.fillText(String(v).slice(0, 44), PAD + 170, y);
    ctx.font = font(600, 27);
    y += 46;
  }
  // Cuota y total
  const boxY = 418;
  const bw = (W - PAD * 2 - 20) / 2;
  [[`CUOTA ${c.modalidad.toUpperCase()}`, money(calc.valorCuota)], ['TOTAL', money(c.total)]].forEach(([k, v], i) => {
    const x = PAD + i * (bw + 20);
    rr(ctx, x, boxY - 46, bw, 70, 16);
    ctx.fillStyle = BLUE_SOFT;
    ctx.fill();
    ctx.fillStyle = BLUE;
    ctx.font = font(700, 22);
    ctx.fillText(k, x + 18, boxY - 6);
    ctx.fillStyle = '#111';
    ctx.font = font(800, 30);
    ctx.textAlign = 'right';
    ctx.fillText(v, x + bw - 18, boxY - 4);
    ctx.textAlign = 'left';
  });

  // Tabla FECHA | ABONO | RESTA
  const tY = headH;
  const cols = [PAD, PAD + 330, W - PAD];
  ctx.fillStyle = BLUE_SOFT;
  ctx.fillRect(PAD - 12, tY, W - PAD * 2 + 24, ROW);
  ctx.fillStyle = BLUE;
  ctx.font = font(800, 26);
  ctx.fillText('FECHA', cols[0], tY + 43);
  ctx.textAlign = 'right';
  ctx.fillText('ABONO', cols[1] + 230, tY + 43);
  ctx.fillText('RESTA', cols[2], tY + 43);
  ctx.textAlign = 'left';
  lineas.forEach((l, i) => {
    const ry = tY + ROW * (i + 1);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD - 12, ry + ROW);
    ctx.lineTo(W - PAD + 12, ry + ROW);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = font(600, 28);
    ctx.fillText(fdate(l.fecha), cols[0], ry + 43);
    ctx.textAlign = 'right';
    if (l.abono) {
      ctx.fillStyle = '#15803d';
      ctx.font = font(800, 30);
      ctx.fillText(num(l.abono), cols[1] + 230, ry + 43);
    } else if (l.cargo) {
      ctx.fillStyle = '#b91c1c';
      ctx.font = font(700, 22);
      const etiqueta = l.tipo === 'prestamo' ? 'Préstamo' : l.tipo === 'renovacion' ? '+ Nuevo interés' : l.tipo === 'interes' ? `+ Interés ${num(l.cargo)}` : `+ ${num(l.cargo)}`;
      ctx.fillText(etiqueta, cols[1] + 230, ry + 42);
    }
    ctx.fillStyle = '#111';
    ctx.font = font(800, 30);
    ctx.fillText(num(Math.max(0, l.saldo)), cols[2], ry + 43);
    ctx.textAlign = 'left';
  });

  // Pie
  const fy = tY + ROW * (lineas.length + 1) + 40;
  rr(ctx, PAD - 12, fy, W - PAD * 2 + 24, 110, 22);
  ctx.fillStyle = calc.saldo > 0 ? BLUE : '#15803d';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = font(700, 28);
  ctx.fillText(calc.saldo > 0 ? 'SALDO PENDIENTE' : 'PAZ Y SALVO', PAD + 14, fy + 66);
  ctx.textAlign = 'right';
  ctx.font = font(850, 46);
  ctx.fillText(money(calc.saldo), W - PAD - 14, fy + 72);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6b7a90';
  ctx.font = font(500, 22);
  ctx.fillText(`Generado el ${fdate(today())}`, PAD, fy + 160);
  return cv;
}

export const canvasBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

/** Comparte la imagen (WhatsApp, etc.) o la descarga. */
export async function shareCardImage(cv, cliente) {
  const blob = await canvasBlob(cv);
  const name = `tarjeta-${(cliente?.nombre || 'cliente').replace(/[^\w]+/g, '-').toLowerCase()}-${today()}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Estado de cuenta' });
      return 'compartido';
    } catch (e) {
      if (e?.name === 'AbortError') return null;
    }
  }
  download(blob, name);
  return 'descarga';
}

/** Texto del estado de cuenta para enviar por WhatsApp. */
export function textoEstadoCuenta({ negocio, cliente, calc, ultimos = 8 }) {
  const lineas = calc.lineas.filter((l) => !l.oculto && l.tipo !== 'prestamo');
  const ult = lineas.slice(-ultimos);
  const out = [];
  out.push(`*${negocio || 'Control de Cobros'}*`);
  out.push(`Hola ${cliente?.nombre || ''}, este es el estado de su cuenta:`);
  out.push('');
  out.push(`Préstamo #${calc.p.id} del ${fdate(calc.p.fecha)}`);
  out.push(`Total: ${money(calc.ciclo.total)} · Cuota ${calc.ciclo.modalidad.toLowerCase()}: ${money(calc.valorCuota)}`);
  if (ult.length) {
    out.push('');
    out.push(lineas.length > ult.length ? `Últimos ${ult.length} movimientos:` : 'Movimientos:');
    for (const l of ult) {
      if (l.abono) out.push(`• ${fdate(l.fecha)}  abono ${money(l.abono)}  → resta ${money(Math.max(0, l.saldo))}`);
      else if (l.cargo) out.push(`• ${fdate(l.fecha)}  ${l.tipo === 'interes' ? 'interés adicional' : 'cargo'} +${money(l.cargo)}  → resta ${money(Math.max(0, l.saldo))}`);
    }
  }
  out.push('');
  out.push(calc.saldo > 0 ? `*Saldo pendiente: ${money(calc.saldo)}*` : '*¡Está a paz y salvo! Gracias.*');
  return out.join('\n');
}

export function openWhatsApp(tel, texto, indicativo) {
  const t = waPhone(tel, indicativo);
  const url = `https://wa.me/${t}?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank', 'noopener');
}
