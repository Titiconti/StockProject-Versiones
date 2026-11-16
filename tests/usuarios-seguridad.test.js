// Auditoría 16/11/2026: E3 (escalada de permisos), E4 (falta usuarios.json) y E6 (tope de recuperación).
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const crear = require('../usuarios.js');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-usrseg-'));
let t = Date.UTC(2026, 10, 16, 12); const ahora = () => t;
let marca = false;
const file = path.join(base, 'u.json');
const U = () => crear({ usersFile: file, auditFile: path.join(base, 'a.jsonl'), ahora, bloqueoMs: 6e4, maxRecuperarDia: 10, marcado: () => marca });
let us = U();
assert(us.crear(null, { user: 'ana', rol: 'admin', clave: 'Clave1234' }).ok);
marca = true;
const ses = n => us.sesion(us.login(n, 'Clave1234').token);
const admin = ses('ana');
const mk = (user, rol, x) => { const r = us.crear(admin, { user, rol, clave: 'Clave1234', ...x }); assert(r.ok, r.err); return r.usuario; };

// ---- E3: con usuarios.crear o usuarios.editar no se llega a administrador ----
const g = mk('gero', 'gerente', { extra: ['usuarios.crear', 'usuarios.editar'] });
const e = mk('luis', 'empleado');
const lg = ses('gero');
assert(us.tiene(lg, 'usuarios', 'crear'));
assert(!us.crear(lg, { user: 'malo', rol: 'admin', clave: 'Clave1234' }).ok, 'un no admin no crea administradores');
assert(!us.crear(lg, { user: 'malo2', rol: 'empleado', clave: 'Clave1234', extra: ['respaldo.eliminar'] }).ok, 'un no admin no da extras');
assert(us.crear(lg, { user: 'nuevo', rol: 'empleado', clave: 'Clave1234' }).ok, 'sí crea usuarios comunes');
assert(!us.editar(lg, g.id, { extra: ['usuarios.crear', 'usuarios.editar', 'acceso_remoto.editar'] }).ok, 'nadie se da extras a sí mismo');
assert(!us.editar(lg, e.id, { extra: ['finanzas.ver'] }).ok, 'un no admin no da extras a otro');
assert(us.editar(lg, e.id, { nombre: 'Luis P', extra: [] }).ok, 'editar sin tocar los extras sigue andando');
assert(!us.editar(lg, g.id, { rol: 'admin' }).ok);
assert(us.editar(lg, g.id, { nombre: 'Gero', extra: ['usuarios.crear', 'usuarios.editar'] }).ok, 'se puede editar el nombre propio con los mismos extras');
assert(us.editar(admin, e.id, { deny: ['ventas.crear'] }).ok);
assert(!us.editar(admin, e.id, { extra: ['cualquiera'] }).ok, 'permiso con formato inválido');
assert(us.editar(admin, e.id, { extra: ['finanzas.ver'] }).ok, 'el administrador sí da extras');
assert(us.crear(admin, { user: 'admin2', rol: 'admin', clave: 'Clave1234' }).ok, 'el administrador sí crea administradores');
// quien tiene usuarios.editar y un permiso denegado no se lo puede sacar
assert(us.editar(admin, g.id, { deny: ['finanzas.eliminar'] }).ok);
assert(!us.editar(ses('gero'), g.id, { deny: [] }).ok, 'no se quita sus propias restricciones');

// ---- E6: intentos de recuperación guardados y con tope diario ----
const lu = ses('luis'); assert(lu);
assert(us.setPregunta(us.login('luis', 'Clave1234').token, 'Clave1234', 'Nombre de mi perro', 'Firulais').ok);
const mal = () => us.recuperar('luis', 'otro', 'Nueva1234');
for (let i = 0; i < 5; i++) assert(!mal().ok);
assert(mal().bloqueado, 'quinto error: bloqueo de unos minutos');
us = U();   // se cierra y se vuelve a abrir el programa
assert(mal().bloqueado, 'el bloqueo sobrevive al reinicio');
t += 61e3; for (let i = 0; i < 5; i++) assert(!mal().ok);
t += 61e3;
const r = mal(); assert(r.bloqueado && /hoy/.test(r.err), 'tope diario alcanzado');
assert(us.recuperar('luis', 'Firulais', 'Nueva1234').bloqueado, 'con el tope ni la respuesta buena pasa hasta mañana');
t += 24 * 36e5;
assert(us.recuperar('luis', 'Firulais', 'Nueva1234').ok, 'al otro día se puede');
assert(!JSON.stringify(us.listar(admin)).includes('"rec"'), 'el contador no sale en la lista');

