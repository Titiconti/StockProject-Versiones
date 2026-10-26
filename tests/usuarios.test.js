const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const crear = require('../usuarios.js');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-usr-'));
let t = 1e12; const ahora = () => t;
const U = () => crear({ usersFile: path.join(base, 'u.json'), auditFile: path.join(base, 'a.jsonl'), ahora, maxSesiones: 2, bloqueoMs: 6e4 });
const us = U();

// sin usuarios: el sistema está "abierto" (como en versiones anteriores)
assert.strictEqual(us.habilitado(), false);
// el primer usuario tiene que ser administrador y la clave tiene que ser razonable
assert(!us.crear(null, { user: 'ana', rol: 'empleado', clave: 'Clave1234' }).ok);
assert(!us.crear(null, { user: 'ana', rol: 'admin', clave: 'corta1' }).ok);
assert(!us.crear(null, { user: 'ana', rol: 'admin', clave: 'soloLetrasXX' }).ok);
assert(!us.crear(null, { user: 'a b', rol: 'admin', clave: 'Clave1234' }).ok);
let r = us.crear(null, { user: 'ana', nombre: 'Ana', rol: 'admin', clave: 'Clave1234' }); assert(r.ok); assert(!JSON.stringify(r).includes('hash'));
assert(us.habilitado());
assert(!fs.readFileSync(path.join(base, 'u.json'), 'utf8').includes('Clave1234'), 'la clave no se guarda en claro');

// inicio de sesión
assert(!us.login('ana', 'mala').ok);
let a = us.login('ANA', 'Clave1234', 'PC caja'); assert(a.ok && a.token && a.permisos.usuarios.includes('crear'));
const admin = us.sesion(a.token); assert.strictEqual(admin.rol, 'admin');

// permisos por rol
const mk = (user, rol, extra) => { const x = us.crear(admin, { user, rol, clave: 'Clave1234', ...extra }); assert(x.ok, x.err); return x.usuario; };
const emp = mk('luis', 'empleado'), con = mk('vera', 'consulta'), ger = mk('gero', 'gerente');
assert(!us.crear(admin, { user: 'luis', rol: 'empleado', clave: 'Clave1234' }).ok, 'usuario repetido');
const sesU = n => us.sesion(us.login(n, 'Clave1234').token);
const le = sesU('luis'), lc = sesU('vera'), lg = sesU('gero');
assert(us.tiene(le, 'ventas', 'crear') && !us.tiene(le, 'ventas', 'eliminar') && !us.tiene(le, 'reporte', 'ver') && !us.tiene(le, 'usuarios', 'ver'));
assert(us.tiene(lc, 'reporte', 'ver') && !us.puedeEscribir(lc), 'consulta no escribe');
assert(us.puedeEscribir(le) && us.puedeEscribir(lg));
assert(us.tiene(lg, 'reporte', 'ver') && us.tiene(lg, 'usuarios', 'ver') && !us.tiene(lg, 'usuarios', 'crear'));
assert(!us.crear(le, { user: 'x1x', rol: 'empleado', clave: 'Clave1234' }).ok, 'empleado no crea usuarios');
assert.deepStrictEqual(us.listar(le), []);
// permisos granulares por usuario: extra y deny
assert(us.editar(admin, emp.id, { extra: ['reporte.ver'], deny: ['ventas.crear'] }).ok);
const le2 = sesU('luis'); assert(us.tiene(le2, 'reporte', 'ver') && !us.tiene(le2, 'ventas', 'crear') && us.tiene(le2, 'ventas', 'ver'));

// tope de sesiones simultáneas (2): la tercera cierra la más antigua
const s1 = us.login('vera', 'Clave1234', 'celu'), s2 = us.login('vera', 'Clave1234', 'tablet'), s3 = us.login('vera', 'Clave1234', 'pc');
assert(!us.sesion(s1.token) && us.sesion(s2.token) && us.sesion(s3.token));
assert.strictEqual(us.misSesiones(s3.token).length, 2); assert(us.cerrarOtras(s3.token).ok); assert(!us.sesion(s2.token) && us.sesion(s3.token));
// vencimiento por inactividad
t += 13 * 36e5; assert(!us.sesion(s3.token), 'sesión vencida por inactividad'); t += 1;

// bloqueo por intentos
for (let i = 0; i < 5; i++) assert(!us.login('gero', 'x' + i).ok);
r = us.login('gero', 'Clave1234'); assert(r.bloqueado && !r.ok);
t += 61e3; assert(us.login('gero', 'Clave1234').ok, 'se desbloquea con el tiempo');

// último administrador protegido
a = us.login('ana', 'Clave1234'); const ad = us.sesion(a.token);
assert(!us.editar(ad, ad.id, { activo: false }).ok); assert(!us.editar(ad, ad.id, { rol: 'gerente' }).ok);
// desactivar usuario cierra sesiones y bloquea el ingreso
const sv = us.login('vera', 'Clave1234'); assert(us.editar(ad, con.id, { activo: false }).ok); assert(!us.sesion(sv.token)); assert(!us.login('vera', 'Clave1234').ok);

// perfil: cambiar clave, pregunta de seguridad y recuperación
const lg2 = us.login('luis', 'Clave1234').token;
assert(!us.cambiarClave(lg2, 'mala', 'Nueva12345').ok); assert(!us.cambiarClave(lg2, 'Clave1234', 'corta').ok);
assert(us.cambiarClave(lg2, 'Clave1234', 'Nueva12345').ok); assert(us.login('luis', 'Nueva12345').ok && !us.login('luis', 'Clave1234').ok);
const tk = us.login('luis', 'Nueva12345').token;
assert.strictEqual(us.preguntaDe('luis'), ''); assert(!us.setPregunta(tk, 'Nueva12345', 'Mascota', 'a').ok);
assert(us.setPregunta(tk, 'Nueva12345', '¿Nombre de tu primera mascota?', 'Firulais').ok);
assert.strictEqual(us.preguntaDe('luis'), '¿Nombre de tu primera mascota?');
assert(!us.recuperar('luis', 'otro', 'Otra123456').ok);
assert(!us.recuperar('luis', 'firulais', 'corta').ok);
assert(us.recuperar('luis', '  FIRULAIS ', 'Otra123456').ok, 'la respuesta no distingue mayúsculas ni espacios');
assert(us.login('luis', 'Otra123456').ok); assert(!us.sesion(tk), 'recuperar cierra las sesiones abiertas');
assert(!us.recuperar('nadie', 'x', 'Otra123456').ok);
assert(us.setPrefs(us.login('luis', 'Otra123456').token, { tema: 'oscuro', inicio: 'i', malo: 1 }).prefs.tema === 'oscuro');

// auditoría: registra y no incluye claves
const log = us.auditoria({ limite: 500 }), acc = log.map(x => x.accion);
['usuario.crear', 'login', 'login.fallido', 'clave.cambio', 'recuperar.ok', 'usuario.editar'].forEach(k => assert(acc.includes(k), 'falta ' + k));
assert(!fs.readFileSync(path.join(base, 'a.jsonl'), 'utf8').match(/Clave1234|Nueva12345|Otra123456|Firulais/i));
assert(us.auditoria({ uid: emp.id }).every(x => x.uid === emp.id));
// persistencia: otra instancia lee los mismos usuarios
assert(U().login('ana', 'Clave1234').ok);
console.log('usuarios OK');
