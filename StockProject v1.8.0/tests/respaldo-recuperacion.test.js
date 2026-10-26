const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'sp-'));
const mk=()=>require('../store.js')({dataFile:path.join(base,'ud','data.json'),configFile:path.join(base,'ud','config.json'),docsDir:path.join(base,'docs'),home:path.join(base,'home')});
let s=mk();
assert.strictEqual(s.load(),'');                       // instalación nueva: vacío
s.write(JSON.stringify({prods:[1],v:1}));
let i=s.backup();assert(i.last&&!i.warn);              // respaldo creado
const bdir=i.dir;assert.strictEqual(fs.readdirSync(bdir).length,1);
s.write(JSON.stringify({prods:[1,2],v:2}));s.backup(); // mismo día: se sobrescribe
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(bdir,fs.readdirSync(bdir)[0]))).v,2);
fs.writeFileSync(path.join(base,'ud','data.json'),'{roto');   // archivo dañado
s.backup();assert.strictEqual(JSON.parse(fs.readFileSync(path.join(bdir,fs.readdirSync(bdir)[0]))).v,2); // no respalda lo dañado
assert.strictEqual(JSON.parse(s.load()).v,2);          // recupera solo
assert(fs.readdirSync(path.join(base,'ud')).some(n=>n.includes('danado')));
fs.unlinkSync(path.join(base,'ud','data.json'));        // disco nuevo: archivo ausente
assert.strictEqual(JSON.parse(s.load()).v,2);
const alt=path.join(base,'otra');fs.writeFileSync(path.join(base,'x.json'),JSON.stringify({prods:[9]}));
assert.strictEqual(s.restoreFrom(path.join(base,'x.json')),true);assert.strictEqual(JSON.parse(s.load()).prods[0],9);
fs.writeFileSync(path.join(base,'bad.json'),'{}');assert.strictEqual(s.restoreFrom(path.join(base,'bad.json')),false);
s.setDir(alt);s.backup();assert(fs.readdirSync(alt).length===1);assert.strictEqual(s.info().dir,alt);
console.log('STORE_TESTS_OK');process.exit(0);
