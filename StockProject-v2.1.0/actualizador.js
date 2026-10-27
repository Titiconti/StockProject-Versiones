// Actualizaciones automáticas desde GitHub Releases. Envuelve a electron-updater para poder probarlo sin Electron.
// Idea: buscar sin molestar, bajar en segundo plano y avisar; se instala al cerrar el programa (o cuando la persona lo elija).
const CADA = 6 * 36e5, PRIMERA = 20e3;

module.exports = function ({ autoUpdater, version, empaquetada, alEstado = () => {}, antesDeInstalar = () => {}, activo = () => true, esperar = (f, ms) => setTimeout(f, ms), repetir = (f, ms) => setInterval(f, ms), ahora = () => Date.now() }) {
  let est = { fase: empaquetada ? 'inicial' : 'desarrollo', version, nueva: null, pct: 0, msg: '', ultima: null };
  const poner = p => { est = { ...est, ...p }; try { alEstado(estado()) } catch (e) {} };
  const estado = () => ({ ...est, version, empaquetada: !!empaquetada });
  let hecho = false;

  function iniciar() {
    if (!empaquetada || hecho) return estado(); hecho = true;
    autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true; autoUpdater.allowPrerelease = false; autoUpdater.allowDowngrade = false; autoUpdater.logger = null;
    autoUpdater.on('checking-for-update', () => poner({ fase: 'buscando', msg: '' }));
    autoUpdater.on('update-available', i => poner({ fase: 'descargando', nueva: i && i.version, pct: 0 }));
    autoUpdater.on('download-progress', p => poner({ fase: 'descargando', pct: Math.round((p && p.percent) || 0) }));
    autoUpdater.on('update-not-available', () => poner({ fase: 'al-dia', nueva: null, ultima: ahora() }));
    autoUpdater.on('update-downloaded', i => poner({ fase: 'lista', nueva: (i && i.version) || est.nueva, pct: 100, ultima: ahora() }));
    autoUpdater.on('error', e => poner({ fase: est.fase === 'descargando' ? 'error' : 'sin-conexion', msg: String((e && e.message) || e).slice(0, 160), ultima: ahora() }));
    const buscarSilencioso = () => { if (activo() && est.fase !== 'lista' && est.fase !== 'descargando') buscar(); };
    esperar(buscarSilencioso, PRIMERA); repetir(buscarSilencioso, CADA);
    return estado();
  }
  async function buscar() {
    if (!empaquetada) return estado();
    if (est.fase === 'buscando' || est.fase === 'descargando') return estado();
    try { await autoUpdater.checkForUpdates(); } catch (e) { poner({ fase: 'sin-conexion', msg: String((e && e.message) || e).slice(0, 160), ultima: ahora() }); }
    return estado();
  }
  // Cierra el programa, instala la versión descargada y lo vuelve a abrir.
  function instalar() {
    if (est.fase !== 'lista') return { ok: false, err: 'Todavía no hay una versión descargada' };
    try { antesDeInstalar(); } catch (e) {}
    autoUpdater.quitAndInstall(false, true); return { ok: true };
  }
  return { iniciar, buscar, instalar, estado };
};
