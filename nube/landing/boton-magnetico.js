/* Botón magnético. Uso: <a class="btn" data-magnetico>...</a>
   Apagar: window.SP_SIN_ANIMACIONES = true, o clase "sin-animaciones" (la pone movimiento.js con el botón Reducir movimiento) / "sin-magnetico" en <html>.
   Base: 21st @mohammadshehadeh/magnetic-button (idea; sin React ni Framer Motion). */
(function () {
  var FUERZA = 0.3;   // fracción de la distancia al centro que se mueve el botón
  var ALCANCE = 40;   // px alrededor del botón donde ya atrae
  function apagado() {
    var c = document.documentElement.classList;
    return window.SP_SIN_ANIMACIONES === true || c.contains('sin-animaciones') || c.contains('sin-magnetico') || !matchMedia('(pointer: fine)').matches;
  }
  function soltar(el) { el.style.transform = ''; }
  document.addEventListener('pointermove', function (e) {
    var botones = document.querySelectorAll('[data-magnetico]');
    for (var i = 0; i < botones.length; i++) {
      var el = botones[i];
      if (apagado()) { soltar(el); continue; }
      var r = el.getBoundingClientRect();
      var cerca = e.clientX > r.left - ALCANCE && e.clientX < r.right + ALCANCE &&
                  e.clientY > r.top - ALCANCE && e.clientY < r.bottom + ALCANCE;
      if (!cerca) { soltar(el); continue; }
      var dx = (e.clientX - (r.left + r.width / 2)) * FUERZA;
      var dy = (e.clientY - (r.top + r.height / 2)) * FUERZA;
      el.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    }
  }, { passive: true });
  document.addEventListener('pointerleave', function () {
    document.querySelectorAll('[data-magnetico]').forEach(soltar);
  });
})();
