(() => {
// Efectos para guiar la atención (todos apagados con "reducir movimiento"; sin librerías ni red):
//  - revelar: los títulos y bloques [data-revela] suben y aparecen una vez, por tiempo.
//  - números: [data-numero] entran con desenfoque horizontal y se asientan (idea de la plantilla Norte).
//  - sello (shared element): el cubo de la marca viaja de un título al siguiente y se "posa" en cada marcador.
//  - foco: lo que está en el centro de la pantalla se agranda (magnification) y el resto se desenfoca (blur).
const reducir = document.documentElement.classList.contains('sp-quieto');
const raiz = document.documentElement;
if (!reducir) {
  raiz.classList.add('fx');
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const suave = x => x * x * (3 - 2 * x);

  // revelar + números
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    e.target.classList.add('is-visivel');
    if (e.target.matches('[data-numero]')) numero(e.target);
  }), { rootMargin: '0px 0px -14% 0px' });
  document.querySelectorAll('[data-revela]').forEach(n => io.observe(n));

  function numero(bloque) {
    const v = bloque.querySelector('.numero__valor');
    if (!v) return;
    const t0 = performance.now(), dur = 1150;
    v.style.willChange = 'filter, transform, opacity';
    const paso = ahora => {
      const t = clamp((ahora - t0) / dur), e = 1 - Math.pow(1 - t, 4);
      v.style.filter = `blur(${(14 * (1 - e)).toFixed(2)}px)`;
      v.style.opacity = String(Math.min(1, t * 3));
      v.style.transform = `translate3d(${(5 * (1 - e)).toFixed(2)}%,0,0)`;
      if (t < 1) requestAnimationFrame(paso); else { v.style.filter = v.style.opacity = v.style.transform = v.style.willChange = ''; }
    };
    v.style.opacity = '0';
    requestAnimationFrame(paso);
  }

  // sello compartido: se acopla al marcador más cercano al 40 % de la altura y vuelve a su rincón al alejarse
  const sello = document.querySelector('[data-sello-vuelo]');
  const marcadores = [...document.querySelectorAll('[data-sello]')];
  const ancho = () => innerWidth >= 768;
  function moverSello() {
    if (!sello || !ancho()) return;
    const vh = innerHeight, ref = vh * 0.28;
    let mejor = null, d = Infinity;
    for (const m of marcadores) {
      const r = m.getBoundingClientRect(), c = r.top + r.height / 2, dd = Math.abs(c - ref);
      if (dd < d) { d = dd; mejor = r; }
    }
    if (!mejor) return;
    const k = suave(clamp(d / (vh * 0.45)));
    const x = mejor.left + (24 - mejor.left) * k, y = (mejor.top) + ((vh - 80) - mejor.top) * k;
    const esc = 1 + (1 - k) * 0.5;
    sello.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${esc.toFixed(3)})`;
    sello.style.opacity = scrollY < innerHeight * 0.8 ? '0' : String(0.12 + 0.88 * (1 - k));
  }

  // foco: agranda lo del centro, desenfoca lo demás dentro de su grupo
  const focos = [...document.querySelectorAll('[data-foco]')];
  function actualizarFoco() {
    if (!ancho()) return;
    const mid = innerHeight / 2;
    // agrupa por contenedor padre; en cada grupo gana el más cercano al centro (si está a la vista)
    const grupos = new Map();
    for (const f of focos) { const r = f.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) { f.classList.remove('dentro', 'fuera'); continue; } const s = f.closest('section'); (grupos.get(s) || grupos.set(s, []).get(s)).push([f, r]); }
    for (const lista of grupos.values()) {
      let gana = null, dm = Infinity;
      for (const [f, r] of lista) { const dd = Math.abs(r.top + r.height / 2 - mid); if (dd < dm) { dm = dd; gana = f; } }
      // las filas de 2 tarjetas: ambas cercanas al centro se tratan igual
      for (const [f, r] of lista) {
        const cerca = Math.abs(r.top + r.height / 2 - mid) <= dm + 40;
        f.classList.toggle('dentro', cerca && lista.length > 1);
        f.classList.toggle('fuera', !cerca && lista.length > 1);
      }
    }
  }

  let esperando = false;
  const tick = () => { esperando = false; moverSello(); actualizarFoco(); };
  const pedir = () => { if (!esperando) { esperando = true; requestAnimationFrame(tick); } };
  addEventListener('scroll', pedir, { passive: true });
  addEventListener('resize', pedir);
  addEventListener('load', pedir);
  pedir();
}
})();
