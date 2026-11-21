// Reglas de datos de la sincronización por diferencias. PORTABLE: no usa nada propio de Node ni de Vercel (solo Map, JSON y
// Date), así que sirve igual dentro de un Worker de Cloudflare. Lo específico de cada plataforma entra por parámetros:
//   almacen (leerVarios / escribirVarios, ver almacen.js) · comprimir / descomprimir (texto <-> "gz:..."; en Node zlib,
//   en Workers CompressionStream) · ahora() · claves K.
// Datos por comercio: base:<id> (negocio, stock, cajas, clientes, bajas, vencimientos) + vd:<id>:<día> (ventas de ese día).
'use strict';
const DIAS_VENTANA = 91, VIDA_DIA_MS = 100 * 24 * 3600 * 1000, DIA_MS = 86400000;
const FECHA_DIA = /^\d{4}-\d{2}-\d{2}$/, INST_OK = /^[A-Za-z0-9_-]{8,64}$/;
const OTROS = ['negocio', 'cajas', 'clientes', 'bajas', 'vencimientos', 'baldes'];

class ErrorHttp extends Error { constructor(estado, mensaje) { super(mensaje); this.estado = estado; } }

// Estado que cambia en cada envío (estado:<id>): seq (fotos), inst + ultOp (diferencias), ver (cambia con cada dato nuevo) y
// modo ('foto' = documento único de las versiones viejas; 'dif' = base + ventas por día).
const CAMPOS_ESTADO = ['seq', 'ultimaSync', 'inst', 'ultOp', 'ver', 'modo'];
const estadoDe = c => ({ seq: c.seq, ultimaSync: c.ultimaSync, inst: c.inst || null, ultOp: c.ultOp || 0, ver: c.ver || 0, modo: c.modo || 'foto' });
const conEstado = (c, e) => ({ ...c, seq: e.seq || 0, ultimaSync: e.ultimaSync || null, inst: e.inst || null, ultOp: e.ultOp || 0, ver: e.ver || 0, modo: e.modo || 'foto' });

const diaDe = f => String(f || '').slice(0, 10);
const esObjeto = o => !!o && typeof o === 'object' && !Array.isArray(o);
// Cada producto lleva "k" (código|nombre, con #n si se repite): clave para actualizarlo sin reenviar todo el stock.
const claveStock = (p, vistos) => { const k = String(p.cod || '') + '|' + String(p.n || ''), v = vistos.get(k) || 0; vistos.set(k, v + 1); return v ? k + '#' + v : k; };
const upsert = (existentes, nuevos) => { const m = new Map(existentes.map(v => [String(v.id), v])); nuevos.forEach((v, id) => m.set(id, v)); return [...m.values()]; };
function ventasPorDia(ventas) {
  const m = new Map();
  for (const v of ventas) {
    if (!esObjeto(v) || !(typeof v.id === 'number' || (typeof v.id === 'string' && v.id.length <= 64)) || !FECHA_DIA.test(diaDe(v.fecha))) throw new ErrorHttp(400, 'Cada venta necesita "id" y "fecha"');
    const d = diaDe(v.fecha); if (!m.has(d)) m.set(d, new Map()); m.get(d).set(String(v.id), v);
  }
  return m;
}
function lista(b, k, max) { const x = b[k]; if (x === undefined) return []; if (!Array.isArray(x) || x.length > max) throw new ErrorHttp(400, `"${k}" debe ser una lista de hasta ${max}`); return x; }

