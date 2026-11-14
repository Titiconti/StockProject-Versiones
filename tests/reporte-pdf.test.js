const { JSDOM } = require('jsdom'), fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function boot(desktop, pdfResult = { ok: true }) {
  const calls = { print: 0, pdf: [] };
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.print = () => { calls.print++; };
    if (desktop) { let st = ''; w.sp = { load: () => st, save: s => { st = s; }, defaults: () => ({ demo: true }),
      info: async () => ({ dir: 'C:\\x', last: null, warn: '' }), now: async () => ({}), choose: async () => ({}), restore: async () => true,
      print: async () => ({ ok: true }), pdf: async (h, n) => { calls.pdf.push([h, n]); return pdfResult; } }; }
  } });
  // Estas pruebas no son de caja: se desactiva la exigencia de caja abierta (ver tests/caja.test.js).
  dom.window.eval('db.cfg.cajaObligatoria=false');
  return { w: dom.window, calls };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { w, calls } = boot(true), d = w.document, $ = s => d.querySelector(s), click = s => $(s).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  assert(!$('#csv'), 'ya no existe Exportar CSV'); assert.strictEqual($('#pdf').textContent, 'Exportar PDF');
  assert(/Último mes/.test($('#per').innerHTML));
  // Ventas: 3 hoy (efectivo, transferencia, efectivo), una de hace 3 días, una de hace 10, una de hace 40, y una anulada de hoy
  const sell = (pay, n) => { $('#pay').value = pay; for (let i = 0; i < n; i++) click('#prods .p:not([disabled])'); click('#cobrar'); };
  sell('Efectivo', 1); sell('Transferencia', 2); sell('Efectivo', 1);
  const total0 = w.eval('db.sales.map(s=>s.total)');
  sell('Efectivo', 1); // esta se anula
  w.eval('db.sales[3].void=true');
  sell('Efectivo', 1); sell('Efectivo', 1); sell('Transferencia', 1); // las voy a retrasar
  const back = (i, dias) => w.eval(`(()=>{const x=new Date();x.setDate(x.getDate()-${dias});db.sales[${i}].date=x.toISOString()})()`);
  back(4, 3); back(5, 10); back(6, 40);
  const rep = per => { $('#per').value = per; $('#per').dispatchEvent(new w.Event('change', { bubbles: true })); return w.eval('buildReport()'); };
  const sum = f => w.eval(`db.sales.filter(s=>!s.void&&(${f})).reduce((a,s)=>a+s.total,0)`);
  const fmt = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n).replace(/\s/g, ' ');
  const T = h => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ');
  // HOY: 3 ventas (la anulada no cuenta)
  let h = rep('0'), t = T(h);
  assert(/Resumen de ventas/.test(t) && /Hoy/.test(t), 'título y período');
  assert(t.includes(fmt(sum('new Date(s.date)>=new Date(new Date().setHours(0,0,0,0))'))), 'total de hoy');
  assert(/Cantidad de ventas 3 /.test(t), '3 ventas hoy'); assert(/Ventas anuladas en el período: 1/.test(t), 'avisa la anulada');
  assert(!/Ventas por día/.test(h), 'un solo día: sin tabla por día');
  assert(/Ventas por medio de pago/.test(h) && /Productos vendidos/.test(h) && /Detalle de ventas/.test(h));
  assert(/Efectivo/.test(t) && /Transferencia/.test(t));
  // 7 DÍAS: suma la de hace 3 días (no la de 10 ni 40)
  h = rep('7'); t = T(h); assert(/Cantidad de ventas 4 /.test(t), '4 ventas en 7 días'); assert(/Últimos 7 días/.test(t)); assert(/Ventas por día/.test(h), 'varios días: con tabla por día');
  // ÚLTIMO MES: suma la de hace 10
  h = rep('30'); t = T(h); assert(/Cantidad de ventas 5 /.test(t), '5 ventas en el mes'); assert(/Último mes \(30 días\)/.test(t));
  // TODO: las 6 no anuladas
  h = rep('9999'); t = T(h); assert(/Cantidad de ventas 6 /.test(t), '6 ventas en total'); assert(t.includes(fmt(sum('true'))), 'total histórico');
  assert(/Del \d\d\/\d\d\/\d{4} al \d\d\/\d\d\/\d{4}/.test(t), 'rango de fechas');
  // porcentajes de medios de pago suman ~100 %
  const pcts = [...h.matchAll(/(\d+,\d) %/g)].map(m => parseFloat(m[1].replace(',', '.')));
  assert(pcts.length > 0);
  // alertas de inventario (producto de ejemplo con stock bajo y lote por vencer)
  assert(/Alertas de inventario/.test(h) && /Pan lactal/.test(h) && /Lotes vencidos o que vencen/.test(h) && /Leche entera/.test(h), 'alertas');
  // sin ventas en el período
  w.eval('db.sales=[]'); h = rep('0'); assert(/No hay ventas en este período/.test(h)); assert(!/Detalle de ventas/.test(h));
  // exportar: manda el documento completo al programa de escritorio con nombre de archivo del período
  sell('Efectivo', 1); $('#per').value = '7'; click('#pdf'); await wait(100);
  assert.strictEqual(calls.pdf.length, 1); const [doc, name] = calls.pdf[0];
  assert(/^Resumen-ultimos-7-dias-\d{4}-\d\d-\d\d\.pdf$/.test(name), name); assert(/<!DOCTYPE html>/.test(doc) && /\.a4 \.kp/.test(doc) && /Resumen de ventas/.test(doc));
  assert(/PDF guardado/.test($('#toast').textContent));
  for (const [v, n] of [['0', 'hoy'], ['30', 'ultimo-mes'], ['9999', 'todo']]) { $('#per').value = v; click('#pdf'); await wait(50); assert(new RegExp('^Resumen-' + n + '-').test(calls.pdf.at(-1)[1])); }
  assert.deepStrictEqual(errs, []);

  // errores y cancelación
  { const b = boot(true, { ok: false, err: 'disco lleno' }); const $b = s => b.w.document.querySelector(s); $b('#pdf').dispatchEvent(new b.w.MouseEvent('click', { bubbles: true })); await wait(100); assert(/No se pudo guardar el PDF: disco lleno/.test($b('#toast').textContent)); }
  { const b = boot(true, { ok: false }); const $b = s => b.w.document.querySelector(s); $b('#pdf').dispatchEvent(new b.w.MouseEvent('click', { bubbles: true })); await wait(100); assert(!/No se pudo/.test($b('#toast').textContent), 'cancelar no muestra error'); }
  // versión web: usa la impresión del navegador (Guardar como PDF) en A4
  { const b = boot(false); const $b = s => b.w.document.querySelector(s); $b('#pdf').dispatchEvent(new b.w.MouseEvent('click', { bubbles: true })); await wait(150);
    assert.strictEqual(b.calls.print, 1); assert(/size:A4/.test($b('#pgs').textContent)); assert(/Resumen de ventas/.test($b('#tk').innerHTML)); }
  console.log('REPORTE_PDF_OK');process.exit(0);
})().catch(e => { console.log('FALLO', e.message); process.exit(1); });
