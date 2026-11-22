// Arranque sin "parpadeo": la cortina de la marca (#pre) tapa la interfaz desde el primer pintado y se va recién
// cuando el programa está listo; con la animación de inicio, la cortina la reemplaza el splash.
const assert = require('assert'), fs = require('fs'), path = require('path'), { web } = require('./helpers');
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(/<body>\s*<div id="pre"/.test(html), 'la cortina es lo primero del body');
  const cabeza = html.slice(0, html.indexOf('</head>'));
  assert(/#pre\{position:fixed;inset:0;z-index:199;background:var\(--pre\)/.test(cabeza), 'su estilo está en el head, antes de cualquier módulo');
  // El color de la cortina sigue al tema: oscuro = marino de la marca, claro = papel. Y el tema se aplica antes del primer cuadro.
  assert(/data-theme="dark"\]\{--pre:#12233D;--pre2:#1D3B6E/.test(cabeza) && /--pre:#F4F6FA/.test(cabeza), 'la cortina tiene color para cada tema');
  assert(cabeza.indexOf("localStorage.getItem('sp_prefs_equipo')") > 0 && cabeza.indexOf("setAttribute('data-theme'") < cabeza.indexOf('#pre{position'), 'un script del head aplica el tema antes de pintar');
  const { w, $, errs } = web();
  assert(!$('#pre'), 'con animaciones, el splash reemplaza a la cortina'); assert($('#splash'), 'hay animación de inicio');
  await new Promise(r => setTimeout(r, 1800)); assert($('#splash'), 'la animación se aprecia: dura más de 2 s (no pasa de golpe)');
  await new Promise(r => setTimeout(r, 1800)); assert(!$('#splash'), 'el splash se va solo, con salida suave (~3 s en total)');
  assert(/#splash\{[^}]*background:var\(--pre\);background-image:radial-gradient\(70% 60% at 50% 0,var\(--pre2\) 0,var\(--pre\) 60%\)/.test(html), 'el splash tiene el mismo fondo (del tema) que la cortina');
  const login = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8'), clave = fs.readFileSync(path.join(__dirname, '..', 'clave.html'), 'utf8');
  [login, clave].forEach(h => { assert(/radial-gradient\(70% 60% at 50% 0,#1D3B6E 0,#12233D 60%\)/.test(h) && /radial-gradient\(70% 60% at 50% 0,#E3EAFB 0,#F4F6FA 60%\)/.test(h), 'login y clave tienen degradé para cada tema'); assert(/sp_prefs_equipo/.test(h) && /data-theme/.test(h), 'aplican el tema elegido antes de pintar'); });
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert(/show: false/.test(main), 'la ventana no se muestra antes del primer cuadro');
  assert(/backgroundColor: aplicarTema\(temaGuardado\(\)\)/.test(main) && /'#12233D'/.test(main) && /'#F4F6FA'/.test(main), 'la ventana arranca del color del tema elegido (sin destello)');
  assert.deepStrictEqual(errs, []); console.log('ARRANQUE_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
