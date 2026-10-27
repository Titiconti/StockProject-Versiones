// Ejecuta todas las pruebas: npm test
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
let fallos = 0;
for (const f of fs.readdirSync(__dirname).filter(n => n.endsWith('.test.js')).sort()) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 90000 });
  const ok = r.status === 0;
  console.log((ok ? 'OK    ' : 'FALLÓ ') + f + (ok ? '' : '\n' + (r.stdout + r.stderr).trim()));
  if (!ok) fallos++;
}
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