function crear({ almacen, K, comprimir, descomprimir, ahora }) {
  const iso = () => new Date(ahora()).toISOString();
  const gz = o => comprimir(JSON.stringify(o)), desgz = t => JSON.parse(descomprimir(t));
  const ventanaDias = () => Array.from({ length: DIAS_VENTANA + 2 }, (_, i) => new Date(ahora() + (1 - i) * DIA_MS).toISOString().slice(0, 10));

  // Foto entera de una versión nueva (con inst): se reparte en base + días y solo se escribe lo que cambió respecto de lo guardado.
  async function guardarFoto(c, foto, b) {
    const vistos = new Map(), stock = (Array.isArray(foto.stock) ? foto.stock : []).filter(esObjeto).map(p => ({ ...p, k: claveStock(p, vistos) }));
    const base = { generado: foto.generado, negocio: foto.negocio, stock }; OTROS.slice(1).forEach(k => { base[k] = Array.isArray(foto[k]) ? foto[k] : []; });
    const dias = ventasPorDia(foto.ventas || []), claves = [...new Set([...ventanaDias(), ...dias.keys()])];
    const viejos = await almacen.leerVarios([K.base(c.id), ...claves.map(d => K.vd(c.id, d))]), ops = [];
    const nuevaBase = gz(base); if (nuevaBase !== viejos[0]) ops.push([K.base(c.id), nuevaBase]);
    claves.forEach((d, i) => { const q = dias.has(d) ? gz([...dias.get(d).values()]) : null; if (q !== (viejos[i + 1] || null)) ops.push([K.vd(c.id, d), q, q ? VIDA_DIA_MS : undefined]); });
    if (c.modo !== 'dif') ops.push([K.foto(c.id), null]);   // el documento único de antes ya no hace falta
    c.seq = b.seq; c.inst = b.inst; c.ultOp = b.n; c.modo = 'dif'; c.ver = (c.ver || 0) + 1; c.ultimaSync = iso();
    await almacen.escribirVarios([...ops, [K.est(c.id), JSON.stringify(estadoDe(c))]]);
  }

  // Texto JSON de la foto del comercio, igual para versiones viejas (documento único) y nuevas (base + días); 'null' si no hay.
  async function leerFoto(c) {
    if (c.modo !== 'dif') { const t = descomprimir(await almacen.leer(K.foto(c.id))); if (t) { JSON.parse(t); return t; } return 'null'; }
    const dias = ventanaDias().reverse(), v = await almacen.leerVarios([K.base(c.id), ...dias.map(d => K.vd(c.id, d))]);
    if (!v[0]) return 'null';
    const base = desgz(v[0]), ventas = []; v.slice(1).forEach(t => { if (t) ventas.push(...desgz(t)); });
    return JSON.stringify({ v: 1, generado: base.generado, negocio: base.negocio, ventas, stock: base.stock.map(({ k, ...p }) => p), cajas: base.cajas, clientes: base.clientes, bajas: base.bajas, vencimientos: base.vencimientos, baldes: base.baldes });
  }

  // { inst, n, generado, ventas[], stock[], stDel[], otros{} }: cambios desde el último envío confirmado. n es consecutivo por
  // instalación (inst): repetido = ya aplicado (se confirma sin repetir); saltado o inst distinta = pide la foto entera.
  // Devuelve { estado, cuerpo } para responder.
  async function aplicarOps(c, b) {
    if (typeof b.inst !== 'string' || !INST_OK.test(b.inst) || !Number.isSafeInteger(b.n) || b.n < 1) throw new ErrorHttp(400, '"inst" y "n" no son válidos');
    if (c.modo !== 'dif' || c.inst !== b.inst || b.n > c.ultOp + 1) return { estado: 409, cuerpo: { pedirFoto: true, ultOp: c.ultOp } };
    if (b.n <= c.ultOp) return { estado: 200, cuerpo: { ok: true, ultOp: c.ultOp, repetido: true } };
    const ventas = ventasPorDia(lista(b, 'ventas', 3000)), stock = lista(b, 'stock', 5000), stDel = lista(b, 'stDel', 5000), otros = b.otros === undefined ? {} : b.otros;
    if (!esObjeto(otros) || !stock.every(p => esObjeto(p) && typeof p.k === 'string' && p.k.length <= 300) || !stDel.every(k => typeof k === 'string')) throw new ErrorHttp(400, 'Cambios inválidos');
    if (Object.keys(otros).some(k => !OTROS.includes(k) || (k === 'negocio' ? !esObjeto(otros[k]) : !Array.isArray(otros[k])))) throw new ErrorHttp(400, '"otros" inválido');
    const hayBase = stock.length || stDel.length || Object.keys(otros).length, dias = [...ventas.keys()], claves = [...(hayBase ? [K.base(c.id)] : []), ...dias.map(d => K.vd(c.id, d))];
    const leidos = claves.length ? await almacen.leerVarios(claves) : [], escribir = [];
    if (hayBase) {
      if (!leidos[0]) return { estado: 409, cuerpo: { pedirFoto: true, ultOp: c.ultOp } };
      const base = desgz(leidos[0]), m = new Map(base.stock.map(p => [p.k, p])); stDel.forEach(k => m.delete(k)); stock.forEach(p => m.set(p.k, p));
      base.stock = [...m.values()]; Object.assign(base, otros); if (typeof b.generado === 'string') base.generado = b.generado;
      escribir.push([K.base(c.id), gz(base)]);
    }
    dias.forEach((d, i) => { const ya = leidos[(hayBase ? 1 : 0) + i]; escribir.push([K.vd(c.id, d), gz(upsert(ya ? desgz(ya) : [], ventas.get(d))), VIDA_DIA_MS]); });
    c.ultOp = b.n; c.ultimaSync = iso(); if (escribir.length) c.ver = (c.ver || 0) + 1;
    await almacen.escribirVarios([...escribir, [K.est(c.id), JSON.stringify(estadoDe(c))]]);   // una sola llamada; el estado va último
    return { estado: 200, cuerpo: { ok: true, ultOp: c.ultOp } };
  }
  return { guardarFoto, leerFoto, aplicarOps };
}
module.exports = { crear, ErrorHttp, CAMPOS_ESTADO, estadoDe, conEstado, ventasPorDia, esObjeto };
