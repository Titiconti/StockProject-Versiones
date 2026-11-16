// La landing (nube/index.html, la sirve Vercel como archivo estático en "/"): todo lo que enlaza existe,
// no quedan textos de plantilla y la demo de ventas calcula bien el total, el vuelto y el stock.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
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

// 3) la demo: se agrega, se cobra con vuelto y se descuenta el stock (en memoria)
(async () => {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1/' });
  global.document = dom.window.document;
  const src = fs.readFileSync(path.join(NUBE, 'landing', 'demo.js'), 'utf8').replace(/^export /m, '');
  new Function(src)();
  const d = document.querySelector('[data-demo]'), $ = s => d.querySelector(s);
  const prod = n => [...$('[data-d-grilla]').children].find(b => b.textContent.includes(n));
  prod('Yerba Playadito').click(); prod('Leche La Serenísima').click(); prod('Leche La Serenísima').click();
  assert.strictEqual($('[data-d-total]').textContent.replace(/\s/g, ' '), '$ 10.200,00', 'total de la venta');
  const rec = $('[data-d-recibido]'); rec.value = '15000'; rec.dispatchEvent(new dom.window.Event('input'));
  assert.strictEqual($('[data-d-vuelto]').textContent, '$ 4.800,00', 'vuelto');
  $('[data-d-cobrar]').click();
  assert($('[data-d-aviso]').textContent.startsWith('Venta cobrada'), 'cobra');
  assert.strictEqual($('[data-d-vendido]').textContent, '$ 10.200,00', 'suma a la caja');
  assert(prod('Yerba Playadito').textContent.includes('Disponible: 17'), 'descuenta el stock');
  // sin plata suficiente no cobra
  prod('Café La Virginia').click(); rec.value = '100'; rec.dispatchEvent(new dom.window.Event('input'));
  $('[data-d-cobrar]').click();
  assert($('[data-d-aviso]').textContent.startsWith('Falta plata'), 'avisa que falta plata');
  // no deja vender más de lo que hay
  const pan = prod('Pan lactal'); for (let i = 0; i < 8; i++) prod('Pan lactal').click();
  assert(prod('Pan lactal').disabled, 'sin stock no se puede agregar');
  assert(pan);
  console.log('landing OK');
})().catch(e => { console.error(e); process.exit(1); });
