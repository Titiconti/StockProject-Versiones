// Usuarios, roles, permisos, sesiones y auditoría. No depende de Electron: se prueba con Node solo.
// Los usuarios se guardan en su propio archivo (usuarios.json) y la auditoría en auditoria.jsonl, junto a los datos.
// Mientras no exista ningún usuario, el sistema funciona como siempre (sin inicio de sesión).
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const MODULOS = ['ventas', 'inventario', 'productos', 'pedidos', 'clientes', 'escuela', 'reporte', 'finanzas', 'configuracion', 'respaldo', 'acceso_remoto', 'usuarios'];
const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'];
const ROLES = {
  admin: { nombre: 'Administrador' },
  gerente: { nombre: 'Gerente' },
  empleado: { nombre: 'Empleado' },
  consulta: { nombre: 'Consulta' }
};
const todo = () => Object.fromEntries(MODULOS.map(m => [m, ACCIONES.slice()]));
// Permisos por defecto de cada rol: módulo -> acciones permitidas.
const PERMISOS = {
  admin: todo(),
  gerente: { ...todo(), configuracion: ['ver', 'editar'], respaldo: ['ver', 'crear'], acceso_remoto: [], usuarios: ['ver'] },
  empleado: { ventas: ['ver', 'crear'], inventario: ['ver'], productos: ['ver', 'crear', 'editar'], pedidos: ['ver', 'crear'], clientes: ['ver', 'crear', 'editar'], escuela: ['ver', 'crear'] },
  consulta: Object.fromEntries(['ventas', 'inventario', 'productos', 'pedidos', 'clientes', 'escuela', 'reporte'].map(m => [m, ['ver']]))
};

// Permisos finos (independientes de los módulos de arriba). Formato igual: "modulo.accion" en `extra` / `deny` del usuario.
// admin y gerente los tienen todos; los demás roles solo heredan lo que ya podían hacer (HEREDA), así nadie gana acceso nuevo.
// Ver costos, márgenes y rentabilidad NO se hereda: un empleado no los tenía definidos y ahora no los ve.
const FINOS = {
  costos: { nombre: 'Costos de compra', acciones: ['ver', 'editar'] },
  margenes: { nombre: 'Márgenes', acciones: ['ver', 'editar'] },
  rentabilidad: { nombre: 'Reportes de rentabilidad (ganancia)', acciones: ['ver'] },
  proveedores: { nombre: 'Proveedores', acciones: ['ver', 'editar'] },
  precios: { nombre: 'Precio de venta', acciones: ['editar'] },
  descuentos: { nombre: 'Aplicar descuentos', acciones: ['crear'] },
  anulacion: { nombre: 'Anular (crear) y corregir (editar) ventas', acciones: ['crear', 'editar'] },
  caja: { nombre: 'Caja: ver arqueo (ver), operar (crear), corregir cierres (editar)', acciones: ['ver', 'crear', 'editar'] }
};
const HEREDA = { proveedores: { ver: ['pedidos', 'ver'], editar: ['pedidos', 'crear'] }, precios: { editar: ['productos', 'editar'] }, descuentos: { crear: ['ventas', 'crear'] }, anulacion: { crear: ['ventas', 'eliminar'], editar: ['ventas', 'eliminar'] }, caja: { crear: ['ventas', 'crear'] } };   // caja.ver y caja.editar no se heredan: solo admin y gerente
const ROLES_PLENOS = ['admin', 'gerente'];
const esFino = k => typeof k === 'string' && k.split('.').length === 2 && !!FINOS[k.split('.')[0]] && FINOS[k.split('.')[0]].acciones.includes(k.split('.')[1]);

// Permiso = permisos del rol + extras concedidos al usuario - denegados al usuario (formato "modulo.accion").
function tiene(u, modulo, accion = 'ver') {
  if (!u || !u.activo) return false;
  const k = modulo + '.' + accion;
  if ((u.deny || []).includes(k)) return false;
  if (esFino(k)) {
    if (ROLES_PLENOS.includes(u.rol) || (u.extra || []).includes(k)) return true;
    const h = (HEREDA[modulo] || {})[accion];
    return !!h && tiene(u, h[0], h[1]);
  }
  return ((PERMISOS[u.rol] || {})[modulo] || []).includes(accion) || (u.extra || []).includes(k);
}
const matriz = u => ({ ...Object.fromEntries(MODULOS.map(m => [m, ACCIONES.filter(a => tiene(u, m, a))])), ...Object.fromEntries(Object.entries(FINOS).map(([m, f]) => [m, f.acciones.filter(a => tiene(u, m, a))])) });

