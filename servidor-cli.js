#!/usr/bin/env node
// Modo "solo servidor" (sin pantalla), para dejar StockProject en una PC/servidor siempre encendido.
//   node servidor-cli.js --datos ./datos --puerto 3000 --clave 123456
const path = require('path'), fs = require('fs'), os = require('os');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const datos = path.resolve(arg('datos', './datos'));
fs.mkdirSync(datos, { recursive: true });
let defaults = {}; try { defaults = JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8')); } catch (e) {}
const store = require('./store')({ dataFile: path.join(datos, 'stockproject-data.json'), configFile: path.join(datos, 'config.json'),
  docsDir: datos, home: os.homedir(), defaults });
const usuarios = require('./usuarios')({ usersFile: path.join(datos, 'usuarios.json'), auditFile: path.join(datos, 'auditoria.jsonl') });
const g = require('./servidor').gestor({ store, usuarios, indexPath: path.join(__dirname, 'index.html'), defaults });
(async () => {
  store.load();
  const clave = arg('clave'), puerto = arg('puerto');
  if (clave || puerto) { const r = await g.setConfig({ enabled: true, pin: clave, port: puerto }); if (r.error) { console.error(r.error); process.exit(1); } }
  else await g.start();
  const i = g.info();
  if (!i.running) { console.error(i.error || 'El acceso remoto está desactivado en la configuración.'); process.exit(1); }
  console.log('StockProject en funcionamiento.\nAbrí en el navegador: ' + (i.urls.length ? i.urls.join('  |  ') : 'http://localhost:' + i.port));
  console.log(usuarios.habilitado() ? 'Ingreso con usuario y contraseña (usuarios activados).' : 'Clave de acceso: ' + i.pin);
  console.log('Datos en: ' + datos);
  store.backup(); setInterval(() => store.backup(), 36e5);
})();
