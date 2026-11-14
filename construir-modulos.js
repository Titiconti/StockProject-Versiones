// Arma index.html: copia los archivos de src-modulos/ (en el orden de ORDEN) dentro de <!--MODULOS--> ... <!--/MODULOS-->.
// Uso: node construir-modulos.js
const fs = require('fs'), path = require('path');
const ORDEN = ['util', 'config', 'finanzas', 'cobros', 'clientes2', 'analitica', 'migracion', 'empresas', 'integraciones', 'sistema', 'actualizaciones', 'caja', 'atajos', 'movil'];
const dir = path.join(__dirname, 'src-modulos'), f = path.join(__dirname, 'index.html');
let h = fs.readFileSync(f, 'utf8');
const bloque = ORDEN.filter(n => fs.existsSync(path.join(dir, n + '.js'))).map(n => `<script>\n${fs.readFileSync(path.join(dir, n + '.js'), 'utf8').replace(/<\/script>/g, '<\\/script>')}</script>\n`).join('');
const a = h.indexOf('<!--MODULOS-->'), b = h.indexOf('<!--/MODULOS-->');
if (a < 0) throw new Error('falta <!--MODULOS--> en index.html');
h = h.slice(0, a) + '<!--MODULOS-->\n' + bloque + '<!--/MODULOS-->' + h.slice(b < 0 ? a + '<!--MODULOS-->'.length : b + '<!--/MODULOS-->'.length);
fs.writeFileSync(f, h);
console.log('index.html actualizado con ' + ORDEN.filter(n => fs.existsSync(path.join(dir, n + '.js'))).join(', '));
