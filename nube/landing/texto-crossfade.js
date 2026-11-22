/* Texto que rota entre palabras con crossfade (opacidad + leve desenfoque y subida).
   Uso: <span data-crossfade="kioscos|almacenes|heladerías">kioscos</span>
   Apagar: window.SP_SIN_ANIMACIONES = true, o clase "sin-animaciones" (la pone movimiento.js con el botón Reducir movimiento) / "sin-crossfade" en <html>: queda la primera palabra fija.
   Base: 21st @educalvolpz/per-word-crossfade (misma curva calma; acá rota palabras en vez de revelar un título). */
(function () {
  var ESPERA = 2600; // ms que se ve cada palabra
  function apagado() {
    var c = document.documentElement.classList;
    return window.SP_SIN_ANIMACIONES === true || c.contains('sin-animaciones') || c.contains('sin-crossfade');
  }
  function montar(el) {
    var palabras = el.getAttribute('data-crossfade').split('|').map(function (p) { return p.trim(); }).filter(Boolean);
    if (palabras.length < 2 || el.dataset.crossfadeListo) return;
    el.dataset.crossfadeListo = '1';
    el.textContent = '';
    el.classList.add('xfade');
    var lector = document.createElement('span'); // los lectores de pantalla leen la lista una vez, sin anuncios cada 2 s
    lector.className = 'xfade-lector';
    lector.textContent = palabras.join(', ');
    el.appendChild(lector);
    var spans = palabras.map(function (p, i) {
      var s = document.createElement('span');
      s.className = 'xfade-palabra' + (i === 0 ? ' activa' : '');
      s.setAttribute('aria-hidden', 'true');
      s.textContent = p;
      el.appendChild(s);
      return s;
    });
    var i = 0;
    setInterval(function () {
      if (apagado() || document.hidden) return;
      spans[i].classList.remove('activa');
      i = (i + 1) % spans.length;
      spans[i].classList.add('activa');
    }, ESPERA);
  }
  function montarTodo() { document.querySelectorAll('[data-crossfade]').forEach(montar); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTodo); else montarTodo();
})();
