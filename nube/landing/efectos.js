// Aparición simple y corta de los bloques [data-revela] al entrar en pantalla (por tiempo, una sola vez, sin scrub).
// Los únicos efectos ligados al scroll de la landing son la caja de la portada (portada.js) y el crossfade de los videos
// (videos-scrub.js). Con "Reducir movimiento" (clase sp-quieto) no se anima nada.
(() => {
  if (document.documentElement.classList.contains('sp-quieto')) return;
  document.documentElement.classList.add('fx');
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); e.target.classList.add('is-visivel'); } }), { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('[data-revela]').forEach(n => io.observe(n));
})();