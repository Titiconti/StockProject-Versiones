// Las pruebas nunca deben tocar carpetas reales del usuario (OneDrive, Documentos, etc.).
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
assert(!Object.keys(process.env).some(k => /^onedrive/i.test(k)), 'correr las pruebas con npm test (tests/run.js quita las variables de OneDrive)');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-aisl-'));
const s = require('../store.js')({ dataFile: path.join(base, 'ud', 'data.json'), configFile: path.join(base, 'ud', 'config.json'), docsDir: path.join(base, 'docs'), home: path.join(base, 'home') });
s.write(JSON.stringify({ prods: [] }));
const dir = s.backup().dir;
assert(path.resolve(dir).startsWith(path.resolve(base)), 'el respaldo de prueba salió de la carpeta temporal: ' + dir);
fs.rmSync(base, { recursive: true, force: true });

// SP_CARPETA_PRUEBA: con la variable, Documentos, home y respaldos salen de esa carpeta aunque exista una "nube" real.
{
  const cp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-cp-')), nube = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-nube-'));
  const real = { documents: () => path.join(nube, 'DocsReales'), home: () => nube };
  fs.mkdirSync(path.join(nube, 'OneDrive'));   // existe, y es justo lo que el programa instalado elegiría
  const sin = require('../store.js').opciones(undefined, { a: 1 }, real);
  assert.deepStrictEqual([sin.docsDir, sin.home, sin.defaults.a, sin.sinNube], [real.documents(), nube, 1, undefined], 'sin la variable todo queda como siempre');
  const o = require('../store.js').opciones(cp, {}, real);
  assert(path.resolve(o.docsDir).startsWith(path.resolve(cp)) && path.resolve(o.home).startsWith(path.resolve(cp)) && path.resolve(o.defaults.backupDir).startsWith(path.resolve(cp)) && o.sinNube, 'con la variable todo sale de la carpeta de prueba');
  process.env.OneDrive = nube;
  for (const defaults of [o.defaults, {}]) {   // aunque no hubiera backupDir, sinNube evita OneDrive/Dropbox/Google Drive
    const st = require('../store.js')({ dataFile: path.join(cp, 'ud', 'd.json'), configFile: path.join(cp, 'ud', 'c.json'), docsDir: o.docsDir, home: o.home, defaults, sinNube: o.sinNube });
    st.write(JSON.stringify({ prods: [] })); const r = st.backup();
    assert(path.resolve(r.dir).startsWith(path.resolve(cp)), 'el respaldo salió de la carpeta de prueba: ' + r.dir);
    assert(!JSON.stringify(st.load()).includes('Barbaglia'));
  }
  delete process.env.OneDrive;
  assert.deepStrictEqual(fs.readdirSync(nube).sort(), ['OneDrive'], 'no se escribió nada en la nube real'); assert.deepStrictEqual(fs.readdirSync(path.join(nube, 'OneDrive')), [], 'ni dentro de OneDrive');
  fs.rmSync(cp, { recursive: true, force: true }); fs.rmSync(nube, { recursive: true, force: true });
}