const SCRYPT = { N: 16384, r: 8, p: 1 };
const hash = (clave, salt) => crypto.scryptSync(String(clave), Buffer.from(salt, 'hex'), 32, SCRYPT).toString('hex');
const nuevoSalt = () => crypto.randomBytes(16).toString('hex');
const igual = (a, b) => { const x = Buffer.from(String(a), 'hex'), y = Buffer.from(String(b), 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

module.exports = function ({ usersFile, auditFile, maxSesiones = 3, inactividad = 12 * 36e5, bloqueoMs = 5 * 6e4, maxIntentos = 5, maxRecuperarDia = 10, ahora = () => Date.now(), marcado = () => false }) {
  // marcado(): el programa ya usaba inicio de sesión (marca guardada en la configuración y en los datos). Si es así y
  // usuarios.json falta o no se puede leer, no se abre libre: se sigue pidiendo ingresar y no se puede crear un "primer" administrador.
  const rd = () => { try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')) } catch (e) { return { users: [], uid: 1 } } };
  const wr = d => { fs.mkdirSync(path.dirname(usersFile), { recursive: true }); const t = usersFile + '.tmp'; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, usersFile); };
  const sesiones = new Map();           // token -> { uid, device, desde, visto }
  const intentos = new Map();           // usuario -> { n, hasta }

  const publico = u => u && ({ id: u.id, user: u.user, nombre: u.nombre, rol: u.rol, activo: u.activo, prefs: u.prefs || {}, pregunta: u.pregunta || '', extra: u.extra || [], deny: u.deny || [], creado: u.creado, ultimoAcceso: u.ultimoAcceso || null });
  const find = (d, user) => d.users.find(u => norm(u.user) === norm(user));
  const habilitado = () => rd().users.length > 0 || !!marcado();
  const faltanUsuarios = () => !rd().users.length && !!marcado();
  // Jerarquía de roles: un no administrador solo maneja usuarios de rango menor al suyo y asigna como máximo "empleado".
  const RANGO = { consulta: 0, empleado: 1, gerente: 2, admin: 3 }, MAX_SIN_ADMIN = 1;
  const esAdmin = u => !!(u && u.activo && u.rol === 'admin');
  const PERMISO_OK = k => esFino(k) || (typeof k === 'string' && MODULOS.includes(k.split('.')[0]) && ACCIONES.includes(k.split('.')[1]) && k.split('.').length === 2);
  const mismos = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());

  // ---- auditoría (archivo de texto, un registro por línea) ----
  function audit(quien, accion, detalle) {
    try {
      fs.mkdirSync(path.dirname(auditFile), { recursive: true });
      try { if (fs.statSync(auditFile).size > 5e6) fs.renameSync(auditFile, auditFile.replace(/\.jsonl$/, '') + '-' + ahora() + '.jsonl'); } catch (e) {}
      fs.appendFileSync(auditFile, JSON.stringify({ t: new Date(ahora()).toISOString(), uid: quien ? quien.id : null, user: quien ? quien.user : '-', accion, detalle: detalle || '' }) + '\n');
    } catch (e) {}
  }
  function auditoria({ uid, desde, limite = 300 } = {}) {
    let l = []; try { l = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) {}
    if (uid) l = l.filter(x => x.uid === uid);
    if (desde) l = l.filter(x => x.t >= desde);
    return l.reverse().slice(0, limite);
  }

  // ---- permisos ---- (tiene y matriz están arriba, a nivel del módulo, para poder probarlas sin usuarios guardados)
  const baseRol = Object.fromEntries(Object.keys(ROLES).map(r => [r, matriz({ activo: true, rol: r, extra: [], deny: [] })]));
  // Si el usuario no ve costos, ni márgenes, ni rentabilidad, el proceso principal no le entrega los costos.
  const veCostos = u => tiene(u, 'costos', 'ver') || tiene(u, 'margenes', 'ver') || tiene(u, 'rentabilidad', 'ver');
  const puedeEscribir = u => MODULOS.some(m => ['crear', 'editar', 'eliminar'].some(a => m !== 'usuarios' && tiene(u, m, a)));

  // Heladería: solo administrador y gerente cambian precios (el empleado vende, carga stock y ajusta baldes).
  const puedePrecios = u => !!u && u.activo && ['admin', 'gerente'].includes(u.rol) && tiene(u, 'productos', 'editar') && tiene(u, 'precios', 'editar');
  // ¿El guardado cambia el precio de algún producto que ya existía? Solo cuenta si el negocio es una heladería (cfg.rubro o caps).
  function cambiaPrecios(antes, despues) {
    let a, n; try { a = JSON.parse(antes); n = JSON.parse(despues); } catch (e) { return false; }
    const hel = x => !!(x && x.cfg && (x.cfg.rubro === 'heladeria' || (x.cfg.caps && x.cfg.caps.heladeria)));
    if (!hel(a) || !Array.isArray(a.prods) || !Array.isArray(n.prods)) return false;
    const ant = new Map(a.prods.map(p => [p && p.id, p]));
    return n.prods.some(p => { const o = p && ant.get(p.id); return !!o && Number(o.price || 0) !== Number(p.price || 0); });
  }

  function validarClave(c) {
    c = String(c || '');
    if (c.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (!/[A-Za-z]/.test(c) || !/\d/.test(c)) return 'La contraseña debe combinar letras y números';
    return '';
  }
  const validarUser = (d, user, id) => {
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(String(user || ''))) return 'El usuario debe tener entre 3 y 30 letras, números, punto, guion o guion bajo';
    if (d.users.some(u => u.id !== id && norm(u.user) === norm(user))) return 'Ya existe un usuario con ese nombre';
    return '';
  };
  const admins = d => d.users.filter(u => u.rol === 'admin' && u.activo);

  // Texto de lo que cambió en los permisos de un usuario ('' si no cambió nada): rol, permisos dados (+) y quitados (-).
  function detallePermisos(antes, u) {
    const dif = (a, b) => (b || []).filter(k => !(a || []).includes(k));
    const partes = [];
    if (antes.rol !== u.rol) partes.push('rol ' + antes.rol + '->' + u.rol);
    if (antes.activo !== u.activo) partes.push(u.activo ? 'activado' : 'desactivado');
    [['+extra', dif(antes.extra, u.extra)], ['-extra', dif(u.extra, antes.extra)], ['+deny', dif(antes.deny, u.deny)], ['-deny', dif(u.deny, antes.deny)]].forEach(([n, l]) => { if (l.length) partes.push(n + ':' + l.join(',')); });
    return partes.join(' ');
  }
  // ---- alta y edición ----
  function crear(quien, { user, nombre, rol, clave, extra, deny }) {
    const d = rd();
    if (faltanUsuarios()) return { ok: false, err: 'Falta el archivo de usuarios: restauralo antes de seguir' };
    if (d.users.length && !tiene(quien, 'usuarios', 'crear')) return { ok: false, err: 'Sin permiso para crear usuarios' };
    if (!ROLES[rol]) return { ok: false, err: 'Rol inválido' };
    let e = validarUser(d, user) || validarClave(clave); if (e) return { ok: false, err: e };
    if (!d.users.length && rol !== 'admin') return { ok: false, err: 'El primer usuario debe ser administrador' };
    // Solo un administrador crea administradores o da permisos extra (E3).
    if (d.users.length && rol === 'admin' && !esAdmin(quien)) return { ok: false, err: 'Solo un administrador puede crear administradores' };
    if (d.users.length && !esAdmin(quien) && RANGO[rol] > MAX_SIN_ADMIN) return { ok: false, err: 'Solo un administrador puede crear usuarios con ese rol' };
    if ((extra || []).length && d.users.length && !esAdmin(quien)) return { ok: false, err: 'Solo un administrador puede dar permisos extra' };
    if (![...(extra || []), ...(deny || [])].every(PERMISO_OK)) return { ok: false, err: 'Permiso inválido' };
    const salt = nuevoSalt(), u = { id: d.uid++, user: String(user).trim(), nombre: String(nombre || user).trim(), rol, salt, hash: hash(clave, salt), activo: true, extra: extra || [], deny: deny || [], prefs: {}, creado: new Date(ahora()).toISOString() };
    d.users.push(u); wr(d);
    audit(quien || u, 'usuario.crear', u.user + ' (' + rol + ')');
    const alta = detallePermisos({ rol, extra: [], deny: [], activo: true }, u);
    if (alta) audit(quien || u, 'permisos.cambiar', u.user + ' ' + alta);
    return { ok: true, usuario: publico(u) };
  }
  function editar(quien, id, patch) {
    const d = rd(), u = d.users.find(x => x.id === id);
    if (!u) return { ok: false, err: 'Usuario inexistente' };
    if (!tiene(quien, 'usuarios', 'editar')) return { ok: false, err: 'Sin permiso para editar usuarios' };
    if (patch.rol !== undefined && !ROLES[patch.rol]) return { ok: false, err: 'Rol inválido' };
    const eraAdmin = u.rol === 'admin' && u.activo;
    const sera = { rol: patch.rol !== undefined ? patch.rol : u.rol, activo: patch.activo !== undefined ? !!patch.activo : u.activo };
    if (eraAdmin && !(sera.rol === 'admin' && sera.activo) && admins(d).length <= 1) return { ok: false, err: 'Tiene que quedar al menos un administrador activo' };
    if (u.rol !== 'admin' && patch.rol === 'admin' && quien.rol !== 'admin') return { ok: false, err: 'Solo un administrador puede crear administradores' };
    if (!esAdmin(quien) && quien.id !== u.id && RANGO[u.rol] >= RANGO[quien.rol]) return { ok: false, err: 'No podés modificar a un usuario con un rol igual o mayor al tuyo' };
    if (!esAdmin(quien) && patch.rol !== undefined && patch.rol !== u.rol && RANGO[patch.rol] > MAX_SIN_ADMIN) return { ok: false, err: 'Solo un administrador puede asignar ese rol' };
    // Permisos extra: solo los da un administrador. Nadie amplía sus propios permisos (E3).
    if (patch.extra !== undefined && !mismos(patch.extra, u.extra) && !esAdmin(quien)) return { ok: false, err: 'Solo un administrador puede dar permisos extra' };
    if ([...(patch.extra || []), ...(patch.deny || [])].some(k => !PERMISO_OK(k))) return { ok: false, err: 'Permiso inválido' };
    if (!esAdmin(quien) && quien.id === u.id) {
      if ((patch.rol !== undefined && patch.rol !== u.rol) || (patch.deny !== undefined && (u.deny || []).some(k => !patch.deny.includes(k)))) return { ok: false, err: 'No podés ampliar tus propios permisos' };
    }
    const antes = { rol: u.rol, extra: u.extra || [], deny: u.deny || [], activo: u.activo };
    ['nombre', 'extra', 'deny'].forEach(k => { if (patch[k] !== undefined) u[k] = patch[k]; });
    u.rol = sera.rol; u.activo = sera.activo;
    if (patch.clave) { const e = validarClave(patch.clave); if (e) return { ok: false, err: e }; u.salt = nuevoSalt(); u.hash = hash(patch.clave, u.salt); }
    wr(d);
    if (!u.activo || patch.clave || patch.rol !== undefined) cerrarSesiones(u.id);
    audit(quien, 'usuario.editar', u.user + ' ' + Object.keys(patch).filter(k => k !== 'clave').join(',') + (patch.clave ? ',clave' : ''));
    // Auditoría de permisos: quién (el registro), a quién (u.user), qué cambió y cuándo (la fecha del registro).
    const cambioPermisos = detallePermisos(antes, u);
    if (cambioPermisos) audit(quien, 'permisos.cambiar', u.user + ' ' + cambioPermisos);
    return { ok: true, usuario: publico(u) };
  }
  const listar = quien => tiene(quien, 'usuarios', 'ver') ? rd().users.map(publico) : [];

  // ---- inicio de sesión y sesiones (varios dispositivos, con tope) ----
  function login(user, clave, device = '') {
    const d = rd(), u = find(d, user), k = norm(user), it = intentos.get(k) || { n: 0, hasta: 0 };
    if (it.hasta > ahora()) return { ok: false, bloqueado: true, err: 'Demasiados intentos. Probá de nuevo en unos minutos.' };
    const okClave = u ? igual(hash(clave, u.salt), u.hash) : (hash(clave, '00'.repeat(16)), false);   // mismo costo exista o no el usuario
    if (!u || !u.activo || !okClave) {
      it.n++; if (it.n >= maxIntentos) { it.hasta = ahora() + bloqueoMs; it.n = 0; }
      intentos.set(k, it); audit(u || null, 'login.fallido', u ? '' : String(user).slice(0, 40));
      return { ok: false, err: 'Usuario o contraseña incorrectos' };
    }
    intentos.delete(k);
    // tope de sesiones simultáneas: se cierra la más antigua
    const mias = [...sesiones.entries()].filter(([, s]) => s.uid === u.id).sort((a, b) => a[1].visto - b[1].visto);
    while (mias.length >= maxSesiones) sesiones.delete(mias.shift()[0]);
    const token = crypto.randomBytes(24).toString('hex');
    sesiones.set(token, { uid: u.id, device: String(device).slice(0, 80), desde: ahora(), visto: ahora() });
    u.ultimoAcceso = new Date(ahora()).toISOString(); wr(d);
    audit(u, 'login', device);
    return { ok: true, token, usuario: publico(u), permisos: matriz(u) };
  }
  // Devuelve el usuario de la sesión (y renueva su actividad) o null si venció o fue cerrada.
  function sesion(token) {
    const s = sesiones.get(token); if (!s) return null;
    if (ahora() - s.visto > inactividad) { sesiones.delete(token); return null; }
    const u = rd().users.find(x => x.id === s.uid);
    if (!u || !u.activo) { sesiones.delete(token); return null; }
    s.visto = ahora(); return u;
  }
  function logout(token) { const u = sesion(token); sesiones.delete(token); if (u) audit(u, 'logout'); return { ok: true }; }
  function cerrarSesiones(uid, excepto) { [...sesiones.entries()].forEach(([t, s]) => { if (s.uid === uid && t !== excepto) sesiones.delete(t); }); }
  const misSesiones = (token) => { const u = sesion(token); return u ? [...sesiones.entries()].filter(([, s]) => s.uid === u.id).map(([t, s]) => ({ id: t.slice(0, 8), actual: t === token, device: s.device, desde: new Date(s.desde).toISOString(), visto: new Date(s.visto).toISOString() })) : []; };
  function cerrarOtras(token) { const u = sesion(token); if (!u) return { ok: false }; cerrarSesiones(u.id, token); audit(u, 'sesiones.cerrar_otras'); return { ok: true }; }

  // ---- perfil: contraseña, pregunta de seguridad, preferencias ----
  function cambiarClave(token, actual, nueva) {
    const d = rd(), s = sesiones.get(token), u = s && d.users.find(x => x.id === s.uid);
    if (!u) return { ok: false, err: 'Sesión vencida' };
    if (!igual(hash(actual, u.salt), u.hash)) { audit(u, 'clave.cambio_fallido'); return { ok: false, err: 'La contraseña actual no es correcta' }; }
    const e = validarClave(nueva); if (e) return { ok: false, err: e };
    u.salt = nuevoSalt(); u.hash = hash(nueva, u.salt); wr(d); cerrarSesiones(u.id, token); audit(u, 'clave.cambio');
    return { ok: true };
  }
  function setPregunta(token, clave, pregunta, respuesta) {
    const d = rd(), s = sesiones.get(token), u = s && d.users.find(x => x.id === s.uid);
    if (!u) return { ok: false, err: 'Sesión vencida' };
    if (!igual(hash(clave, u.salt), u.hash)) return { ok: false, err: 'La contraseña no es correcta' };
    if (String(pregunta || '').trim().length < 5 || norm(respuesta).length < 3) return { ok: false, err: 'Escribí una pregunta y una respuesta de al menos 3 letras' };
    u.pregunta = String(pregunta).trim(); u.rsalt = nuevoSalt(); u.rhash = hash(norm(respuesta), u.rsalt); wr(d); audit(u, 'pregunta.config');
    return { ok: true };
  }
  function setPrefs(token, prefs) {
    const d = rd(), s = sesiones.get(token), u = s && d.users.find(x => x.id === s.uid);
    if (!u) return { ok: false };
    const p = {}; if (['claro', 'oscuro', 'auto'].includes(prefs.tema)) p.tema = prefs.tema; if (/^[a-z]$/.test(prefs.inicio || '')) p.inicio = prefs.inicio;
    u.prefs = { ...(u.prefs || {}), ...p }; wr(d); return { ok: true, prefs: u.prefs };
  }
  // Recuperación sin correo: pregunta de seguridad (con el mismo bloqueo por intentos que el inicio de sesión).
  function preguntaDe(user) { const u = find(rd(), user); return u && u.activo && u.pregunta ? u.pregunta : ''; }
  // Los intentos de un usuario que existe se guardan en usuarios.json (sobreviven a cerrar el programa) y tienen tope diario (E6).
  function recuperar(user, respuesta, nueva) {
    const d = rd(), u = find(d, user), k = 'rec:' + norm(user), hoy = new Date(ahora()).toISOString().slice(0, 10);
    const it = u ? { n: 0, hasta: 0, dia: hoy, hoy: 0, ...((d.rec || {})[u.id] || {}) } : (intentos.get(k) || { n: 0, hasta: 0, dia: hoy, hoy: 0 });
    if (it.dia !== hoy) { it.dia = hoy; it.hoy = 0; }
    if (it.hasta > ahora()) return { ok: false, bloqueado: true, err: 'Demasiados intentos. Probá de nuevo en unos minutos.' };
    if (it.hoy >= maxRecuperarDia) return { ok: false, bloqueado: true, err: 'Llegaste al máximo de intentos de hoy. Probá mañana o pedile a un administrador que te cambie la contraseña.' };
    if (!u || !u.activo || !u.rhash || !igual(hash(norm(respuesta), u.rsalt), u.rhash)) {
      it.n++; it.hoy++; if (it.n >= maxIntentos) { it.hasta = ahora() + bloqueoMs; it.n = 0; }
      if (u) { d.rec = { ...(d.rec || {}), [u.id]: it }; wr(d); } else intentos.set(k, it);
      audit(u || null, 'recuperar.fallido', u ? '' : String(user).slice(0, 40));
      return { ok: false, err: 'No se pudo verificar la respuesta' };
    }
    const e = validarClave(nueva); if (e) return { ok: false, err: e };
    u.salt = nuevoSalt(); u.hash = hash(nueva, u.salt); if (d.rec) delete d.rec[u.id]; wr(d); cerrarSesiones(u.id); intentos.delete(k); audit(u, 'recuperar.ok');
    return { ok: true };
  }
  // Despachador común (escritorio y acceso remoto): cada pantalla llama por nombre; el permiso se resuelve acá, con la sesión.
  const NOMBRES = ['estado', 'listar', 'crear', 'editar', 'misSesiones', 'cerrarOtras', 'cambiarClave', 'setPregunta', 'setPrefs', 'preguntaDe', 'recuperar', 'auditoria', 'audit'];
  function llamar(token, nombre, a = []) {
    const q = habilitado() ? sesion(token) : null;
    switch (nombre) {
      case 'estado': return { habilitado: habilitado(), faltanUsuarios: faltanUsuarios(), usuario: q ? publico(q) : null, permisos: q ? matriz(q) : null, roles: ROLES, modulos: MODULOS, acciones: ACCIONES, permisosRol: Object.fromEntries(Object.keys(PERMISOS).map(r => [r, { ...PERMISOS[r], ...baseRol[r] }])), finos: FINOS };
      case 'listar': return listar(q);
      case 'crear': return crear(q, a[0] || {});
      case 'editar': return editar(q, a[0], a[1] || {});
      case 'misSesiones': return misSesiones(token);
      case 'cerrarOtras': return cerrarOtras(token);
      case 'cambiarClave': return cambiarClave(token, a[0], a[1]);
      case 'setPregunta': return setPregunta(token, a[0], a[1], a[2]);
      case 'setPrefs': return setPrefs(token, a[0] || {});
      case 'preguntaDe': return preguntaDe(a[0]);
      case 'recuperar': return recuperar(a[0], a[1], a[2]);
      case 'auditoria': return tiene(q, 'usuarios', 'ver') ? auditoria(a[0] || {}) : [];
      case 'audit': if (q) audit(q, String(a[0]).slice(0, 40), String(a[1] || '').slice(0, 200)); return { ok: !!q };
    }
    return { ok: false, err: 'operación desconocida' };
  }
  return { llamar, NOMBRES, habilitado, faltanUsuarios, crear, editar, listar, login, logout, sesion, misSesiones, cerrarOtras, cambiarClave, setPregunta, setPrefs, preguntaDe, recuperar, tiene, matriz, veCostos, puedeEscribir, puedePrecios, cambiaPrecios, audit, auditoria, publico, ROLES, MODULOS, ACCIONES, PERMISOS };
};
module.exports.ACCIONES = ACCIONES; module.exports.MODULOS = MODULOS; module.exports.ROLES = ROLES; module.exports.PERMISOS = PERMISOS; module.exports.FINOS = FINOS; module.exports.tiene = tiene; module.exports.matriz = matriz;
