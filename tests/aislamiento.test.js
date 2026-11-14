// Las pruebas nunca deben tocar carpetas reales del usuario (OneDrive, Documentos, etc.).
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
assert(!Object.keys(process.env).some(k => /^onedrive/i.test(k)), 'correr las pruebas con npm test (tests/run.js quita las variables de OneDrive)');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-aisl-'));
const s = require('../store.js')({ dataFile: path.join(base, 'ud', 'data.json'), configFile: path.join(base, 'ud', 'config.json'), docsDir: path.join(base, 'docs'), home: path.join(base, 'home') });
s.write(JSON.stringify({ prods: [] }));
const dir = s.backup().dir;
assert(path.resolve(dir).startsWith(path.resolve(base)), 'el respaldo de prueba salió de la carpeta temporal: ' + dir);
fs.rmSync(base, { recursive: true, force: true });
