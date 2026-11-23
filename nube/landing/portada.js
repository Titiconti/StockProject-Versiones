// Portada: la caja del logo (la animación de inicio del programa, pero al revés) empieza armada, con "StockProject" gigante
// detrás, y se abre al scrollear; avanza y retrocede con el scroll. Cuando termina de abrirse sigue la landing normal.
// Con "Reducir movimiento" (clase sp-quieto) o sin JS la caja queda abierta y quieta.
(() => {
const sec = document.querySelector('[data-portada]');
if (!sec || document.documentElement.classList.contains('sp-quieto')) return;
const L = sec.querySelector('.pc-l'), R = sec.querySelector('.pc-r'), T = sec.querySelector('.pc-t'), C = sec.querySelector('.pc-c');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
const suave = x => (x = clamp(x), x * x * (3 - 2 * x));
sec.classList.add('is-live');
[T, R, L].forEach(g => { g.style.transformBox = 'fill-box'; g.style.transformOrigin = 'center'; });

// orden del inicio del programa, al revés: se borra la tilde, sube la tapa y se abren los lados
function abrir(q) {
  C.style.strokeDashoffset = clamp(q / 0.2);
  const t = suave((q - 0.12) / 0.5), r = suave((q - 0.3) / 0.5), l = suave((q - 0.4) / 0.6);
  T.style.transform = `translate(0, ${(-130 * t).toFixed(1)}px) scale(${lerp(1, 1.3, t).toFixed(3)})`; T.style.opacity = 1 - t * t;
  R.style.transform = `translate(${(120 * r).toFixed(1)}px, ${(70 * r).toFixed(1)}px) scale(${lerp(1, 1.3, r).toFixed(3)})`; R.style.opacity = 1 - r * r;
  L.style.transform = `translate(${(-120 * l).toFixed(1)}px, ${(70 * l).toFixed(1)}px) scale(${lerp(1, 1.3, l).toFixed(3)})`; L.style.opacity = 1 - l * l;
}
function leer() {
  const r = sec.getBoundingClientRect(), recorrido = Math.max(1, r.height - innerHeight);
  abrir(clamp((-r.top / recorrido - 0.04) / 0.86));
}
addEventListener('scroll', leer, { passive: true });
addEventListener('resize', leer);
leer();
})();