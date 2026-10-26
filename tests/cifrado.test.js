const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), crypto = require('crypto');
const crear = require('../store.js');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-enc-'));
const mk = (n) => crear({ dataFile: path.join(base, n, 'data.json'), configFile: path.join(base, n, 'cfg.json'), docsDir: path.join(base, 'docs'), home: base, defaults: { backupDir: path.join(base, n, 'resp') } });
const st = mk('a'), DATA = { prods: [{ id: 1, name: 'Yerba SECRETA' }], clients: [{ name: 'Juan Pérez' }] };
st.load(); assert(st.put(JSON.stringify(DATA), 0).ok);
assert(fs.readFileSync(path.join(base, 'a', 'data.json'), 'utf8').includes('Yerba SECRETA'), 'antes: en claro');

// activar el cifrado: el archivo y los respaldos nuevos dejan de ser legibles
const key = crypto.randomBytes(32); st.setKey(key);
let raw = fs.readFileSync(path.join(base, 'a', 'data.json'), 'utf8');
assert(raw.startsWith('SPENC1:') && !raw.includes('SECRETA') && !raw.includes('Juan'), 'archivo cifrado'); assert(st.cifrado());
assert.strictEqual(JSON.parse(st.load()).prods[0].name, 'Yerba SECRETA', 'se lee igual');
assert(st.put(JSON.stringify({ ...DATA, extra: 1 }), st.rev()).ok);
st.backup(); const bk = fs.readdirSync(path.join(base, 'a', 'resp'))[0];
assert(!fs.readFileSync(path.join(base, 'a', 'resp', bk), 'utf8').includes('SECRETA'), 'el respaldo también va cifrado');
// con la clave equivocada o sin clave no se puede leer (y no se pisa el archivo con datos vacíos)
const st2 = mk('a'); assert.throws(() => JSON.parse(st2.snapshot() || 'x'), 'sin clave no se ve nada');
const st3 = mk('a'); st3.setKey(crypto.randomBytes(32));
assert.strictEqual(st3.snapshot(), '', 'clave equivocada: nada legible');
// con la clave correcta, otra instancia lee y puede restaurar un respaldo cifrado
const st4 = mk('a'); st4.setKey(key); assert.strictEqual(JSON.parse(st4.snapshot()).extra, 1);
assert(st4.restoreFrom(path.join(base, 'a', 'resp', bk)));
// desactivar: vuelve a texto plano
st4.setKey(null); raw = fs.readFileSync(path.join(base, 'a', 'data.json'), 'utf8'); assert(raw.startsWith('{') && raw.includes('SECRETA')); assert(!st4.cifrado());
// migración: archivo en claro + clave activa -> se cifra al cargar
const stm = mk('m'); stm.load(); stm.put(JSON.stringify(DATA), 0); stm.setKey(key); stm.setKey(null);
fs.writeFileSync(path.join(base, 'm', 'data.json'), JSON.stringify({ ...DATA, rev: 5 }));
const stn = mk('m'); stn.setKey = stn.setKey; stn.load(); // sin clave: queda en claro
const sk = mk('m'); sk.setKey(key); sk.load(); assert(fs.readFileSync(path.join(base, 'm', 'data.json'), 'utf8').startsWith('SPENC1:'));

// copia protegida con contraseña: se restaura en otro equipo con otra clave
const x = mk('x'); x.load(); x.put(JSON.stringify(DATA), 0); const prot = x.snapshotProtegido('MiClave-2026');
assert(prot.startsWith('SPPW1:') && !prot.includes('SECRETA'));
const f = path.join(base, 'copia.json'); fs.writeFileSync(f, prot); assert(x.esProtegido(f));
const y = mk('y'); y.load(); y.setKey(crypto.randomBytes(32));
assert(!y.restoreFrom(f, 'otra'), 'contraseña equivocada'); assert(!y.restoreFrom(f), 'sin contraseña');
assert(y.restoreFrom(f, 'MiClave-2026')); assert.strictEqual(JSON.parse(y.snapshot()).prods[0].name, 'Yerba SECRETA');
console.log('cifrado OK');
// clave equivocada: no se renombra el archivo como "dañado", no se restaura de un respaldo viejo y no se permite guardar encima
{
  const w = mk('w'); w.load(); w.put(JSON.stringify(DATA), 0); const k1 = crypto.randomBytes(32); w.setKey(k1);
  const mal = mk('w'); mal.setKey(crypto.randomBytes(32)); assert.throws(() => mal.load(), /cifrados/);
  assert(!mal.put(JSON.stringify({ prods: [] }), 0).ok);
  assert(fs.readdirSync(path.join(base, 'w')).every(n => !/danado/.test(n)), 'el archivo no se marcó como dañado');
  const bien = mk('w'); bien.setKey(k1); assert.strictEqual(JSON.parse(bien.load()).prods[0].name, 'Yerba SECRETA');
  console.log('clave equivocada OK');
}
