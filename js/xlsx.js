// Archivo de Excel (.xlsx) hecho a mano, sin librerías (funciona sin internet).
// Un .xlsx es un ZIP con varios XML. Aquí se arma el ZIP sin comprimir ("store"), que Excel, Google Sheets
// y las apps del teléfono abren sin problema.
//
// hojas = [{ nombre, columnas: [{ titulo, tipo: 'texto'|'numero'|'dinero'|'fecha'|'pct', ancho }], filas: [[...]] }]
// Las fechas van como 'AAAA-MM-DD' y se guardan como fecha real de Excel (se pueden ordenar y filtrar).

const enc = new TextEncoder();

// ---- CRC32 (lo pide el formato ZIP) ----
const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP sin compresión. archivos = [{ nombre, datos: Uint8Array }] */
function zip(archivos) {
  const partes = [];
  const central = [];
  let offset = 0;
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  for (const f of archivos) {
    const nombre = enc.encode(f.nombre);
    const crc = crc32(f.datos);
    const tam = f.datos.length;
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint16(10, hora, true); loc.setUint16(12, dia, true); loc.setUint32(14, crc, true);
    loc.setUint32(18, tam, true); loc.setUint32(22, tam, true); loc.setUint16(26, nombre.length, true); loc.setUint16(28, 0, true);
    partes.push(new Uint8Array(loc.buffer), nombre, f.datos);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, hora, true); cen.setUint16(14, dia, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, tam, true); cen.setUint32(24, tam, true); cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nombre);
    offset += 30 + nombre.length + tam;
  }
  const tamCentral = central.reduce((a, b) => a + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const xml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // Excel no acepta caracteres de control en el XML
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function colLetra(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** 'AAAA-MM-DD' → número de serie de Excel */
function serialFecha(f) {
  const [y, m, d] = String(f).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

// Estilos: 0 normal, 1 encabezado (negrita con fondo), 2 fecha, 3 dinero, 4 porcentaje
const ESTILO = { texto: 0, numero: 0, fecha: 2, dinero: 3, pct: 4 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;$&quot;\\ #,##0"/><numFmt numFmtId="166" formatCode="0.##&quot;%&quot;"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E8F82"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function hojaXml({ columnas, filas }) {
  const celda = (v, c, ref) => {
    if (v == null || v === '') return '';
    const tipo = c?.tipo || 'texto';
    if (tipo === 'fecha') {
      const n = serialFecha(v);
      if (n != null) return `<c r="${ref}" s="2"><v>${n}</v></c>`;
    }
    if ((tipo === 'numero' || tipo === 'dinero' || tipo === 'pct') && typeof v === 'number' && isFinite(v)) {
      return `<c r="${ref}" s="${ESTILO[tipo]}"><v>${v}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  const filasXml = [];
  filasXml.push(`<row r="1">${columnas.map((c, i) => `<c r="${colLetra(i)}1" s="1" t="inlineStr"><is><t>${xml(c.titulo)}</t></is></c>`).join('')}</row>`);
  filas.forEach((f, ri) => {
    const r = ri + 2;
    filasXml.push(`<row r="${r}">${f.map((v, ci) => celda(v, columnas[ci], `${colLetra(ci)}${r}`)).join('')}</row>`);
  });
  const anchos = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || (c.tipo === 'fecha' ? 12 : c.tipo === 'dinero' ? 14 : 16)}" customWidth="1"/>`).join('');
  const ultima = `${colLetra(Math.max(0, columnas.length - 1))}${filas.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${anchos}</cols>
<sheetData>${filasXml.join('')}</sheetData>
${filas.length ? `<autoFilter ref="A1:${ultima}"/>` : ''}
</worksheet>`;
}

/** Crea el .xlsx y lo devuelve como Blob. */
export function crearXlsx(hojas) {
  const nombres = [];
  const limpio = (n, i) => {
    let s = String(n || `Hoja${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || `Hoja${i + 1}`;
    while (nombres.includes(s)) s = `${s.slice(0, 28)} ${i + 1}`;
    nombres.push(s);
    return s;
  };
  const hs = hojas.map((h, i) => ({ ...h, nombre: limpio(h.nombre, i) }));
  const archivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${hs.map((h, i) => `<sheet name="${xml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${hs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ['xl/styles.xml', STYLES],
    ...hs.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)]),
  ];
  return zip(archivos.map(([nombre, txt]) => ({ nombre, datos: enc.encode(txt) })));
}
