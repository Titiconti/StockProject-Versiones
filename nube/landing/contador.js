/* Contador que sube hasta el número cuando entra en pantalla.
   Uso: <span data-contador="1250" data-prefijo="$" data-sufijo="+">1.250</span>  (el texto inicial es el valor final: sin JS se ve igual)
   Apagar: window.SP_SIN_ANIMACIONES = true, o clase "sin-animaciones" (la pone movimiento.js con el botón Reducir movimiento) / "sin-contador" en <html>: muestra el valor final directo.
   Base: 21st @preetsuthar17/animated-counter (idea; sin React ni motion). */
(function () {
  var DURACION = 1400; // ms
  var fmt = new Intl.NumberFormat('es-AR');
  function apagado() {
    var c = document.documentElement.classList;
    return window.SP_SIN_ANIMACIONES === true || c.contains('sin-animaciones') || c.contains('sin-contador');
  }
  function texto(el, n) { return (el.dataset.prefijo || '') + fmt.format(n) + (el.dataset.sufijo || ''); }
  function animar(el) {
    var fin = Number(el.dataset.contador);
    if (!isFinite(fin)) return;
    if (apagado()) { el.textContent = texto(el, fin); return; }
    var t0 = performance.now();
    (function paso(t) {
      var p = Math.max(0, Math.min(1, (t - t0) / DURACION)); // sin negativos: evita "-0" en el primer cuadro
      var suave = 1 - Math.pow(1 - p, 3); // ease-out cúbico: arranca rápido, frena al llegar
      el.textContent = texto(el, Math.round(fin * suave));
      if (p < 1) requestAnimationFrame(paso);
    })(t0);
  }
  function montarTodo() {
    var els = document.querySelectorAll('[data-contador]');
    if (!('IntersectionObserver' in window)) { els.forEach(animar); return; }
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); animar(en.target); } });
    }, { threshold: 0.5 });
    els.forEach(function (el) { io.observe(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTodo); else montarTodo();
  window.SPContador = { animar: animar };
})();
