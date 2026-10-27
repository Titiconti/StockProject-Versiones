const assert = require('assert'), { EventEmitter } = require('events'), crear = require('../actualizador.js');
(async () => {
  const mk = (emp = true) => { const au = Object.assign(new EventEmitter(), { llamadas: 0, instalo: 0, checkForUpdates: async function () { this.llamadas++; this.emit('checking-for-update'); }, quitAndInstall(a, b) { this.instalo++; this.args = [a, b]; } });
    const estados = [], timers = [], antes = []; const u = crear({ autoUpdater: au, version: '2.0.0', empaquetada: emp, alEstado: e => estados.push(e.fase), antesDeInstalar: () => antes.push(1), esperar: (f, ms) => timers.push(['una', f, ms]), repetir: (f, ms) => timers.push(['cada', f, ms]), ahora: () => 1000 }); return { au, estados, timers, antes, u }; };
  // en desarrollo (sin instalar) no hace nada
  let t = mk(false); assert.strictEqual(t.u.iniciar().fase, 'desarrollo'); assert.strictEqual(t.timers.length, 0); await t.u.buscar(); assert.strictEqual(t.au.llamadas, 0);
  // instalado: se configura para bajar solo, instalar al cerrar y nunca versiones de prueba ni anteriores
  t = mk(); t.u.iniciar(); assert.deepStrictEqual([t.au.autoDownload, t.au.autoInstallOnAppQuit, t.au.allowPrerelease, t.au.allowDowngrade], [true, true, false, false]);
  assert.deepStrictEqual(t.timers.map(x => [x[0], x[2]]), [['una', 20000], ['cada', 6 * 36e5]], 'primera búsqueda a los 20 s, luego cada 6 horas'); t.u.iniciar(); assert.strictEqual(t.timers.length, 2, 'no se duplica si se llama dos veces');
  // flujo completo: buscar -> hay versión -> descarga -> lista
  t.timers[0][1](); await new Promise(r => setImmediate(r)); assert.strictEqual(t.au.llamadas, 1);
  t.au.emit('update-available', { version: '2.1.0' }); t.au.emit('download-progress', { percent: 41.6 }); let e = t.u.estado(); assert.deepStrictEqual([e.fase, e.nueva, e.pct, e.version], ['descargando', '2.1.0', 42, '2.0.0']);
  await t.u.buscar(); assert.strictEqual(t.au.llamadas, 1, 'no busca de nuevo mientras descarga'); assert.strictEqual(t.u.instalar().ok, false, 'no se puede instalar sin descarga terminada'); assert.strictEqual(t.au.instalo, 0);
  t.au.emit('update-downloaded', { version: '2.1.0' }); assert.strictEqual(t.u.estado().fase, 'lista'); t.timers[1][1](); assert.strictEqual(t.au.llamadas, 1, 'con una versión lista no sigue buscando');
  assert.deepStrictEqual(t.u.instalar(), { ok: true }); assert.strictEqual(t.antes.length, 1, 'hace el respaldo antes de instalar'); assert.deepStrictEqual(t.au.args, [false, true], 'no silencioso y reabre el programa');
  assert.deepStrictEqual(t.estados.filter((x, i, a) => a.indexOf(x) === i), ['buscando', 'descargando', 'lista']);
  // al día y errores de red: no molesta
  t = mk(); t.u.iniciar(); t.au.emit('update-not-available', {}); assert.strictEqual(t.u.estado().fase, 'al-dia'); assert(t.u.estado().ultima);
  t.au.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED')); e = t.u.estado(); assert.strictEqual(e.fase, 'sin-conexion'); assert(/INTERNET/.test(e.msg));
  t.au.checkForUpdates = async () => { throw new Error('boom'); }; assert.strictEqual((await t.u.buscar()).fase, 'sin-conexion');
  // búsqueda automática desactivada por el usuario: no busca solo, pero sí cuando se lo pide
  const au2 = Object.assign(new EventEmitter(), { llamadas: 0, async checkForUpdates() { this.llamadas++; } }); const tm = []; const u2 = crear({ autoUpdater: au2, version: '2.0.0', empaquetada: true, activo: () => false, esperar: (f) => tm.push(f), repetir: (f) => tm.push(f) });
  u2.iniciar(); tm.forEach(f => f()); assert.strictEqual(au2.llamadas, 0); await u2.buscar(); assert.strictEqual(au2.llamadas, 1);
  console.log('actualizador OK');
})().catch(e => { console.error(e); process.exit(1); });