// ---- E4: si se borra usuarios.json con la marca puesta, no queda abierto ----
fs.unlinkSync(file);
us = U();
assert(us.habilitado(), 'sigue pidiendo ingresar');
assert(us.faltanUsuarios());
assert(!us.crear(null, { user: 'intruso', rol: 'admin', clave: 'Clave1234' }).ok, 'no se puede crear un "primer" administrador');
assert(!us.login('ana', 'Clave1234').ok);
assert(us.llamar(null, 'estado').faltanUsuarios);
assert(!us.tiene(us.sesion(null), 'configuracion', 'editar'));
// Archivo dañado: lo mismo.
fs.writeFileSync(file, '{roto');
assert(U().habilitado() && U().faltanUsuarios());
// Sin la marca (programa que nunca usó usuarios) todo sigue como siempre.
marca = false; fs.unlinkSync(file);
us = U(); assert(!us.habilitado() && !us.faltanUsuarios());
assert(us.crear(null, { user: 'ana', rol: 'admin', clave: 'Clave1234' }).ok);
console.log('usuarios-seguridad: ok');

// ---- V2: jerarquía de roles para quien maneja usuarios sin ser administrador ----
{
  marca = false; try { fs.unlinkSync(file); } catch (e) {}
  const u2 = U();
  assert(u2.crear(null, { user: 'jefa', rol: 'admin', clave: 'Clave1234' }).ok);
  const ad = u2.sesion(u2.login('jefa', 'Clave1234').token);
  const mk2 = (user, rol, x) => { const r = u2.crear(ad, { user, rol, clave: 'Clave1234', ...x }); assert(r.ok, r.err); return r.usuario; };
  const ge = mk2('gere', 'gerente', { extra: ['usuarios.crear', 'usuarios.editar'] }), ge2 = mk2('gere2', 'gerente');
  const em = mk2('emple', 'empleado', { extra: ['usuarios.crear', 'usuarios.editar'] }), em2 = mk2('emple2', 'empleado');
  const sg = u2.sesion(u2.login('gere', 'Clave1234').token), se = u2.sesion(u2.login('emple', 'Clave1234').token);
  assert(!u2.editar(sg, ad.id, { clave: 'Robada123' }).ok, 'un gerente no le cambia la clave a un admin');
  assert(!u2.editar(sg, ge2.id, { clave: 'Robada123' }).ok, 'ni a otro gerente');
  assert(u2.editar(sg, em2.id, { clave: 'Nueva1234' }).ok, 'sí a un empleado');
  assert(!u2.editar(sg, em2.id, { rol: 'gerente' }).ok, 'no asciende a gerente');
  assert(u2.editar(sg, em2.id, { rol: 'consulta' }).ok, 'sí cambia a consulta');
  assert(!u2.crear(se, { user: 'gnuevo', rol: 'gerente', clave: 'Clave1234' }).ok, 'un empleado no crea gerentes');
  assert(!u2.crear(sg, { user: 'gnuevo', rol: 'gerente', clave: 'Clave1234' }).ok, 'un gerente tampoco');
  assert(u2.crear(se, { user: 'cnuevo', rol: 'consulta', clave: 'Clave1234' }).ok);
  assert(!u2.editar(se, ge.id, { nombre: 'x' }).ok, 'un empleado no edita a un gerente');
  assert(u2.editar(ad, ge2.id, { clave: 'Nueva1234', rol: 'empleado' }).ok, 'el admin sí');
  console.log('usuarios-seguridad V2: ok');
}
