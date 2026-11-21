// Lee la primera hoja de un .xlsx y devuelve filas de texto (mismo formato que UT.parseCSV: {rows:[[...]]}).
// Archivo externo = dato no confiable: se limita tamaño, filas y columnas, y se ignoran filas vacías.
const ExcelJS = require('exceljs');
const MAX_BYTES = 20e6, MAX_FILAS = 50000, MAX_COLS = 60;

function celda(v) {
  if (v == null) return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return celda(v.result);                       // fórmula: usa el valor calculado
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('text' in v) return celda(v.text);                           // hipervínculo
    if ('error' in v) return '';
    return '';
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';   // coma decimal: UT.num no confunde 1.234 con mil doscientos
  return String(v).trim();
}

async function leerXlsx(buf) {
  const b = Buffer.from(buf);
  if (b.length > MAX_BYTES) return { err: 'El archivo supera los 20 MB' };
  if (b.length < 4 || b[0] !== 0x50 || b[1] !== 0x4b) return { err: 'El archivo no es un .xlsx válido' };
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(b); } catch (e) { return { err: 'No se pudo leer el .xlsx (¿está dañado o protegido con contraseña?)' }; }
  const ws = wb.worksheets[0];
  if (!ws) return { err: 'El archivo no tiene hojas' };
  if (ws.rowCount > MAX_FILAS) return { err: 'La hoja tiene demasiadas filas (máximo ' + MAX_FILAS + ')' };
  const cols = Math.min(ws.columnCount, MAX_COLS), rows = [];
  ws.eachRow({ includeEmpty: false }, row => {
    const r = [];
    for (let c = 1; c <= cols; c++) r.push(celda(row.getCell(c).value));
    if (r.some(x => x !== '')) rows.push(r);                         // saltea filas vacías
  });
  return { rows };
}
module.exports = { leerXlsx, MAX_BYTES, MAX_FILAS };
