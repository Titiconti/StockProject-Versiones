// La app es un solo archivo con muchos ids: un id repetido rompe pantallas enteras sin avisar.
const assert = require('assert'), { HTML } = require('./helpers.js');
const ids = [...HTML.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]), vistos = new Set(), rep = [];
ids.forEach(i => { if (vistos.has(i)) rep.push(i); vistos.add(i); });
assert.deepStrictEqual(rep, [], 'ids repetidos: ' + rep.join(', '));
console.log('estructura OK (' + ids.length + ' ids)');
// index.html debe contener exactamente el código de src-modulos/ (si se edita uno y no se reconstruye, el programa quedaría desactualizado)
const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'src-modulos');
fs.readdirSync(dir).filter(n => n.endsWith('.js')).forEach(n => assert(HTML.includes(fs.readFileSync(path.join(dir, n), 'utf8')), `src-modulos/${n} no está al día en index.html: ejecutá "node construir-modulos.js"`));
console.log('módulos al día');
