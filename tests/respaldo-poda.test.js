const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'sp-'));
const s=require('../store.js')({dataFile:path.join(base,'ud','data.json'),configFile:path.join(base,'ud','config.json'),docsDir:path.join(base,'docs'),home:path.join(base,'home')});
s.write(JSON.stringify({prods:[1],v:1}));
const bdir=s.backup().dir;
for(let d=1;d<=45;d++){const x=new Date(2024,0,d);const n='StockProject-'+x.toISOString().slice(0,10)+'.json';fs.writeFileSync(path.join(bdir,n),'{"prods":[]}')}
assert.strictEqual(fs.readdirSync(bdir).length,46);
s.backup();
const files=fs.readdirSync(bdir).sort();
assert.strictEqual(files.length,30);
assert(files.some(n=>n.includes(new Date().getFullYear())),'conserva el respaldo de hoy');
assert(!files.includes('StockProject-2024-01-01.json'),'borra los más viejos');
// carpeta inaccesible -> cae a Documentos con aviso
fs.writeFileSync(path.join(base,'bloqueo'),'x');
s.setDir(path.join(base,'bloqueo','sub'));
const i=s.backup();assert(i.warn.includes('Documentos'));
assert(fs.readdirSync(path.join(base,'docs','StockProject-Respaldos')).length>=1);
console.log('PODA_Y_FALLBACK_OK');process.exit(0);
