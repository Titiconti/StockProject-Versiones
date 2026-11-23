// Portada: la caja del logo (la animación de inicio del programa, pero al revés) empieza armada y se abre al scrollear;
// de adentro sale el recorrido del almacén, que avanza y retrocede con el scroll. Todo se mide con el scroll (sin librerías).
// Las tomas van en una lista (data-tomas): más adelante se encadenan las de cobro, QR y celular. Con "Reducir movimiento"
// (clase sp-quieto) o sin JS queda la caja abierta y quieta y el video con sus controles.
(() => {
const sec = document.querySelector('[data-portada]');
if (!sec || document.documentElement.classList.contains('sp-quieto')) { activarPantalla(sec); return; }
const stage = sec.querySelector('.hero'), caja = sec.querySelector('[data-tomas]'), lienzo = caja.querySelector('.portada__lienzo');
const fig = sec.querySelector('.hero__figura'), palabra = sec.querySelector('.hero__palabra');
const L = sec.querySelector('.pc-l'), R = sec.querySelector('.pc-r'), T = sec.querySelector('.pc-t'), C = sec.querySelector('.pc-c');
const textos = [sec.querySelector('.hero__izq'), sec.querySelector('.hero__der')];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
const suave = x => (x = clamp(x), x * x * (3 - 2 * x));
sec.classList.add('is-live');

// ---- las tomas (por ahora una; sumar más es agregar otro <video> con su data-nombre) ----
const tomas = [...lienzo.querySelectorAll('video')].map(v => ({ v, listo: false, cur: 0, meta: 0 }));
tomas.forEach(t => { t.v.removeAttribute('controls'); t.v.tabIndex = -1; });
function cargar(t) {
  if (t.cargando) return; t.cargando = true;
  fetch(t.v.getAttribute('src')).then(r => r.ok ? r.blob() : Promise.reject(new Error('sin video'))).then(b => {
    t.v.addEventListener('loadedmetadata', () => { t.listo = true; }, { once: true });
    t.v.src = URL.createObjectURL(b); t.v.load();
  }).catch(() => { t.cargando = false; });
}
(window.requestIdleCallback || setTimeout)(() => tomas.forEach(cargar));

// ---- tamaño del lienzo: el video cubre la pantalla; en vertical se centra en el monitor ----
function ajustar() {
  const vw = stage.clientWidth, vh = stage.clientHeight, W = Math.max(vw, vh * 16 / 9), H = W * 9 / 16, fx = vw < 768 ? 0.36 : 0.5;
  Object.assign(lienzo.style, { width: W + 'px', height: H + 'px', left: clamp(vw / 2 - fx * W, vw - W, 0) + 'px', top: (vh - H) / 2 + 'px' });
  const s = stage.getBoundingClientRect(), f = fig.getBoundingClientRect();
  caja.style.setProperty('--cx', (f.left - s.left + f.width / 2) + 'px'); caja.style.setProperty('--cy', (f.top - s.top + f.height / 2) + 'px');
  caja.dataset.rmax = Math.hypot(vw, vh);
}

// ---- la caja se abre: el orden es el del inicio del programa al revés (se borra la tilde, sube la tapa, se abren los lados) ----
function abrir(q) {
  C.style.strokeDashoffset = clamp(q / 0.2);
  const t = suave((q - 0.12) / 0.5), r = suave((q - 0.3) / 0.5), l = suave((q - 0.4) / 0.6);
  T.style.transform = `translate(0, ${(-130 * t).toFixed(1)}px) scale(${lerp(1, 1.3, t).toFixed(3)})`; T.style.opacity = 1 - t * t;
  R.style.transform = `translate(${(120 * r).toFixed(1)}px, ${(70 * r).toFixed(1)}px) scale(${lerp(1, 1.3, r).toFixed(3)})`; R.style.opacity = 1 - r * r;
  L.style.transform = `translate(${(-120 * l).toFixed(1)}px, ${(70 * l).toFixed(1)}px) scale(${lerp(1, 1.3, l).toFixed(3)})`; L.style.opacity = 1 - l * l;
  [T, R, L].forEach(g => { g.style.transformBox = 'fill-box'; g.style.transformOrigin = 'center'; });
}
const ABRE = 0.30; // fracción del recorrido en que termina de abrirse la caja
let p = 0;
function leer() {
  const r = sec.getBoundingClientRect(), recorrido = Math.max(1, r.height - innerHeight);
  p = clamp(-r.top / recorrido);
  const q = clamp((p - 0.03) / (ABRE - 0.03));
  abrir(q);
  caja.style.setProperty('--r', (Number(caja.dataset.rmax) * suave((q - 0.05) / 0.95)).toFixed(0) + 'px');
  textos.forEach(t => { t.style.opacity = 1 - clamp(q / 0.6); t.style.visibility = q > 0.6 ? 'hidden' : 'visible'; });
  palabra.style.opacity = 1 - clamp((p - 0.2) / 0.14);
  const v = clamp((p - ABRE) / (0.96 - ABRE)), n = tomas.length, k = Math.min(n - 1, Math.floor(v * n)), local = clamp(v * n - k);
  tomas.forEach((t, i) => { t.meta = i === k ? local : (i < k ? 1 : 0); t.v.style.opacity = i === k || (i === k - 1 && local < 0.04) ? 1 : (i < k ? 0 : 0); });
}
function cuadro() {
  for (const t of tomas) {
    if (!t.listo || t.v.seeking) continue;
    t.cur += (t.meta - t.cur) * 0.18;
    const s = clamp(t.cur, 0, 0.999) * (t.v.duration || 1);
    if (Math.abs(t.v.currentTime - s) > 0.03) { try { t.v.currentTime = s; } catch (e) { /* sin metadatos */ } }
  }
  requestAnimationFrame(cuadro);
}
addEventListener('scroll', leer, { passive: true });
addEventListener('resize', () => { ajustar(); leer(); });
addEventListener('load', () => { ajustar(); leer(); });
ajustar(); leer(); requestAnimationFrame(cuadro);
activarPantalla(sec);

// ---- la captura real de StockProject (Ventas) encima de la pantalla del monitor, siguiendo el movimiento de la cámara ----
function activarPantalla(raiz) {
  if (!raiz) return;
  const v = raiz.querySelector('video[data-nombre="entrada"]'), im = raiz.querySelector('.portada__pantalla');
  if (!v || !im) return;
  // [segundo, x0, y0, x1, y1] del recuadro blanco del monitor, medido cada 0,25 s sobre el video (fracciones del cuadro)
  const K = [[1.5, .409, .372, .497, .456], [1.75, .4, .367, .497, .456], [2, .391, .361, .494, .456], [2.25, .381, .35, .494, .456], [2.5, .372, .344, .494, .456], [2.75, .359, .333, .494, .456], [3, .347, .322, .494, .456], [3.25, .331, .311, .491, .461], [3.5, .316, .3, .491, .461], [3.75, .297, .289, .491, .467], [4, .284, .272, .491, .467], [4.25, .272, .256, .497, .467], [4.5, .259, .244, .5, .467], [4.75, .244, .228, .503, .467], [5, .231, .211, .506, .467], [5.25, .216, .2, .506, .467], [5.5, .203, .189, .509, .472], [5.75, .191, .178, .512, .472], [6, .181, .167, .516, .478], [6.25, .172, .161, .519, .478], [6.5, .166, .15, .522, .483], [6.75, .163, .144, .525, .483], [7, .159, .144, .528, .489], [7.25, .156, .139, .528, .489], [7.5, .153, .139, .531, .489], [7.75, .156, .139, .531, .489]];
  const pintar = () => {
    const t = v.currentTime;
    if (v.readyState < 2 || v.seeking || t < K[0][0] - 0.01) { im.style.opacity = 0; return requestAnimationFrame(pintar); }
    let i = 0; while (i < K.length - 2 && K[i + 1][0] <= t) i++;
    const a = K[i], b = K[i + 1], f = clamp((t - a[0]) / (b[0] - a[0])), m = (x, y) => x + (y - x) * f;
    const x0 = m(a[1], b[1]), y0 = m(a[2], b[2]), x1 = m(a[3], b[3]), y1 = m(a[4], b[4]);
    Object.assign(im.style, { left: x0 * 100 + '%', top: y0 * 100 + '%', width: (x1 - x0) * 100 + '%', height: (y1 - y0) * 100 + '%', opacity: clamp((t - 1.5) / 0.4) });
    requestAnimationFrame(pintar);
  };
  function clamp(x, a = 0, b = 1) { return Math.min(b, Math.max(a, x)); }
  requestAnimationFrame(pintar);
}
})();