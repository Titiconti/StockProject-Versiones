// Redis simulado con la API REST de Upstash (comando como lista JSON; /pipeline con lista de comandos). Soporta lo que usa
// nube/almacen.js: GET, MGET, SET (con NX y PX), DEL, INCR, INCRBY y PEXPIRE, con vencimientos según el reloj que se le pase.
// comandos = comandos contados como los cuenta Upstash (cada uno del pipeline); peticiones = pedidos HTTP.
const assert = require('assert');
module.exports = function redisSimulado({ token = 'tok', reloj = () => Date.now() } = {}) {
  const R = new Map(), vence = new Map(), usados = new Set(); let comandos = 0, peticiones = 0, fallar = null;
  const vivo = k => { if (vence.has(k) && vence.get(k) <= reloj()) { R.delete(k); vence.delete(k); } return R.has(k); };
  const ejecutar = ([c, ...a]) => {
    comandos++; usados.add(c);
    let r = null;
    if (c === 'GET') r = vivo(a[0]) ? R.get(a[0]) : null;
    else if (c === 'MGET') r = a.map(k => vivo(k) ? R.get(k) : null);
    else if (c === 'SET') {
      const op = a.slice(2).map(x => String(x).toUpperCase()), nx = op.includes('NX'), px = op.indexOf('PX');
      if (nx && vivo(a[0])) r = null;
      else { R.set(a[0], String(a[1])); vence.delete(a[0]); if (px >= 0) vence.set(a[0], reloj() + Number(a[2 + px + 1])); r = 'OK'; }
    } else if (c === 'DEL') { r = +(vivo(a[0]) && R.delete(a[0])); vence.delete(a[0]); }
    else if (c === 'INCR' || c === 'INCRBY') { const n = (vivo(a[0]) ? Number(R.get(a[0])) : 0) + (c === 'INCR' ? 1 : Number(a[1])); assert(Number.isFinite(n), 'INCR sobre algo que no es número'); R.set(a[0], String(n)); r = n; }
    else if (c === 'PEXPIRE') { if (vivo(a[0])) { vence.set(a[0], reloj() + Number(a[1])); r = 1; } else r = 0; }
    else throw new Error('Comando no simulado: ' + c);
    return r;
  };
  const pedir = async (u, o) => {
    peticiones++; assert.strictEqual(o.headers.Authorization, 'Bearer ' + token);
    if (fallar) { const e = fallar; fallar = null; if (e === 'corte') throw new TypeError('fetch failed'); return { ok: false, status: e, json: async () => ({}) }; }
    const cuerpo = JSON.parse(o.body);
    if (/\/pipeline$/.test(u)) return { ok: true, json: async () => cuerpo.map(c => ({ result: ejecutar(c) })) };
    return { ok: true, json: async () => ({ result: ejecutar(cuerpo) }) };
  };
  return { R, vence, pedir, usados, get comandos() { return comandos; }, get peticiones() { return peticiones; }, fallarProximo: e => { fallar = e; } };
};
