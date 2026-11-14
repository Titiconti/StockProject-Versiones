const assert = require('assert'), { JSDOM, HTML, until, api } = require('./helpers.js');
// Un celular conectado a la PC principal (acceso remoto simulado) que pierde la conexión.
function celular(servidor) {
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://pc.local:3000/', pretendToBeVisual: true, beforeParse(w) {
    w.SP_BOOT = { rev: servidor.rev, data: JSON.parse(JSON.stringify(servidor.db)), defaults: {}, auth: null };
    w.fetch = async (u, o = {}) => {
      if (servidor.caido) throw new TypeError('Failed to fetch');
      const r = (code, j) => ({ status: code, ok: code < 300, json: async () => j, text: async () => JSON.stringify(j) });
      if (/^\/api\/rev/.test(u)) return r(200, { rev: servidor.rev });
      if (/^\/api\/db\?base=/.test(u) && o.method === 'PUT') { const base = +u.split('=')[1]; if (base !== servidor.rev) return r(409, {}); servidor.rev++; servidor.db = JSON.parse(o.body); servidor.db.rev = servidor.rev; servidor.puts.push(servidor.db); return r(200, { ok: true, rev: servidor.rev }); }
      if (u === '/api/db') return r(200, { ...servidor.db, rev: servidor.rev });
      return r(404, {});
    };
  } });
  return { ...api(dom.window), w: dom.window };
}
(async () => {
  const hoy = new Date().toLocaleDateString('sv-SE');
  const S = { rev: 1, caido: false, puts: [], db: { prods: [{ id: 1, name: 'Agua', code: '1', price: 100, cost: 50, min: 0, lots: [{ id: 1, n: 'A', qty: 10, exp: '' }] }], clients: [{ id: 1, name: 'Ana', phone: '', disc: 0 }], sales: [], pays: [], sid: 1, payid: 1, cid: 2, nid: 2, lid: 2, rev: 1, cfg: { cajaObligatoria: false } } }   // sin exigir caja (se prueba en caja.test.js);
  const A = celular(S), ev = A.w.eval.bind(A.w), stock = () => ev('tot(db.prods[0])');
  const vender = () => { ev('add(1)'); A.click('#cobrar'); };
  // 1) hay conexión: se guarda normal
  vender(); assert(await until(() => S.rev === 2), 'guardó'); assert.strictEqual(S.db.sales.length, 1);
  // 2) se corta la red: sigue vendiendo y se ve el aviso
  S.caido = true; vender(); assert(await until(() => A.$('#off')), 'aviso de sin conexión'); assert.strictEqual(stock(), 8); assert(/pendiente/.test(A.txt('#off')), A.txt('#off'));
  const cola = JSON.parse(A.w.localStorage.getItem('sp_cola_pc.local:3000')); assert.strictEqual(cola.sales.length, 1, 'la venta quedó en la cola local');
  // 3) mientras tanto otro dispositivo vendió en la PC principal
  S.db.sales.push({ id: 2, date: new Date().toISOString(), items: [{ id: 1, name: 'Agua', qty: 3, price: 100, cost: 50, lots: [{ n: 'A', exp: '', qty: 3 }] }], total: 300, pay: 'Efectivo' }); S.db.sid = 3; S.db.prods[0].lots[0].qty = 6; S.rev = 3; S.db.rev = 3;
  // 4) vuelve la red: se baja lo del servidor, se reaplica la venta pendiente y se guarda
  S.caido = false; ev('chk=null'); await A.w.eval('OFFH.online()'); assert(await until(() => S.puts.length >= 2 && S.rev === 4), 'se envió lo pendiente');
  const f = S.puts[S.puts.length - 1]; assert.strictEqual(f.sales.length, 3, 'las tres ventas: la primera, la del otro dispositivo y la hecha sin conexión'); assert.strictEqual(new Set(f.sales.map(s => s.id)).size, 3, 'sin ids repetidos');
  assert.strictEqual(f.prods[0].lots[0].qty, 5, '10 - 1 - 3 - 1 = 5: el stock es consistente'); assert(!A.$('#off'), 'desaparece el aviso'); assert.strictEqual(A.w.localStorage.getItem('sp_cola_pc.local:3000'), null, 'cola vaciada');
  // 5) la PC ya había recibido la venta pero la respuesta se perdió: no se duplica
  const total = S.db.sales.length; S.caido = true; vender(); await until(() => A.$('#off'));
  S.db.sales.push({ ...JSON.parse(JSON.stringify(A.w.eval('db.sales[db.sales.length-1]'))) }); S.db.prods[0].lots[0].qty = 3; S.rev++; S.db.rev = S.rev;
  S.caido = false; await A.w.eval('OFFH.online()'); await new Promise(r => setTimeout(r, 100)); assert.strictEqual(S.db.sales.length, total + 1, 'no se duplicó la venta que el servidor ya tenía'); assert.strictEqual(S.db.prods[0].lots[0].qty, 3);
  // 6) cobros y clientes nuevos sin conexión también se conservan, y se vinculan bien
  S.caido = true; ev(`db.clients.push({id:db.cid++,name:'Nuevo',phone:'',disc:0});db.pays.push({id:db.payid++,date:new Date().toISOString(),cid:db.cid-1,amount:50,method:'Efectivo',note:''});save()`); await until(() => A.$('#off'));
  S.db.clients.push({ id: 2, name: 'Otro', phone: '', disc: 0 }); S.db.cid = 3; S.rev++; S.db.rev = S.rev; S.caido = false; await A.w.eval('OFFH.online()'); await until(() => S.db.clients.some(c => c.name === 'Nuevo'), 2000);
  const nuevo = S.db.clients.find(c => c.name === 'Nuevo'); assert.notStrictEqual(nuevo.id, 2, 'recibió otro id porque el 2 ya era de otro cliente'); assert(S.db.pays.some(p => p.cid === nuevo.id && p.amount === 50), 'el cobro quedó vinculado al cliente con su nuevo id');
  // 7) manifiesto de aplicación en el servidor real (ver tests de servidor)
  assert.deepStrictEqual(A.errs, []); console.log('offline OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
