// v5: lo que se empaqueta para los clientes está completo y no lleva secretos; la verificación previa a publicar funciona.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const raiz = path.join(__dirname, '..'), pkg = require('../package.json'), files = pkg.build.files;
// 1) todo módulo local que se carga con require está en la lista de archivos empaquetados
for (const f of files.filter(n => n.endsWith('.js'))) for (const m of fs.readFileSync(path.join(raiz, f), 'utf8').matchAll(/require\('\.\/([\w-]+)(?:\.js)?'\)/g))
  assert(files.includes(m[1] + '.js') || m[1] === 'package', `${f} carga ./${m[1]} pero no está en build.files`);
for (const f of files) assert(fs.existsSync(path.join(raiz, f)), 'falta ' + f);
// 2) no se empaquetan pruebas, flujos de publicación ni documentación interna
assert(!files.some(f => /^(tests|\.github|src-modulos|node_modules)|\.md$|verificar-dist/.test(f)));
// 3) ningún archivo distribuido contiene credenciales
const SECRETO = /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,}/;
for (const f of files) assert(!SECRETO.test(fs.readFileSync(path.join(raiz, f), 'utf8')), 'posible secreto en ' + f);
// 4) el actualizador usa el canal público de GitHub sin token; el desinstalador no borra los datos del comercio
assert.strictEqual(pkg.build.publish[0].provider, 'github'); assert(!JSON.stringify(pkg.build.publish).match(/token/i));
assert.strictEqual(pkg.build.nsis.deleteAppDataOnUninstall, false);
// 5) verificación de dist/
const verificar = require('../verificar-dist'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-dist-'));
assert(/falta latest.yml/.test(verificar(d, '5.0.0')));
const exe = 'StockProject-Setup-5.0.0.exe'; fs.writeFileSync(path.join(d, exe), 'instalador'); fs.writeFileSync(path.join(d, exe + '.blockmap'), 'x');
const yml = h => fs.writeFileSync(path.join(d, 'latest.yml'), `version: 5.0.0\nfiles:\n  - url: ${exe}\npath: ${exe}\nsha512: ${h}\n`);
const ok = crypto.createHash('sha512').update('instalador').digest('base64');
yml(ok); assert.strictEqual(verificar(d, '5.0.0'), null); assert(/package.json/.test(verificar(d, '5.0.1')));
fs.writeFileSync(path.join(d, exe), 'instalador alterado'); assert(/sha512/.test(verificar(d, '5.0.0')), 'un instalador alterado o corrupto no se publica');
fs.rmSync(d, { recursive: true, force: true });
console.log('DISTRIBUCION_OK');
