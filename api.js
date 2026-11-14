// API REST v1: lógica sobre los datos (sin red). El servidor se ocupa de la autenticación y de guardar.
const hoyK = () => new Date().toLocaleDateString('sv-SE');
const r2 = n => Math.round((n || 0) * 100) / 100;
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const stock = p => (p.lots || []).filter(l => !l.exp || l.exp >= hoyK()).reduce((a, l) => a + l.qty, 0);
const deuda = (db, cid) => r2((db.sales || []).filter(s => s.cid === cid && !s.void && s.pay === 'Cuenta corriente').reduce((a, s) => a + s.total, 0) + (db.cargos || []).filter(x => x.cid === cid).reduce((a, x) => a + x.amount, 0) - (db.pays || []).filter(p => p.cid === cid).reduce((a, p) => a + p.amount, 0));
const prodOut = p => ({ id: p.id, codigo: p.code || '', nombre: p.name, precio: p.price, costo: p.cost || 0, stock: stock(p), stock_minimo: p.min || 0 });

function consultar(db, ruta, q) {
  if (ruta === '/productos') { const t = norm(q.get('q')); return (db.prods || []).filter(p => !t || norm(p.name).includes(t) || norm(p.code).includes(t)).map(prodOut); }
  if (ruta === '/stock-bajo') return (db.prods || []).filter(p => p.min > 0 && stock(p) <= p.min).map(prodOut);
  if (ruta === '/clientes') return (db.clients || []).map(c => ({ id: c.id, nombre: c.name, telefono: c.phone || '', correo: c.mail || '', descuento: c.disc || 0, saldo: deuda(db, c.id) }));
  const d = q.get('desde') || '0000-01-01', h = q.get('hasta') || '9999-12-31';
  const ventas = (db.sales || []).filter(s => !s.void && s.date.slice(0, 10) >= d && s.date.slice(0, 10) <= h);
  if (ruta === '/ventas') return ventas.slice(-5000).map(s => ({ id: s.id, fecha: s.date, total: s.total, medio_pago: s.pay, cliente: s.cname || null, items: s.items.map(i => ({ producto: i.name, cantidad: i.qty, precio: i.price })) }));
  if (ruta === '/resumen') { const total = r2(ventas.reduce((a, s) => a + s.total, 0)), costo = ventas.reduce((a, s) => a + s.items.reduce((x, i) => x + i.qty * (i.cost || 0), 0), 0); return { desde: d, hasta: h, ventas: total, tickets: ventas.length, ganancia: r2(total - costo) }; }
  return null;
}
// Alta/actualización. Devuelve { ok, ... } o { error, codigo } sin modificar nada si hay un problema.
function productoUpsert(db, b) {
  const nombre = String(b.nombre || '').trim(), codigo = String(b.codigo || '').trim(), precio = Number(b.precio);
  if (!nombre && !codigo) return { error: 'Falta nombre o código', codigo: 400 };
  let p = (codigo && db.prods.find(x => String(x.code || '').toLowerCase() === codigo.toLowerCase())) || (!codigo && db.prods.find(x => norm(x.name) === norm(nombre)));
  if (!p) { if (!nombre || !(precio >= 0)) return { error: 'Para crear un producto hacen falta nombre y precio', codigo: 400 }; p = { id: db.nid++, name: nombre, code: codigo, price: precio, cost: 0, min: 0, lots: [] }; db.prods.push(p); }
  else { if (nombre) p.name = nombre; if (b.precio !== undefined) { if (!(precio >= 0)) return { error: 'Precio inválido', codigo: 400 }; p.price = precio; } if (codigo) p.code = codigo; }
  if (b.costo !== undefined) { if (!(Number(b.costo) >= 0)) return { error: 'Costo inválido', codigo: 400 }; p.cost = Number(b.costo); }
  if (b.stock_minimo !== undefined) p.min = Math.max(0, Math.round(Number(b.stock_minimo) || 0));
  const sum = Math.round(Number(b.sumar_stock) || 0); if (sum > 0) { const l = p.lots.find(z => z.n === 'API' && !z.exp); if (l) l.qty += sum; else p.lots.push({ id: db.lid++, n: 'API', qty: sum, exp: '' }); }
  return { ok: true, producto: prodOut(p) };
}
function clienteUpsert(db, b) {
  const nombre = String(b.nombre || '').trim(); if (nombre.length < 2) return { error: 'Falta el nombre', codigo: 400 };
  let c = db.clients.find(x => norm(x.name) === norm(nombre)); const nuevo = !c;
  if (!c) { c = { id: db.cid++, name: nombre, phone: '', disc: 0, note: '' }; db.clients.push(c); }
  if (b.telefono !== undefined) c.phone = String(b.telefono); if (b.correo !== undefined) c.mail = String(b.correo); if (b.descuento !== undefined) c.disc = Math.min(100, Math.max(0, Number(b.descuento) || 0));
  return { ok: true, nuevo, cliente: { id: c.id, nombre: c.name } };
}
function ventaCrear(db, b) {
  const items = Array.isArray(b.items) ? b.items : []; if (!items.length || items.length > 200) return { error: 'La venta necesita entre 1 y 200 renglones', codigo: 400 };
  const pay = String(b.medio_pago || 'Efectivo').slice(0, 40); let c = null;
  if (b.cliente) { c = db.clients.find(x => norm(x.name) === norm(b.cliente) || x.id === b.cliente); if (!c) return { error: 'Cliente inexistente', codigo: 404 }; }
  if (pay === 'Cuenta corriente' && !c) return { error: 'Para vender en cuenta corriente indicá el cliente', codigo: 400 };
  const disc = c ? c.disc || 0 : 0, pedido = new Map();
  for (const it of items) {
    const p = db.prods.find(x => (it.id != null && x.id === it.id) || (it.codigo && String(x.code || '').toLowerCase() === String(it.codigo).toLowerCase())), q = Number(it.cantidad);
    if (!p) return { error: 'Producto inexistente: ' + (it.codigo || it.id), codigo: 404 }; if (!(q > 0) || q !== Math.floor(q)) return { error: 'Cantidad inválida para ' + p.name, codigo: 400 };
    pedido.set(p, (pedido.get(p) || 0) + q);
  }
  for (const [p, q] of pedido) if (stock(p) < q) return { error: `Stock insuficiente de ${p.name} (hay ${stock(p)})`, codigo: 409 };
  const lineas = [];
  for (const [p, q] of pedido) {
    let n = q; const used = [];
    p.lots.filter(l => !l.exp || l.exp >= hoyK()).sort((a, b2) => (a.exp || '9') > (b2.exp || '9') ? 1 : -1).forEach(l => { const u = Math.min(l.qty, n); l.qty -= u; n -= u; if (u > 0) used.push({ n: l.n, exp: l.exp, qty: u }); });
    p.lots = p.lots.filter(l => l.qty > 0);
    lineas.push({ id: p.id, name: p.name, qty: q, price: Math.round(p.price * (100 - disc)) / 100, lp: p.price, cost: p.cost || 0, lots: used });
  }
  const total = r2(lineas.reduce((a, i) => a + i.price * i.qty, 0));
  if (c && pay === 'Cuenta corriente' && c.limite && deuda(db, c.id) + total > c.limite + 0.005) return { error: 'Supera el límite de crédito del cliente', codigo: 409, restaurar: lineas };
  const s = { id: db.sid++, date: new Date().toISOString(), items: lineas, total, pay, origen: 'api' }; /* pedido externo: no pasa por la caja del local */ if (c) { s.cid = c.id; s.cname = c.name; s.disc = disc; }
  db.sales.push(s); return { ok: true, venta: { id: s.id, total, fecha: s.date } };
}
const OPENAPI = {
  openapi: '3.0.3', info: { title: 'StockProject API', version: '1.0', description: 'API local de StockProject. Se activa con el acceso remoto. Autenticación: encabezado Authorization: Bearer spk_… (clave creada en Configuración > Integraciones). Las claves de lectura solo consultan; las de escritura también modifican.' },
  paths: {
    '/api/v1/productos': { get: { summary: 'Lista productos con su stock', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }] }, post: { summary: 'Crea o actualiza un producto por código (escritura)', requestBody: { content: { 'application/json': { example: { codigo: '7790001', nombre: 'Yerba 1 kg', precio: 2500, costo: 1700, stock_minimo: 5, sumar_stock: 20 } } } } } },
    '/api/v1/stock-bajo': { get: { summary: 'Productos en o por debajo del mínimo' } },
    '/api/v1/clientes': { get: { summary: 'Lista clientes con su saldo' }, post: { summary: 'Crea o actualiza un cliente por nombre (escritura)', requestBody: { content: { 'application/json': { example: { nombre: 'Ana Pérez', telefono: '1155551234', correo: 'ana@correo.com' } } } } } },
    '/api/v1/ventas': { get: { summary: 'Ventas (no anuladas) entre dos fechas', parameters: [{ name: 'desde', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' } }] }, post: { summary: 'Registra una venta y descuenta el stock (escritura)', requestBody: { content: { 'application/json': { example: { items: [{ codigo: '7790001', cantidad: 2 }], medio_pago: 'Transferencia', cliente: 'Ana Pérez' } } } } } },
    '/api/v1/resumen': { get: { summary: 'Totales de ventas y ganancia entre dos fechas' } }
  }
};
function docsHtml() {
  const filas = Object.entries(OPENAPI.paths).map(([ruta, ms]) => Object.entries(ms).map(([m, d]) => {
    const ej = d.requestBody ? JSON.stringify(d.requestBody.content['application/json'].example, null, 2) : '';
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<h3><code>${m.toUpperCase()} ${ruta}</code></h3><p>${esc(d.summary)}</p><pre>curl ${m === 'post' ? '-X POST ' : ''}-H "Authorization: Bearer spk_TU_CLAVE" ${m === 'post' ? '-H "Content-Type: application/json" -d \'' + esc(JSON.stringify(JSON.parse(ej))) + '\' ' : ''}http://IP-DE-LA-PC:PUERTO${ruta}</pre>`;
  }).join('')).join('');
  return `<!DOCTYPE html><html lang="es"><meta charset="utf-8"><title>StockProject API</title><style>body{font:15px system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 14px;line-height:1.5}pre{background:#f3f4f6;padding:10px;border-radius:8px;overflow:auto}code{background:#f3f4f6;padding:1px 5px;border-radius:4px}</style><h1>StockProject API v1</h1><p>${OPENAPI.info.description}</p><p>Formato JSON. Errores: <code>{"error":"mensaje"}</code> con códigos 400, 401, 403, 404, 409 o 429. Los datos se guardan como en la pantalla de la aplicación, así que aparecen enseguida en la PC. Especificación: <a href="/api/v1/openapi.json">openapi.json</a>.</p>${filas}<h2>Webhooks</h2><p>Configurá una dirección en Configuración &gt; Integraciones. Recibís un POST JSON <code>{id, evento, fecha, datos}</code> con la firma en <code>X-StockProject-Signature: sha256=…</code> (HMAC-SHA256 del cuerpo con tu secreto). Si no respondés 2xx se reintenta 3 veces.</p></html>`;
}
module.exports = { docsHtml, consultar, productoUpsert, clienteUpsert, ventaCrear, OPENAPI, stock };
