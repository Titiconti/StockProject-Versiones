// Utilidades compartidas por las pruebas: navegador simulado (jsdom) con la aplicación cargada.
const { JSDOM } = require('jsdom'), fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(40); } return false; }

function api(w) {
  const d = w.document, $ = s => d.querySelector(s);
  w.Element.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};   // jsdom no los implementa
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  const ev = (el, t, o) => el.dispatchEvent(new w.Event(t, { bubbles: true, ...o }));
  return {
    w, d, $, errs,
    click: s => (typeof s === 'string' ? $(s) : s).dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
    set: (s, v) => { $(s).value = v; ev($(s), 'input'); ev($(s), 'change'); },
    pick: s => $(s).querySelector('[data-s]').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true })),
    tab: t => $('nav button[data-t=' + t + ']').dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
    txt: s => $(s).textContent.replace(/[\s\u00a0]+/g, ' '),
    f: n => w.eval(`fmt(${n})`).replace(/[\s\u00a0]+/g, ' '),
    db: () => JSON.parse(w.eval('JSON.stringify(db)')),
    ev
  };
}
// Versión web (datos en el navegador) con la demo de productos y clientes.
function web() { const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true }); return api(dom.window); }
module.exports = { JSDOM, HTML, wait, until, api, web };
