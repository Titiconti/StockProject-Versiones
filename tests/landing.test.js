// La landing (nube/index.html, la sirve Vercel como archivo estático en "/"): todo lo que enlaza existe, sin terceros ni cookies,
// con páginas legales, prueba social rotulada y sin textos de plantilla.
const assert = require('assert'), fs = require('fs'), path = require('path');
const NUBE = path.join(__dirname, '..', 'nube');
const html = fs.readFileSync(path.join(NUBE, 'index.html'), 'utf8');

// 1) cada archivo local que la página pide existe (los videos se suman aparte y pueden faltar)
const locales = [...html.matchAll(/(?:src|href|poster)="(landing\/[^"#?]+)"/g)].map(m => m[1]);
assert(locales.length > 10, 'la página enlaza sus archivos');
const faltan = locales.filter(f => !f.endsWith('.mp4') && !fs.existsSync(path.join(NUBE, f)));
assert.deepStrictEqual(faltan, [], 'faltan archivos: ' + faltan.join(', '));

// 2) sin restos de plantilla ni enlaces vacíos
assert(!/\[[A-Za-z][^\]]*\]/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'no quedan [textos de plantilla]');
assert(!/href="#"/.test(html), 'ningún enlace a "#" solo');
assert(/<meta name="sp-whatsapp"/.test(html) && /<meta name="sp-mail"/.test(html), 'el contacto se configura en un solo lugar');

// 3) sin terceros ni cookies: ningún recurso externo (solo enlaces de salida a WhatsApp), ni almacenamiento en el navegador
const paginas = ['index.html', 'aviso-legal.html', 'privacidad.html'];
const js = fs.readdirSync(path.join(NUBE, 'landing')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(NUBE, 'landing', f), 'utf8')).join('\n');
for (const p of paginas) {
  const h = fs.readFileSync(path.join(NUBE, p), 'utf8');
  assert(!/(?:src|href)="https?:\/\/(?!wa\.me)/.test(h.replace(/<link rel="canonical"[^>]*>/, '').replace(/<meta[^>]*>/g, '')), p + ' no pide nada a otro sitio');
  assert(!/googleapis|gstatic|cdnjs|unpkg|jsdelivr/.test(h), p + ' sin CDN ni Google Fonts');
}
assert(!/localStorage|sessionStorage|document\.cookie|gtag|fbq|analytics/i.test(js + html), 'sin cookies ni analítica');
const css = ['landing.css', path.join('fonts', 'fonts.css')].map(f => fs.readFileSync(path.join(NUBE, 'landing', f), 'utf8')).join('\n');
assert(!/https?:\/\//.test(css), 'los CSS propios no piden nada afuera');
assert(!html.includes('data-demo'), 'la demo de ventas ya no está');

// 4) páginas legales enlazadas en el pie, con el responsable y sin condición fiscal ni textos a completar
assert(/href="aviso-legal\.html"/.test(html) && /href="privacidad\.html"/.test(html), 'el pie enlaza las páginas legales');
for (const p of ['aviso-legal.html', 'privacidad.html']) {
  const h = fs.readFileSync(path.join(NUBE, p), 'utf8');
  assert(h.includes('Tiziano Barbaglia Conti') && h.includes('20-46654273-4') && h.includes('Ituzaingó 4220'), p + ' nombra al responsable');
  assert(!/CUIT|CONDICIÓN FISCAL|completar/i.test(h), p + ' sin condición fiscal ni textos a completar');
}
const priv = fs.readFileSync(path.join(NUBE, 'privacidad.html'), 'utf8');
for (const x of ['25.326', 'RGPD', 'Vercel', 'Upstash', 'menores', 'supresión']) assert(priv.includes(x), 'la privacidad menciona ' + x);
assert(/Ejemplo/.test(html) && /no es un cliente real/.test(html), 'el comercio de ejemplo está rotulado');
assert(/Protenay/.test(html) && !/<blockquote/.test(html), 'Darío figura sin citas inventadas');
assert(/Meta Platforms/.test(html) && /Microsoft/.test(html), 'aviso de marcas en el pie');
assert(/prefers-reduced-motion/.test(js), 'respeta movimiento reducido');
console.log('landing OK');
