// Ejecuta todas las pruebas: npm test
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
// Sin las variables de OneDrive: store.js las usa para elegir la carpeta de respaldos y, si quedaran,
// las pruebas escribirían (y podarían) respaldos en el OneDrive real de quien las corre.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^onedrive/i.test(k)));
let fallos = 0;
for (const f of fs.readdirSync(__dirname).filter(n => n.endsWith('.test.js')).sort()) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 90000, env });
  const ok = r.status === 0;
  console.log((ok ? 'OK    ' : 'FALLÓ ') + f + (ok ? '' : '\n' + (r.stdout + r.stderr).trim()));
  if (!ok) fallos++;
}
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
