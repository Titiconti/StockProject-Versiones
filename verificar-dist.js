// Verifica dist/ antes de publicar: que estén el instalador, su .blockmap y latest.yml, que la versión coincida
// y que el sha512 de latest.yml sea el del instalador (es lo que el programa instalado comprueba al actualizarse).
// Uso: node verificar-dist.js [carpeta]   (sale con error si algo no cierra)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
function verificar(dir, version) {
  const yml = path.join(dir, 'latest.yml'); if (!fs.existsSync(yml)) return 'falta latest.yml';
  const t = fs.readFileSync(yml, 'utf8'), v = (t.match(/^version:\s*(.+)$/m) || [])[1], f = (t.match(/^path:\s*(.+)$/m) || [])[1], h = (t.match(/^sha512:\s*(.+)$/m) || [])[1];
  if (!v || !f || !h) return 'latest.yml incompleto';
  if (v.trim() !== version) return `latest.yml dice ${v.trim()} y package.json ${version}`;
  const exe = path.join(dir, f.trim()); if (!fs.existsSync(exe)) return 'falta el instalador ' + f.trim();
  if (!fs.existsSync(exe + '.blockmap')) return 'falta el .blockmap del instalador';
  const real = crypto.createHash('sha512').update(fs.readFileSync(exe)).digest('base64');
  if (real !== h.trim()) return 'el sha512 de latest.yml no coincide con el instalador';
  return null;
}
module.exports = verificar;
if (require.main === module) {
  const err = verificar(path.resolve(process.argv[2] || 'dist'), require('./package.json').version);
  if (err) { console.error('NO PUBLICAR: ' + err); process.exit(1); }
  console.log('dist verificado');
}
