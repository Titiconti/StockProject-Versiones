const assert = require('assert'), { JSDOM, HTML, api, wait, web } = require('./helpers');
function escritorio(resultado = { ok: true }) {
  const llamadas = [];
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.sp = { load: () => '', save: async () => ({ ok: true, rev: 1 }), version: () => 0, defaults: () => ({ demo: true }), info: async () => ({ dir: 'C:\\x', last: null, warn: '' }),
      now: async () => ({}), choose: async () => ({}), restore: async () => true, print: async () => ({ ok: true }), remote: async () => ({ running: false, urls: [], pin: '123456' }),
      pdf: async (h, n) => { llamadas.push([h, n]); return resultado; } };
  } });
  // Estas pruebas no son de caja: se desactiva la exigencia de caja abierta (ver tests/caja.test.js).
  dom.window.eval('db.cfg.cajaObligatoria=false');
  return { A: api(dom.window), llamadas };
}
const texto = h => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ');

(async () => {
  const { A, llamadas } = escritorio(), { w, $, click, set, pick, tab, f, errs } = A;
  assert($('#c #pdfc') && $('#pdfc').textContent === 'Exportar PDF', 'el botón está en la pestaña Clientes'); assert($('#r #pdf'), 'el de Reportes sigue en su lugar');
  const vender = (cliente, prod, n, pago) => { tab('v'); set('#cl', cliente); pick('#clg'); const b = [...w.document.querySelectorAll('#prods .p')].find(x => x.textContent.includes(prod)); for (let i = 0; i < n; i++) click(b); $('#pay').value = pago; click('#cobrar'); };
  vender('esquina', 'Coca-Cola', 2, 'Cuenta corriente');             // 2 x 2520 = 5040 a cuenta, costo 3800
  vender('don luis', 'Yerba', 1, 'Efectivo');                         // 1 x 6555, costo 4800
  vender('don luis', 'Yerba', 1, 'Efectivo'); const anulada = w.eval('db.sales.at(-1).id'); w.eval(`db.sales.find(s=>s.id===${anulada}).void=true`);   // anulada: no cuenta
  tab('c'); $('#cn').value = 'Zeta Mayorista'; $('#cx').value = 'Paga los viernes'; $('#cd').value = '0'; click('#cg');
  const cliente1 = w.eval("db.clients.find(c=>c.name==='Kiosco La Esquina').id"); w.eval(`db.pays.push({id:db.payid++,date:new Date().toISOString(),cid:${cliente1},amount:1000,method:'Efectivo',note:''});draw()`);

  // ---- el botón genera el PDF con el listado ----
  click('#pdfc'); await wait(100);
  assert.strictEqual(llamadas.length, 1); const [doc, nombre] = llamadas[0], t = texto(doc);
  assert(/^Clientes-\d{4}-\d\d-\d\d\.pdf$/.test(nombre), nombre); assert(/<!DOCTYPE html>/.test(doc) && /\.a4 \.kp/.test(doc), 'documento completo con los estilos del comprobante');
  assert(/Listado de clientes/.test(t) && /Kiosco La Esquina/.test(t) && /Almacén Don Luis/.test(t) && /Zeta Mayorista/.test(t) && /Paga los viernes/.test(t), 'todos los clientes y sus notas');
  assert(t.indexOf('Almacén Don Luis') < t.indexOf('Kiosco La Esquina') && t.indexOf('Kiosco La Esquina') < t.indexOf('Zeta Mayorista'), 'orden alfabético');
  assert(/Kiosco La Esquina.*10 %.*24,6 %/.test(t), 'descuento y rentabilidad: (5040-3800)/5040'); assert(/Almacén Don Luis.*5 %.*26,8 %/.test(t), 'la venta anulada no cuenta: (6555-4800)/6555');
  assert(t.includes(f(4040)), 'deuda del cliente: 5040 - 1000 de pago'); assert(/Zeta Mayorista Paga los viernes.*0 %.*-.*Sin deuda/.test(t), 'cliente sin compras: guion y sin deuda');
  assert(t.includes(f(5040 + 6555)), 'compras totales'); assert(/Totales.*25,8 %/.test(t), 'rentabilidad global: 2995 / 11595'); assert(new RegExp('Deuda total ' + f(4040).replace(/[$.]/g, '\\$&')).test(t), 'KPI de deuda total');
  assert(/1 venta\b/.test(t) && !/1 ventas/.test(t) && /2 ventas/.test(t) === false, 'singular y plural: "1 venta"');
  assert(/Clientes 3 Con deuda 1/.test(t), 'KPI: 3 clientes, 1 con deuda'); assert(/Generado el/.test(t) && /Documento de uso interno/.test(t));
  assert(/PDF guardado/.test($('#toast').textContent));
  // saldo a favor y datos del comercio
  w.eval(`db.pays.push({id:db.payid++,date:new Date().toISOString(),cid:${cliente1},amount:5000,method:'Efectivo',note:''});db.shop.n='Kiosco Don Pepe';db.shop.a='San Martín 123';draw()`);
  click('#pdfc'); await wait(50); const t2 = texto(llamadas[1][0]); assert(new RegExp('A favor ' + f(960).replace(/[$.]/g, '\\$&')).test(t2), 'saldo a favor'); assert(/Kiosco Don Pepe/.test(t2) && /San Martín 123/.test(t2), 'datos del comercio en el encabezado');
  // sin clientes
  w.eval('db.clients=[];db.sales=[];db.pays=[];draw()'); click('#pdfc'); await wait(50); assert(/No hay clientes cargados/.test(texto(llamadas[2][0])));
  // Reportes sigue exportando su propio resumen
  tab('r'); click('#pdf'); await wait(50); assert(/^Resumen-/.test(llamadas[3][1]), 'el PDF de Reportes no cambió');
  assert.deepStrictEqual(errs, []);

  // error al guardar / cancelar
  { const { A: B, llamadas: l } = escritorio({ ok: false, err: 'disco lleno' }); B.tab('c'); B.click('#pdfc'); await wait(80); assert(/No se pudo guardar el PDF: disco lleno/.test(B.$('#toast').textContent)); }
  { const { A: B } = escritorio({ ok: false }); B.tab('c'); B.click('#pdfc'); await wait(80); assert(!/No se pudo/.test(B.$('#toast').textContent), 'cancelar no es un error'); }
  // versión web: usa la impresión del navegador (Guardar como PDF), en A4
  { let imp = 0; const B = web(); B.w.print = () => imp++; B.tab('c'); B.click('#pdfc'); await wait(120);
    assert.strictEqual(imp, 1); assert(/size:A4/.test(B.$('#pgs').textContent)); assert(/Listado de clientes/.test(B.$('#tk').innerHTML) && /Kiosco La Esquina/.test(B.$('#tk').innerHTML)); }
  console.log('CLIENTES_PDF_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
