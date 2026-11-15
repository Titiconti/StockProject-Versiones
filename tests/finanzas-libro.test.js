// Libro mayor (v3.0.0, fase 3): filtros, resumen, agrupación por fecha y PDF con filtros y totales correctos.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, f, errs } = web();
  w.eval('db.cfg.avanzado=true;draw()');   // Finanzas completa es una función avanzada
  const hoy = w.eval('UT.hoy()'), ayer = w.eval(`UT.add('${hoy}',-1)`), ev = w.eval.bind(w);
  // ventas de contado (ingreso), una a cuenta corriente (no es ingreso), un cobro de deuda y gastos manuales
  ev(`db.sales.push({id:900,date:'${ayer}T12:00:00',items:[],total:1000,pay:'Efectivo'},{id:901,date:'${hoy}T10:00:00',items:[],total:500,pay:'Transferencia'},{id:902,date:'${hoy}T11:00:00',items:[],total:700,pay:'Cuenta corriente',cid:1})`);
  ev(`db.pays.push({id:50,date:'${hoy}T12:00:00',cid:1,amount:200,method:'Efectivo'})`);
  ev(`db.fin.mov.push({id:db.fin.id++,fecha:'${hoy}',tipo:'gasto',cat:'Alquiler',cta:'Banco',monto:300,desc:'Local marzo'},{id:db.fin.id++,fecha:'${ayer}',tipo:'gasto',cat:'Servicios',cta:'Caja',monto:100,desc:'Luz'})`);
  ev(`db.fin.pagar.push({id:db.fin.id++,prov:'Distribuidora',desc:'Pedido N.º 1',monto:400,pagado:false})`);   // a pagar: todavía no es gasto
  tab('f'); click('#fnp [data-s=l]'); const sel = (s, v) => { $(s).value = v; ev(`$('${s}').dispatchEvent(new Event('change'))`); };
  sel('#l_d', ayer); sel('#l_h', hoy);
  const sum = () => txt('#l_sum');
  assert(sum().includes(f(1700)) && sum().includes(f(400)) && sum().includes(f(1300)), 'ingresos 1000+500+200, gastos 300+100, resultado 1300: ' + sum());
  assert(!txt('#f_lb').includes('000902'), 'la venta a cuenta corriente no es un ingreso');
  const dias = [...w.document.querySelectorAll('#f_lb tr.ldia')].map(r => r.textContent); assert.strictEqual(dias.length, 2, 'agrupado por fecha'); assert(dias[0].includes(hoy.split('-').reverse().join('/')), 'lo más reciente primero');
  assert(/▲ Ingreso/.test(txt('#f_lb')) && /▼ Gasto/.test(txt('#f_lb')), 'tipo con icono y texto');
  // filtros
  sel('#l_t', 'gasto'); assert(sum().includes(f(400)) && sum().includes(f(0)), 'solo gastos'); assert(!/Venta/.test(txt('#f_lb')));
  sel('#l_t', ''); sel('#l_k', 'Alquiler'); assert.strictEqual(w.document.querySelectorAll('#f_lb tbody tr:not(.ldia)').length, 1);
  sel('#l_k', ''); set('#l_q', 'luz'); assert(/Luz/.test(txt('#f_lb')) && !/Local marzo/.test(txt('#f_lb')), 'búsqueda por concepto');
  set('#l_q', '000901'); assert(/Venta N.º 000901/.test(txt('#f_lb')), 'búsqueda por referencia');
  set('#l_q', ''); sel('#l_c', 'Banco'); assert(sum().includes(f(500)) && sum().includes(f(300)), 'filtro por cuenta (transferencia y alquiler)');
  // PDF: título, período, filtros, detalle y totales de lo filtrado
  const pdf = ev('FN.pdfLibro()').replace(/<[^>]+>/g, ' ').replace(/[\s ]+/g, ' ');
  assert(/Libro mayor/.test(pdf) && pdf.includes(ayer.split('-').reverse().join('/')) && /cuenta Banco/.test(pdf) && /Generado el/.test(pdf));
  assert(pdf.includes(f(500)) && pdf.includes(f(300)) && !/Luz/.test(pdf), 'el PDF respeta los filtros');
  let guardado = null; w.print = () => { guardado = w.document.querySelector('#tk').textContent; }; click('#l_pdf'); await new Promise(r => setTimeout(r, 120)); assert(/Libro mayor/.test(guardado || ''), 'se genera para imprimir/guardar');
  // pagar la cuenta a pagar la convierte en gasto, una sola vez
  sel('#l_c', ''); ev(`(()=>{const g=db.fin.pagar[0];g.pagado=true;g.pagoFecha='${hoy}';g.cta='Caja'})();draw()`); assert(sum().includes(f(800)), 'gastos 300+100+400');
  assert.deepStrictEqual(errs, []);
  console.log('LIBRO_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
