(() => {
// Los tres videos del programa, avanzados con el scroll (técnica del motor "scrub" de scroll-world: el video se carga
// como blob, siempre se puede buscar en él, y se mueve currentTime según el scroll, sin pedidos nuevos mientras busca).
// Crossfade entre escenas, la escena activa se agranda y el resto se desenfoca. Con "reducir movimiento" o sin JS
// quedan los tres videos con sus controles y su descripción, sin movimiento.
const sec = document.querySelector('[data-videos]');
const reducir = document.documentElement.classList.contains('sp-quieto');
if (sec && !reducir) {
  const escenas = [...sec.querySelectorAll('[data-escena]')];
  const items = [...sec.querySelectorAll('.vs__item')];
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const estado = escenas.map(e => ({ el: e, v: e.querySelector('video'), listo: false, cargando: false, cur: 0, meta: 0 }));
  sec.classList.add('is-live');
  for (const s of estado) { s.v.removeAttribute('controls'); s.v.setAttribute('tabindex', '-1'); }

  function cargar(s) {
    if (s.cargando) return;
    s.cargando = true;
    fetch(s.v.getAttribute('src')).then(r => r.ok ? r.blob() : Promise.reject(new Error('sin video')))
      .then(b => {
        s.v.addEventListener('loadedmetadata', () => { s.listo = true; }, { once: true });
        s.v.src = URL.createObjectURL(b); s.v.load();
      }).catch(() => { s.cargando = false; });
  }

  let activa = -1;
  function leer() {
    const r = sec.getBoundingClientRect(), recorrido = r.height - innerHeight;
    const p = clamp(-r.top / Math.max(1, recorrido));
    if (r.top < innerHeight * 1.5 && r.bottom > -innerHeight) estado.forEach(cargar);
    const i = Math.min(escenas.length - 1, Math.floor(p * escenas.length));
    const local = clamp(p * escenas.length - i);
    estado.forEach((s, k) => { s.meta = k === i ? local : (k < i ? 1 : 0); });
    if (i !== activa) {
      activa = i;
      escenas.forEach((e, k) => e.classList.toggle('is-activa', k === i));
      items.forEach((e, k) => e.classList.toggle('is-activa', k === i));
    }
  }
  function cuadro() {
    for (const s of estado) {
      if (!s.listo || s.v.seeking) continue;
      s.cur += (s.meta - s.cur) * 0.18;
      const t = clamp(s.cur, 0, 0.999) * (s.v.duration || 1);
      if (Math.abs(s.v.currentTime - t) > 0.03) { try { s.v.currentTime = t; } catch (e) { /* aún sin metadatos */ } }
    }
    requestAnimationFrame(cuadro);
  }
  addEventListener('scroll', leer, { passive: true });
  addEventListener('resize', leer);
  leer();
  requestAnimationFrame(cuadro);
}
})();
