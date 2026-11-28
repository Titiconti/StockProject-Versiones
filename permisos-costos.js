// Costos de compra fuera del alcance de quien no los puede ver (permisos costos.ver / margenes.ver / rentabilidad.ver).
// `ocultar` se aplica a lo que el proceso principal le entrega a la interfaz al cargar: los costos llegan en 0, así que
// ninguna pantalla, exportación o reporte hecho en el renderer puede mostrarlos.
// `restaurar` se aplica a lo que la interfaz guarda: devuelve los costos reales que había en disco (la interfaz solo vio ceros),
// y a lo nuevo que se vende o da de baja le pone el costo vigente del producto, para que la ganancia siga bien calculada.
// Límite: no oculta los importes de dinero (total de una recepción, pagos a proveedores, movimientos de caja).
'use strict';
const lista = v => (Array.isArray(v) ? v : []);
const redondeo = c => Math.round((c || 0) * 100) / 100;
const porId = l => new Map(lista(l).filter(x => x && x.id != null).map(x => [x.id, x]));
// Los ajustes de precio guardan texto libre ("precio A → B · costo C → D" o "costo C → D (recepción)").
const sinCosto = a => {
  if (!a || a.tipo !== 'producto.precio' || !/costo/i.test(a.txt || '')) return a;
  const solo = String(a.txt).replace(/\s*·\s*costo.*$/i, '');
  return { ...a, txt: /costo/i.test(solo) ? String(a.txt).split(':')[0] + ': cambio de costo (oculto)' : solo };
};
const items = (v, f) => (v && Array.isArray(v.items) ? { ...v, items: v.items.map(i => (i && typeof i === 'object' ? f(i) : i)) } : v);

function ocultar(db) {
  if (!db || typeof db !== 'object') return db;
  const cero = i => ('cost' in i ? { ...i, cost: 0 } : i);
  const ceroRec = i => ('c' in i ? { ...i, c: 0 } : i);
  const o = { ...db };
  if (Array.isArray(db.prods)) o.prods = db.prods.map(p => (p && 'cost' in p ? { ...p, cost: 0 } : p));
  for (const k of ['sales', 'desv', 'orders']) if (Array.isArray(db[k])) o[k] = db[k].map(v => items(v, cero));
  if (Array.isArray(db.recepciones)) o.recepciones = db.recepciones.map(v => items(v, ceroRec));
  if (Array.isArray(db.ajustes)) o.ajustes = db.ajustes.map(sinCosto);
  return o;
}

function restaurar(previo, nuevo) {
  if (!previo || !nuevo || typeof nuevo !== 'object') return nuevo;
  const o = { ...nuevo }, prods = porId(previo.prods);
  if (Array.isArray(nuevo.prods)) o.prods = nuevo.prods.map(p => {
    if (!p || typeof p !== 'object') return p;
    const v = prods.get(p.id), { cost, ...resto } = p;
    return v && 'cost' in v ? { ...resto, cost: v.cost } : { ...resto, ...(v ? {} : { cost: 0 }) };
  });
  const costoVigente = pid => { const p = prods.get(pid); return p ? (p.unidad === 'kg' ? redondeo(p.cost) : p.cost || 0) : 0; };
  const unir = (nuevoI, previoI, campo, nuevoCosto) => nuevoI.map((i, n) => {
    if (!i || typeof i !== 'object' || !(campo in i)) return i;
    const v = previoI && previoI[n];
    return { ...i, [campo]: v && campo in v ? v[campo] : nuevoCosto(i) };
  });
  for (const [k, pid] of [['sales', 'id'], ['desv', 'id'], ['orders', 'pid']]) {
    if (!Array.isArray(nuevo[k])) continue;
    const viejas = porId(previo[k]);
    o[k] = nuevo[k].map(v => (v && Array.isArray(v.items) ? { ...v, items: unir(v.items, (viejas.get(v.id) || {}).items, 'cost', i => costoVigente(i[pid])) } : v));
  }
  if (Array.isArray(nuevo.recepciones)) {
    const viejas = porId(previo.recepciones);
    o.recepciones = nuevo.recepciones.map(v => (v && Array.isArray(v.items) ? { ...v, items: unir(v.items, (viejas.get(v.id) || {}).items, 'c', () => 0) } : v));
  }
  if (Array.isArray(nuevo.ajustes)) {
    const viejos = porId(previo.ajustes);
    o.ajustes = nuevo.ajustes.map(a => { const v = a && viejos.get(a.id); return v && sinCosto(v).txt === a.txt ? v : a; });
  }
  return o;
}
module.exports = { ocultar, restaurar };
