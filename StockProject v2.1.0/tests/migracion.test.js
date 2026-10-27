const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w), J = e => JSON.parse(w.eval('JSON.stringify(' + e + ')'));
  const hoy = ev('UT.hoy()');
  // la plantilla que descarga el programa se importa sin errores (ida y vuelta)
  for (const ent of ['productos', 'clientes']) {
    const rows = J(`UT.parseCSV(MG.plantilla('${ent}')).rows`); const map = J(`MG.autoMapa('${ent}',${JSON.stringify(rows[0])})`);
    assert.strictEqual(Object.keys(map).length, J(`MG.ENT.${ent}.campos`).length, 'reconoce todas sus columnas: ' + ent);
    const f = J(`MG.validar('${ent}',${JSON.stringify(rows.slice(1))},${JSON.stringify(map)})`); assert(f.every(x => !x.err.length), JSON.stringify(f.map(x => x.err)));
  }
  // nombres de columnas típicos de otros programas
  assert.deepStrictEqual(J(`MG.autoMapa('productos',['Artículo','Cód. Barras','P. Venta','Costo','Existencia','Stock Mínimo','Vto'])`), { name: 0, code: 1, price: 2, cost: 3, stock: 4, min: 5, exp: 6 });
  assert.deepStrictEqual(J(`MG.autoMapa('clientes',['Razón Social','Celular','E-mail','Observaciones'])`), { name: 0, phone: 1, mail: 2, note: 3 });

  // asistente completo por pantalla
  ev('db.prods.length=0;db.nid=1;db.lid=1');
  ev(`db.prods.push({id:db.nid++,name:'Yerba',code:'7790001',price:100,cost:50,min:1,lots:[]});addLot(db.prods[0],'Viejo',5,'')`);
  ev('UT.bajar=(n,t)=>{window.__f=[n,t]}'); a.tab('g'); a.click('#gp [data-s=d]'); assert(/Qué importar/.test(a.txt('#g_d'))); a.click('#mg_pl'); assert(/^plantilla-productos\.csv$/.test(ev('window.__f[0]')) && /Nombre;Código;Precio de venta/.test(ev('window.__f[1]')));
  a.set('#mg_e', 'productos'); a.click('#mg_n1');
  const csv = `Artículo;Cód. Barras;Precio;Costo;Existencia;Mínimo;Vencimiento
Yerba mate 1 kg;7790001;"1.500,50";900;10;2;31/12/2099
Fideos;7790010;800;400;30;5;
Gaseosa;7790011;abc;300;4;1;
Fideos 2;7790010;700;300;1;1;
Leche;7790012;1200;1500;8;2;2020-01-01
;7790013;50;20;1;1;
Arroz;;950;500;12,5;3;`;
  const file = { name: 'articulos.csv', size: csv.length, text: async () => csv };
  const inp = $('#mg_f'); Object.defineProperty(inp, 'files', { value: [file] }); a.ev(inp, 'change');
  await new Promise(r => setTimeout(r, 50)); assert(/Revisá a qué columna/.test(a.txt('#g_d')), a.txt('#g_d').slice(0, 200));
  assert.strictEqual($('[data-mc=price]').value, '2', 'detectó la columna de precio');
  a.click('#mg_n3'); assert(/Corregí los errores/.test(a.txt('#g_d')));
  let f = J('MG.st.filas'); const errs = f.filter(x => x.err.length).map(x => x.n);
  assert.deepStrictEqual(errs, [4, 5, 7], 'precio inválido, código repetido y nombre vacío'); assert(f[0].accion === 'actualiza' && f[1].accion === 'nuevo');
  assert(f[4].av.some(m => /costo es mayor/.test(m)) && f[4].av.some(m => /vencido/.test(m)), 'avisos de costo y lote vencido'); assert(f[6].av.some(m => /decimales/.test(m)));
  assert.strictEqual(f[0].v.price, 1500.5, 'número con formato local');
  // corregir en pantalla la fila 4 (precio)
  const fx = $('[data-fx="4|price"]'); fx.value = '650,25'; a.ev(fx, 'change'); f = J('MG.st.filas'); assert(!f[2].err.length && f[2].v.price === 650.25);
  assert.deepStrictEqual(f.filter(x => x.err.length).map(x => x.n), [5, 7]);
  a.click('#mg_n4'); a.set('#mg_s', 'sumar'); a.click('#mg_ok');
  const d = a.db(); assert.deepStrictEqual(d.prods.map(p => p.name), ['Yerba mate 1 kg', 'Fideos', 'Gaseosa', 'Leche', 'Arroz']);
  const y = d.prods[0]; assert.deepStrictEqual([y.price, y.cost, y.min, y.code], [1500.5, 900, 2, '7790001']); assert.strictEqual(ev('tot(db.prods[0])'), 15, 'sumó el stock al existente'); assert.strictEqual(ev('tot(db.prods[4])'), 13);
  assert.strictEqual(d.prods[2].price, 650.25, 'quedó con el valor corregido en pantalla'); assert(/Importación lista: 4 nuevos, 1 actualizados, 2 omitidos/.test(a.txt('#g_d')), a.txt('#g_d').slice(0, 300));
  assert.strictEqual(d.cfg.mapeos && Object.keys(d.cfg.mapeos).length, 1, 'recuerda el mapeo de columnas'); assert(d.cfg.ultimaImport.prev);
  // deshacer
  a.click('#mg_un'); a.click('#mg_un'); const u = a.db(); assert.deepStrictEqual(u.prods.map(p => p.name), ['Yerba']); assert.strictEqual(u.prods[0].price, 100); assert.strictEqual(u.nid, 2); assert(!u.cfg.ultimaImport);
  // clientes y saldos
  ev('db.clients.length=0;db.cid=1;db.cargos.length=0;db.cgid=1');
  const cl = J(`MG.validar('clientes',[['Ana','1155551234','ana@x.com','150',''],['ana','1','mal','5','10'],['Beto','','','5,5','1.000']],{name:0,phone:1,mail:2,disc:3,limite:4})`);
  assert(cl[1].err.some(e => /repetido/.test(e.m)) && cl[0].err.some(e => e.c === 'disc'), 'descuento 150 inválido y nombre repetido'); assert(!cl[2].err.length && cl[2].v.disc === 5.5 && cl[2].v.limite === 1000);
  ev(`MG.aplicar('clientes',MG.validar('clientes',[['Ana','1155551234','ana@x.com','0','']],{name:0,phone:1,mail:2,disc:3,limite:4}))`);
  const sd = J(`MG.validar('saldos',[['Ana','15.000'],['Nadie','10'],['Ana','5']],{name:0,saldo:1})`); assert(!sd[0].err.length && sd[0].v.saldo === 15000); assert(/no existe/.test(sd[1].err[0].m)); assert(/repetido/.test(sd[2].err[0].m));
  ev(`MG.aplicar('saldos',MG.validar('saldos',[['Ana','15.000']],{name:0,saldo:1}))`); assert.strictEqual(ev('debtOf(1)'), 15000, 'el saldo inicial es deuda');
  assert(/ya tiene un saldo inicial/i.test(J(`MG.validar('saldos',[['Ana','1']],{name:0,saldo:1})`)[0].err[0].m), 'no permite cargar el saldo dos veces');
  // exportaciones
  a.click('[data-ex=clientes]'); assert(/Nombre;Teléfono;Correo/.test(ev('window.__f[1]')) && /Ana/.test(ev('window.__f[1]'))); a.click('[data-ex=json]'); assert(JSON.parse(ev('window.__f[1]')).clients.length === 1);
  assert.deepStrictEqual(a.errs, []);
  console.log('migracion OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
