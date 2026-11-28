const assert = require('assert'), { JSDOM, HTML, until, api } = require('./helpers.js'), U = require('../usuarios.js');
const PERM = U.PERMISOS, mat = rol => Object.fromEntries(U.MODULOS.map(m => [m, (PERM[rol][m] || [])]));
const estado = (rol, extra = {}) => ({ habilitado: true, usuario: { id: 2, user: rol, nombre: rol.toUpperCase(), rol, prefs: extra.prefs || {} }, permisos: mat(rol), roles: U.ROLES, modulos: U.MODULOS, acciones: U.ACCIONES, permisosRol: PERM });

function remoto(auth) {   // acceso remoto simulado: fetch devuelve lo mínimo y registra las llamadas de usuarios
  const calls = [];
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.SP_BOOT = { rev: 0, data: null, defaults: {}, auth };
    w.fetch = async (u, o) => { const b = o && o.body ? JSON.parse(o.body) : {}; if (/^\/api\/auth\//.test(u)) calls.push([u.slice(10), b.args]);
      const j = /misSesiones|listar|auditoria/.test(u) ? [] : /rev/.test(u) ? { rev: 0 } : { ok: true };
      return { status: 200, ok: true, json: async () => j, text: async () => JSON.stringify(j) }; };
  } });
  return { ...api(dom.window), calls };
}
(async () => {
  // Consulta: ve Reportes pero no puede modificar nada; no ve Respaldos
  let a = remoto(estado('consulta'));
  assert.strictEqual(a.$('nav button[data-t=r]').classList.contains('hide'), false);
  assert.strictEqual(a.$('nav button[data-t=u]').textContent, 'Mi cuenta');
  assert(a.txt('#ses').includes('CONSULTA') && a.txt('#ses').includes('Consulta'));
  a.tab('o'); a.set('#os', 'Prov'); a.click('#og');
  assert.strictEqual(a.db().orders.length, 0, 'consulta no crea pedidos');
  assert(a.calls.some(c => c[0] === 'audit' && c[1][0] === 'acceso.denegado' && c[1][1] === 'pedidos.crear'), 'el intento denegado queda registrado');
  assert(a.txt('#toast').includes('no tiene permiso'));
  a.tab('u'); assert(await until(() => !a.$('#uon').classList.contains('hide')), 've su cuenta');
  assert(a.$('#uadm').classList.contains('hide') && a.$('#uaud').classList.contains('hide'), 'no ve la administración');
  assert(a.$('#uact').classList.contains('hide'), 'el remoto no puede activar usuarios');

  // Empleado: no ve Reportes; el tema oscuro de sus preferencias se aplica; sí puede crear pedidos
  a = remoto(estado('empleado', { prefs: { tema: 'oscuro', inicio: 'i' } }));
  assert(a.$('nav button[data-t=r]').classList.contains('hide'));
  assert.strictEqual(a.d.documentElement.dataset.theme, 'dark');
  assert(!a.$('#i').classList.contains('hide'), 'abre en la pantalla elegida');
  a.tab('o'); a.click('#og'); assert(!a.calls.some(c => c[1] && c[1][0] === 'acceso.denegado'), 'empleado sí crea pedidos');

  // Administrador: ve Usuarios, la grilla de permisos y el registro
  a = remoto(estado('admin'));
  assert.strictEqual(a.$('nav button[data-t=u]').textContent, 'Usuarios');
  a.tab('u'); assert(await until(() => a.$('#n_m').querySelectorAll('input').length === U.MODULOS.length * 4 - 1), 'grilla módulos x 4 acciones (Caja sin Eliminar)');
  assert(!a.$('#uadm').classList.contains('hide'));
  a.set('#n_r', 'consulta'); assert.strictEqual(a.$('#n_m').querySelectorAll('input:checked').length, 7, 'la grilla sigue al rol');
  a.set('#n_u', 'pepe'); a.set('#n_n', 'Pepe'); a.set('#n_p', 'Clave1234'); a.$('#n_m input[data-m=reporte][data-a=ver]').checked = false; a.click('#n_g');
  assert(await until(() => a.calls.some(c => c[0] === 'crear')));
  const c = a.calls.find(x => x[0] === 'crear')[1][0]; assert.deepStrictEqual([c.user, c.rol, c.deny], ['pepe', 'consulta', ['reporte.ver']], 'ajuste de permisos enviado como deny');

  // Escritorio sin usuarios: se puede activar (crea el administrador)
  const llam = []; const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.sp = { load: () => '', save: async () => ({ ok: true, rev: 1 }), version: () => 0, defaults: () => ({}), info: async () => ({ dir: 'x', last: null, warn: '' }), remote: async () => ({ running: false, urls: [] }), now: async () => ({}), choose: async () => ({}), restore: async () => true, print: async () => ({}), pdf: async () => ({}), setRemote: async () => ({}), exportBackup: async () => ({}),
      auth: { estado: () => ({ habilitado: false }), call: async (n, ...x) => { llam.push([n, x]); return n === 'crear' ? { ok: true } : []; }, ir: async () => true, login: async () => ({}), logout: async () => ({}) } }; } });
  const e = api(dom.window);
  assert.strictEqual(e.$('nav button[data-t=u]').classList.contains('hide'), false, 'en el escritorio siempre se ve Usuarios');
  assert(e.$('nav button[data-t=r]').classList.contains('hide') === false, 'sin usuarios se ve todo');
  e.tab('u'); assert(await until(() => !e.$('#uact').classList.contains('hide')));
  e.set('#a_u', 'admin'); e.set('#a_n', 'Dueño'); e.set('#a_p', 'Clave1234'); e.click('#a_g');
  assert(await until(() => llam.some(x => x[0] === 'crear' && x[1][0].rol === 'admin' && x[1][0].user === 'admin')), 'activa con un administrador');
  console.log('usuarios-ui OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
