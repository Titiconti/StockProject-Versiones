// Aumento masivo de precios (vista previa, categoría, proveedor, negativo, permisos) e importación de .xlsx. Datos 100% de prueba.
const assert = require('assert'), ExcelJS = require('exceljs'), { web } = require('./helpers.js'), { leerXlsx } = require('../xlsx-lector.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w), J = e => JSON.parse(w.eval('JSON.stringify(' + e + ')'));
  ev(`db.prods.length=0;db.nid=1;db.orders=[];
    [['Yerba',1000,'Almacén'],['Fideos',1234,'Almacén'],['Jabón',100.5,'Limpieza'],['Sal',3,'Almacén'],['Sin cat',500,'']].forEach(([n,p,c])=>db.prods.push({id:db.nid++,name:n,price:p,cost:1,lots:[],cat:c}));
    db.orders.push({id:1,date:'2026-01-01',supplier:'Prov A',items:[{pid:1},{pid:3}]},{id:2,date:'2026-02-01',supplier:'Prov B',items:[{pid:2}]})`);
  const precios = () => J('db.prods.map(p=>p.price)');
  const antes = precios();

  // vista previa: no toca los datos
  let r = J(`PM.calc('10','todos','')`);
  assert.strictEqual(r.items.length, 4, 'Sal (3 -> 3) no cambia'); assert.deepStrictEqual(precios(), antes, 'la vista previa no modifica');
  assert.deepStrictEqual(r.items.map(i => i.despues), [1100, 1357, 110.55, 550], 'redondeo: entero si era entero, centavos si tenía centavos');
  assert(J(`PM.calc('abc','todos','')`).err && J(`PM.calc('0','todos','')`).err && J(`PM.calc('900','todos','')`).err && J(`PM.calc('10','cat','')`).err, 'valida porcentaje y alcance');

  // por categoría
  ev(`PM.aplicar(10,'cat','Almacén')`);
  assert.deepStrictEqual(precios(), [1100, 1357, 100.5, 3, 500], 'solo Almacén');
  // por proveedor (último pedido de cada producto)
  ev(`PM.aplicar(50,'prov','Prov A')`);
  assert.deepStrictEqual(precios(), [1650, 1357, 150.75, 3, 500], 'solo productos de Prov A');
  // negativo
  ev(`PM.aplicar(-20,'todos','')`);
  assert.deepStrictEqual(precios(), [1320, 1086, 120.6, 2, 400], 'baja con porcentaje negativo');
  // un precio que quedaría en 0 se omite
  r = J(`PM.calc(-90,'todos','')`); assert.strictEqual(r.omitidos, 1, 'Sal quedaría en 0: se omite');
  assert(J('db.ajustes').some(x => /Yerba: precio/.test(x.txt)), 'queda registro de cada cambio');

  // permisos: un empleado (cajero) no puede
  const p0 = precios();
  ev(`AU.habilitado=true;AU.permisos={productos:['ver','crear','editar']}`);
  assert(/permiso/.test(J(`PM.aplicar(10,'todos','')`).err)); assert.deepStrictEqual(precios(), p0, 'sin permiso no cambia nada');
  ev(`AU.habilitado=false`);

  // pantalla: vista previa y confirmar
  a.tab('g'); a.click('#gp [data-s=d]'); a.set('#pm_pct', '20'); a.set('#pm_alc', 'cat'); a.set('#pm_val', 'Limpieza'); a.click('#pm_v');
  assert(/1 productos cambiarían de precio/.test(a.txt('#pm_card')) && /Jabón/.test(a.txt('#pm_card')), a.txt('#pm_card'));
  assert.deepStrictEqual(precios(), p0, 'la vista previa de pantalla tampoco modifica'); a.click('#pm_ok');
  assert.strictEqual(J('db.prods[2].price'), 144.72); assert.strictEqual(J('db.prods[0].price'), p0[0]);

  // lector xlsx (módulo del programa de escritorio): filas vacías, fechas, números, fórmulas, límites
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Lista');
  ws.addRow(['Artículo', 'Código', 'Precio', 'Costo', 'Stock']); ws.addRow(['Café 500 g', 7791, 1234.5, 800, 10]); ws.addRow([]); ws.addRow(['Té', '7792', { formula: 'A1', result: 950 }, 'abc', 4]); ws.addRow(['Sin precio', '7793', '', 1, 1]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const x = await leerXlsx(buf); assert.strictEqual(x.rows.length, 4, 'saltea la fila vacía'); assert.deepStrictEqual(x.rows[1], ['Café 500 g', '7791', '1234,5', '800', '10']); assert.strictEqual(x.rows[2][2], '950');
  assert((await leerXlsx(Buffer.from('no soy un excel'))).err && (await leerXlsx(Buffer.alloc(21e6, 0x50))).err, 'rechaza basura y archivos enormes');

  // importación por el asistente con .xlsx: mismo mapeo y validación que el CSV
  ev('db.prods.length=0;db.nid=1;db.lid=1'); w.sp = { leerXlsx: async ab => leerXlsx(Buffer.from(ab)) };
  a.tab('g'); a.click('#gp [data-s=d]'); a.click('#mg_n1');
  const file = { name: 'lista-proveedor.xlsx', size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  Object.defineProperty($('#mg_f'), 'files', { value: [file] }); a.ev($('#mg_f'), 'change'); await new Promise(r => setTimeout(r, 300));
  assert(/Revisá a qué columna/.test(a.txt('#g_d')), a.txt('#g_d').slice(0, 300)); assert.strictEqual($('[data-mc=price]').value, '2');
  a.click('#mg_n3'); const f = J('MG.st.filas'); assert.deepStrictEqual(f.map(q => q.err.map(e => e.c)), [[], ['cost'], ['price']], 'costo no numérico y precio faltante quedan como error');
  assert.strictEqual(f[0].v.price, 1234.5);
  // sin el programa de escritorio, el .xlsx se rechaza con un mensaje claro
  delete w.sp; a.click('#mg_a3'); a.click('#mg_a2'); Object.defineProperty($('#mg_f'), 'files', { value: [file] }); a.ev($('#mg_f'), 'change'); await new Promise(r => setTimeout(r, 100));
  assert(/programa de escritorio/.test(a.txt('#g_d')));
  assert.deepStrictEqual(a.errs, []); console.log('OK precios-masivos'); w.close();   // sin cerrar la ventana de jsdom sus timers dejan el proceso abierto
})().catch(e => { console.error(e); process.exit(1); });
