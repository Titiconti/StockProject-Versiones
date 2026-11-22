const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PAT = /^StockProject-\d{4}-\d{2}-\d{2}\.json$/;
const ymd = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Cifrado AES-256-GCM. SPENC1: datos en reposo con la clave del equipo; SPPW1: copia protegida con una contraseña.
const MAGIC = 'SPENC1:', MAGICPW = 'SPPW1:';
const sellar = (key, str) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(str, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]); };
const abrir = (key, b) => { const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };
const kdf = (pw, salt) => crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 });

const validar = require('./validar');
module.exports = function ({ dataFile, configFile, docsDir, home, defaults = {}, keep = 30, sinNube = false }) {
  const crudo = f => fs.readFileSync(f, 'utf8');
  const claro = s => { if (s.startsWith(MAGIC)) { if (!key) throw new Error('datos cifrados y falta la clave'); return abrir(key, Buffer.from(s.slice(MAGIC.length), 'base64')); } return s; };
  const texto = f => claro(crudo(f));
  const rd = f => { try { return JSON.parse(texto(f)) } catch (e) { return null } };
  const cifrado = () => { try { return crudo(dataFile).startsWith(MAGIC) } catch (e) { return false } };
  const cfg = () => rd(configFile) || {};
  const fallback = path.join(docsDir, 'StockProject-Respaldos');
  let hook = null;   // se llama con cada guardado exitoso (webhooks)
  let rev = 0, key = null;   // key: clave de 32 bytes si el cifrado en reposo está activo   // versión de los datos: sube con cada guardado (detecta cambios hechos desde otro dispositivo)

  function detectCloud() {
    if (sinNube) return null;   // pruebas (SP_CARPETA_PRUEBA): nunca buscar OneDrive, Dropbox ni Google Drive reales
    const c = [process.env.OneDrive, path.join(home, 'OneDrive'), path.join(home, 'Dropbox'),
      path.join(home, 'Google Drive'), path.join(home, 'My Drive')];
    for (let i = 68; i <= 90; i++) { const L = String.fromCharCode(i) + ':\\'; c.push(L + 'My Drive', L + 'Mi unidad'); }
    const f = c.find(p => p && fs.existsSync(p));
    return f ? path.join(f, 'StockProject-Respaldos') : null;
  }
  const dir = () => cfg().backupDir || defaults.backupDir || detectCloud() || fallback;
  const list = d => { try { return fs.readdirSync(d).filter(n => PAT.test(n)).sort().reverse() } catch (e) { return [] } };

  function write(s) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const t = dataFile + '.tmp';
    fs.writeFileSync(t, key ? MAGIC + sellar(key, s).toString('base64') : s);
    fs.renameSync(t, dataFile);
  }
  function lastBackup() {
    for (const d of [dir(), fallback]) for (const n of list(d)) {
      try { const s = texto(path.join(d, n)); if (JSON.parse(s).prods) return s } catch (e) {}
    }
    return null;
  }
  // Carga los datos. Si el archivo falta o está dañado, recupera el último respaldo válido.
  let ilegible = false;   // el archivo está cifrado y no se pudo abrir: no se toca ni se pisa
  function loadRaw() {
    ilegible = false;
    if (cifrado()) { try { texto(dataFile); } catch (e) { ilegible = true; throw new Error('Los datos están cifrados y la clave no los abre'); } }
    try { const s = texto(dataFile); if (JSON.parse(s).prods) return s } catch (e) {}
    if (fs.existsSync(dataFile)) fs.renameSync(dataFile, dataFile.replace(/\.json$/, '') + '-danado-' + Date.now() + '.json');
    const b = lastBackup();
    if (b) { write(b); return b }
    return '';
  }
  function load() {
    const s = loadRaw();
    if (s) { try { rev = JSON.parse(s).rev || 0 } catch (e) {} } else rev = 0;
    if (s && key && !cifrado()) write(s);      // se activó el cifrado: el archivo en claro se reescribe cifrado
    return s;
  }
  // Guarda solo si quien guarda partió de la versión actual (si no, otro dispositivo cambió los datos antes).
  // `autorizar(anterior, nuevo)` (opcional): controla los permisos del usuario por colección; devuelve un mensaje si no puede.
  function put(str, base, autorizar) {
    if (ilegible) return { ok: false, err: 'Los datos están cifrados y la clave no los abre: no se guarda nada' };
    if (base !== rev) return { ok: false, conflict: true, rev };
    let o; try { o = JSON.parse(str) } catch (e) { return { ok: false, err: 'datos inválidos' } }
    if (!o || !Array.isArray(o.prods)) return { ok: false, err: 'datos inválidos' };
    { let prev = null; try { prev = JSON.parse(snapshot() || 'null'); } catch (e) {} const err = validar(prev, o); if (err) return { ok: false, err };   // reglas de negocio controladas en el proceso principal
      const sin = autorizar && autorizar(prev, o); if (sin) return { ok: false, permiso: true, err: sin };
      if (prev && prev.usuariosActivos) o.usuariosActivos = true; }   // la marca de "usuarios activados" no la borra un guardado
    rev++; o.rev = rev;
    const out = JSON.stringify(o); write(out);
    if (hook) { try { hook(out) } catch (e) {} }
    return { ok: true, rev };
  }
  const snapshot = () => { try { return texto(dataFile) } catch (e) { return '' } };
  function info(warn) {
    const d = dir(), n = list(d)[0];
    return { dir: d, last: n ? fs.statSync(path.join(d, n)).mtime : null, warn: warn || '' };
  }
  function backup() {
    const d0 = rd(dataFile);
    if (!d0 || !d0.prods) return info();      // nunca respaldar un archivo dañado
    const name = 'StockProject-' + ymd() + '.json';
    const put = d => {
      fs.mkdirSync(d, { recursive: true });
      fs.copyFileSync(dataFile, path.join(d, name));
      list(d).slice(keep).forEach(n => fs.unlinkSync(path.join(d, n)));
    };
    try { put(dir()); return info(); }
    catch (e) {
      try { put(fallback); return info('No se pudo escribir en la carpeta elegida; el respaldo quedó en Documentos.'); }
      catch (e2) { return info('No se pudo guardar el respaldo.'); }
    }
  }
  function setDir(d) { fs.mkdirSync(path.dirname(configFile), { recursive: true }); fs.writeFileSync(configFile, JSON.stringify({ ...cfg(), backupDir: d })); }
  // Copia protegida con contraseña (sirve para llevar los datos a otra PC aunque cambie la clave del equipo).
  const snapshotProtegido = pw => { const salt = crypto.randomBytes(16); return MAGICPW + Buffer.concat([salt, sellar(kdf(pw, salt), snapshot() || '{}')]).toString('base64'); };
  function protegidoLeer(file, pw) { try { const t = crudo(file); if (!t.startsWith(MAGICPW)) return null; const b = Buffer.from(t.slice(MAGICPW.length), 'base64'); return JSON.parse(abrir(kdf(pw, b.subarray(0, 16)), b.subarray(16))); } catch (e) { return null; } }
  const esProtegido = file => { try { return crudo(file).startsWith(MAGICPW) } catch (e) { return false } };
  function restoreFrom(file, pw) {
    const o = rd(file) || (pw && protegidoLeer(file, pw));
    if (!o || !o.prods) return false;
    if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, dataFile.replace(/\.json$/, '') + '-previo-' + Date.now() + '.json');
    rev = Math.max(rev, o.rev || 0) + 1; o.rev = rev;
    write(JSON.stringify(o));
    return true;
  }
  const getConfig = () => cfg();
  function setConfig(patch) { fs.mkdirSync(path.dirname(configFile), { recursive: true }); fs.writeFileSync(configFile, JSON.stringify({ ...cfg(), ...patch })); }
  function setKey(k) { const s = snapshot(); key = k ? Buffer.from(k) : null; if (s) write(s); }   // se lee con la clave vieja y se reescribe con la nueva
  // Prueba una clave sin reescribir nada: abre el archivo cifrado con ella (o, si no está cifrado, alcanza con poder leerlo).
  function probarClave(k) {
    try { const t = crudo(dataFile); if (!t.startsWith(MAGIC)) return !!JSON.parse(t).prods; return !!JSON.parse(abrir(Buffer.from(k), Buffer.from(t.slice(MAGIC.length), 'base64'))).prods; } catch (e) { return false; }
  }
  // Marca dentro de los datos (cifrada si el cifrado está activo) de que el programa usa inicio de sesión (E4). No cambia la versión.
  const marcaUsuarios = () => { try { return !!JSON.parse(texto(dataFile)).usuariosActivos; } catch (e) { return false; } };
  function marcarUsuarios() { try { const o = JSON.parse(texto(dataFile)); if (!o || !o.prods || o.usuariosActivos) return; o.usuariosActivos = true; write(JSON.stringify(o)); } catch (e) {} }
  const tam = () => { try { return fs.statSync(dataFile).size } catch (e) { return 0 } };
  return { probarClave, marcaUsuarios, marcarUsuarios, tam, onPut: f => { hook = f }, setKey, cifrado, snapshotProtegido, esProtegido, load, write, put, rev: () => rev, snapshot, backup, info, setDir, restoreFrom, getConfig, setConfig };
};

// Solo para pruebas: con SP_CARPETA_PRUEBA=<dir>, Documentos, home y respaldos salen de esa carpeta y no se busca ninguna nube real. Sin la variable, todo igual que siempre.
module.exports.opciones = (cp, defaults, real) => cp ? { docsDir: path.join(cp, 'Documents'), home: path.join(cp, 'home'), sinNube: true, defaults: { ...defaults, backupDir: path.join(cp, 'Respaldos') } } : { docsDir: real.documents(), home: real.home(), defaults };
