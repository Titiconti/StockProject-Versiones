/* Desenfoque progresivo sobre el borde de una tarjeta (ideal: foto con texto encima).
   Uso: <div class="tarjeta" data-blur-progresivo="bottom">...</div>  (top | bottom | left | right)
   Apagar: clase "sin-animaciones" o "sin-blur" en <html> (el CSS oculta las capas).
   Base: 21st @ibelick/progressive-blur (Motion Primitives, Julien Thibeaut, MIT; https://21st.dev/community/components/ibelick/progressive-blur) - (mismo cálculo de capas y máscaras, en JS puro). */
(function () {
  var ANGULO = { top: 0, right: 90, bottom: 180, left: 270 };
  var CAPAS = 6, INTENSIDAD = 1; // px de blur extra por capa
  function montar(el) {
    if (el.querySelector('.blur-prog')) return;
    var dir = ANGULO[el.getAttribute('data-blur-progresivo')] !== undefined ? el.getAttribute('data-blur-progresivo') : 'bottom';
    var cont = document.createElement('div');
    cont.className = 'blur-prog';
    cont.setAttribute('aria-hidden', 'true');
    var seg = 1 / (CAPAS + 1);
    for (var i = 0; i < CAPAS; i++) {
      var paradas = [i, i + 1, i + 2, i + 3].map(function (p, k) {
        return 'rgba(0,0,0,' + (k === 1 || k === 2 ? 1 : 0) + ') ' + (p * seg * 100).toFixed(1) + '%';
      });
      var mascara = 'linear-gradient(' + ANGULO[dir] + 'deg,' + paradas.join(',') + ')';
      var capa = document.createElement('div');
      capa.style.cssText = '-webkit-mask-image:' + mascara + ';mask-image:' + mascara +
        ';backdrop-filter:blur(' + (i * INTENSIDAD) + 'px);-webkit-backdrop-filter:blur(' + (i * INTENSIDAD) + 'px)';
      cont.appendChild(capa);
    }
    el.appendChild(cont);
  }
  function montarTodo() { document.querySelectorAll('[data-blur-progresivo]').forEach(montar); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTodo); else montarTodo();
  window.SPBlurProgresivo = { montar: montar };
})();
