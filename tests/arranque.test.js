// Arranque sin "parpadeo": la cortina de la marca (#pre) tapa la interfaz desde el primer pintado y se va recién
// cuando el programa está listo; con la animación de inicio, la cortina la reemplaza el splash.
const assert = require('assert'), fs = require('fs'), path = require('path'), { web } = require('./helpers');
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(/<body>\s*<div id="pre"/.test(html), 'la cortina es lo primero del body');
  assert(/#pre\{position:fixed;inset:0;z-index:199;background:#12233D/.test(html.slice(0, html.indexOf('</head>'))), 'su estilo está en el head, antes de cualquier módulo');
  const { w, $, errs } = web();
  assert(!$('#pre'), 'con animaciones, el splash reemplaza a la cortina'); assert($('#splash'), 'hay animación de inicio');
  await new Promise(r => setTimeout(r, 2300)); assert(!$('#splash'), 'el splash se va solo');
  assert(/backgroundColor: '#12233D'/.test(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')), 'la ventana arranca del color de la marca (sin destello blanco)');
  assert.deepStrictEqual(errs, []); console.log('ARRANQUE_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
