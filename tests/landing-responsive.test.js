// Responsive de la landing: recorre varios anchos (320 a 2560, tablet vertical y horizontal, notebook de poca altura, zoom en 1920)
// en un navegador real y falla si hay scroll horizontal, texto fuera de la pantalla o botones muy chicos para el dedo.
// Usa Playwright si está disponible (en esta PC viene con playwright-cli; Edge o Chrome instalados). Si no hay navegador,
// hace solo las comprobaciones estáticas y lo avisa: no es una excusa para saltearla en una PC con navegador.
const assert = require('assert'), fs = require('fs'), path = require('path'), http = require('http'), { execSync } = require('child_process');
const NUBE = path.join(__dirname, '..', 'nube');
const PAGINAS = ['index.html', 'aviso-legal.html', 'privacidad.html'];

// ---- estáticas: siempre ----
for (const p of PAGINAS) {
  const h = fs.readFileSync(path.join(NUBE, p), 'utf8');
  assert(/<meta name="viewport" content="[^"]*width=device-width/.test(h), p + ' tiene viewport para celular');
  assert(/<html[^>]*lang="es/.test(h), p + ' declara el idioma');
}
const css = fs.readFileSync(path.join(NUBE, 'landing', 'landing.css'), 'utf8');
assert(/\.hero__palabra[^}]*clamp\(/.test(css), 'la palabra gigante usa tipografía fluida');

// ---- en navegador ----
function cargarPlaywright() {
  const candidatos = ['playwright-core', 'playwright'];
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); candidatos.push(path.join(g, '@playwright', 'cli', 'node_modules', 'playwright-core')); } catch (e) { /* sin npm global */ }
  for (const c of candidatos) { try { return require(c); } catch (e) { /* siguiente */ } }
  return null;
}
const VISTAS = [[320, 700], [360, 740], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1366, 600], [1440, 900], [1920, 1080], [2560, 1440],
  // 1920 con zoom 90, 125 y 150 %: el navegador ve un viewport CSS más chico
  [2133, 1200], [1536, 864], [1280, 720]];

const medir = () => {
  const vw = document.documentElement.clientWidth, malos = [];
  const visible = e => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const oculto = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { if (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('hidden') || !visible(n)) return true; } return false; };
  for (const e of document.querySelectorAll('body *')) {
    if (oculto(e) || e.closest('svg,.skip-link,.skip,.sello,.sello-m')) continue;
    const propio = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (propio && (r.left < -1 || r.right > vw + 1) && !e.closest('.hero__palabra,.palabra-pie')) malos.push('texto fuera de la pantalla: ' + e.tagName + '.' + e.className + ' "' + e.textContent.trim().slice(0, 30) + '" ' + Math.round(r.left) + '..' + Math.round(r.right));
    if (vw < 1024 && /^(A|BUTTON)$/.test(e.tagName) && /\bbtn\b|nav__toggle|\bmov\b/.test(e.className) && r.height < 43.5) malos.push('botón chico: ' + e.className + ' ' + Math.round(r.height) + 'px');
  }
  // la palabra gigante no puede pisar el texto del hero, y los bloques de texto no se superponen entre sí
  const pal = document.querySelector('.hero__palabra'), izq = document.querySelector('.hero__izq');
  const toca = (a, b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2;
  if (pal && izq && getComputedStyle(pal).display !== 'none' && toca(pal.getBoundingClientRect(), izq.getBoundingClientRect())) malos.push('la palabra gigante pisa el texto del portada');
  const bloques = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li, footer p, footer li')]
    .filter(e => !oculto(e) && !e.closest('.sv, .vs__scene, .vs__item, .mo-pc__steps, .sv__steps, .xfade') && e.getBoundingClientRect().width && getComputedStyle(e).opacity !== '0' && ![...e.querySelectorAll('h1,h2,h3,p,li')].length);
  for (let i = 0; i < bloques.length; i++) for (let j = i + 1; j < bloques.length; j++) {
    if (bloques[i].contains(bloques[j]) || bloques[j].contains(bloques[i])) continue;
    if (toca(bloques[i].getBoundingClientRect(), bloques[j].getBoundingClientRect())) malos.push('textos superpuestos: "' + bloques[i].textContent.trim().slice(0, 25) + '" y "' + bloques[j].textContent.trim().slice(0, 25) + '"');
  }
  if (document.documentElement.scrollWidth > vw + 1) malos.push('scroll horizontal: ' + document.documentElement.scrollWidth + ' > ' + vw);
  return malos;
};

(async () => {
  const pw = cargarPlaywright();
  let navegador = null;
  if (pw) for (const channel of ['msedge', 'chrome']) { try { navegador = await pw.chromium.launch({ channel }); break; } catch (e) { /* probar otro */ } }
  if (!navegador) { console.log('landing-responsive: comprobaciones estáticas OK; sin Playwright o navegador, se saltea el recorrido de anchos'); return; }
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(NUBE, p);
    if (!f.startsWith(NUBE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.vtt': 'text/vtt' };
    r.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/', fallas = [];
  const dirCap = process.env.CAPTURAS_RESPONSIVE;
  try {
    for (const [w, h] of VISTAS) {
      const ctx = await navegador.newContext({ viewport: { width: w, height: h } }), pag = await ctx.newPage();
      for (const p of PAGINAS) {
        await pag.goto(base + p); await pag.waitForTimeout(700);
        if (p === 'index.html') { // baja por toda la página para que entren los elementos que aparecen al scrollear
          const alto = await pag.evaluate(() => document.documentElement.scrollHeight);
          for (let y = 0; y < alto; y += Math.max(300, h - 100)) { await pag.evaluate(v => window.scrollTo(0, v), y); await pag.waitForTimeout(40); }
          await pag.evaluate(() => window.scrollTo(0, 0)); await pag.waitForTimeout(300);
        }
        const malos = await pag.evaluate(medir);
        malos.forEach(m => fallas.push(`${p} a ${w}x${h}: ${m}`));
        if (dirCap) { fs.mkdirSync(dirCap, { recursive: true }); await pag.screenshot({ path: path.join(dirCap, `${p.replace('.html', '')}-${w}x${h}.png`), fullPage: false }); }
      }
      await ctx.close();
    }
  } finally { await navegador.close(); srv.close(); }
  assert.strictEqual(fallas.length, 0, 'problemas de responsive:\n' + [...new Set(fallas)].slice(0, 25).join('\n'));
  console.log('landing-responsive OK (' + VISTAS.length + ' tamaños, ' + PAGINAS.length + ' páginas)');
})().catch(e => { console.error(e.message || e); process.exit(1); });
