const fs = require('fs'), path = require('path');
const PAT = /^StockProject-\d{4}-\d{2}-\d{2}\.json$/;
const ymd = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

module.exports = function ({ dataFile, configFile, docsDir, home, defaults = {}, keep = 30 }) {
  const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { return null } };
  const cfg = () => rd(configFile) || {};
  const fallback = path.join(docsDir, 'StockProject-Respaldos');
  let rev = 0;   // versión de los datos: sube con cada guardado (detecta cambios hechos desde otro dispositivo)

  function detectCloud() {
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
    fs.writeFileSync(t, s);
    fs.renameSync(t, dataFile);
  }
  function lastBackup() {
    for (const d of [dir(), fallback]) for (const n of list(d)) {
      try { const s = fs.readFileSync(path.join(d, n), 'utf8'); if (JSON.parse(s).prods) return s } catch (e) {}
    }
    return null;
  }
  // Carga los datos. Si el archivo falta o está dañado, recupera el último respaldo válido.
  function loadRaw() {
    try { const s = fs.readFileSync(dataFile, 'utf8'); if (JSON.parse(s).prods) return s } catch (e) {}
    if (fs.existsSync(dataFile)) fs.renameSync(dataFile, dataFile.replace(/\.json$/, '') + '-danado-' + Date.now() + '.json');
    const b = lastBackup();
    if (b) { write(b); return b }
    return '';
  }
  function load() {
    const s = loadRaw();
    if (s) { try { rev = JSON.parse(s).rev || 0 } catch (e) {} } else rev = 0;
    return s;
  }
  // Guarda solo si quien guarda partió de la versión actual (si no, otro dispositivo cambió los datos antes).
  function put(str, base) {
    if (base !== rev) return { ok: false, conflict: true, rev };
    let o; try { o = JSON.parse(str) } catch (e) { return { ok: false, err: 'datos inválidos' } }
    if (!o || !Array.isArray(o.prods)) return { ok: false, err: 'datos inválidos' };
    rev++; o.rev = rev;
    write(JSON.stringify(o));
    return { ok: true, rev };
  }
  const snapshot = () => { try { return fs.readFileSync(dataFile, 'utf8') } catch (e) { return '' } };
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
  function restoreFrom(file) {
    const o = rd(file);
    if (!o || !o.prods) return false;
    if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, dataFile.replace(/\.json$/, '') + '-previo-' + Date.now() + '.json');
    rev = Math.max(rev, o.rev || 0) + 1; o.rev = rev;
    write(JSON.stringify(o));
    return true;
  }
  const getConfig = () => cfg();
  function setConfig(patch) { fs.mkdirSync(path.dirname(configFile), { recursive: true }); fs.writeFileSync(configFile, JSON.stringify({ ...cfg(), ...patch })); }
  return { load, write, put, rev: () => rev, snapshot, backup, info, setDir, restoreFrom, getConfig, setConfig };
};
