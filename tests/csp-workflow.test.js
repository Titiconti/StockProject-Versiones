// Auditoría 16/11/2026: E9 (Content-Security-Policy en las páginas) y E8 (la etiqueta no se pega dentro del shell).
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
for (const p of ['index.html', 'login.html', 'clave.html']) {
  const h = fs.readFileSync(path.join(raiz, p), 'utf8');
  const m = h.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert(m, p + ' tiene CSP');
  assert(h.indexOf(m[0]) < h.indexOf('<script'), p + ': la CSP va antes del primer script');
  const csp = m[1];
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-src 'none'", "form-action 'none'"]) assert(csp.includes(d), p + ': ' + d);
  assert(!/script-src[^;]*(https?:|\*)/.test(csp), p + ': no se cargan scripts de otros sitios');
}
const wf = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'publicar.yml'), 'utf8');
const scripts = wf.split(/\n\s*- /).map(paso => (paso.match(/run: \|([\s\S]*)/) || [])[1] || '').join('\n');
assert(!scripts.includes('${{'), 'ningún script de publicar.yml interpola expresiones de GitHub');
assert(/TAG: \$\{\{ github\.ref_name \}\}/.test(wf), 'la etiqueta entra por variable de entorno');
console.log('csp-workflow: ok');
