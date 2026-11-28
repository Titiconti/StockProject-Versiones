/* Galería desplazable. Uso: <div data-galeria><ul class="gal__pista"><li class="gal__slide"><figure><img><figcaption class="gal__cap"><h3>..</h3><p>..</p></figcaption></figure></li>...</ul></div>
   El desplazamiento y el "imán" son nativos (scroll-snap): sin JS igual se desliza. El JS agrega flechas, puntos, teclado
   y un texto común (aria-live) que cambia con la imagen. Sin animación con el botón 'Reducir movimiento' (sin-animaciones); la opción del sistema se respeta en el CSS. */
(function () {
  function quieto() {
    return window.SP_SIN_ANIMACIONES === true || document.documentElement.classList.contains('sin-animaciones');
  }
  function boton(clase, nombre, html) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = clase; b.setAttribute('aria-label', nombre); b.innerHTML = html;
    return b;
  }
  var FLECHA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function montar(gal) {
    var pista = gal.querySelector('.gal__pista');
    var slides = pista ? Array.prototype.slice.call(pista.children) : [];
    if (slides.length < 2) return;
    var n = slides.length, actual = -1, temporizador = 0;
    gal.classList.add('gal--js');

    slides.forEach(function (s, i) {
      s.setAttribute('role', 'group'); s.setAttribute('aria-roledescription', 'diapositiva');
      s.setAttribute('aria-label', (i + 1) + ' de ' + n);
    });

    var texto = document.createElement('div'); texto.className = 'gal__texto';
    texto.setAttribute('aria-live', 'polite'); texto.setAttribute('aria-atomic', 'true');
    var h = document.createElement('h3'), p = document.createElement('p');
    texto.appendChild(h); texto.appendChild(p);

    var prev = boton('gal__flecha gal__flecha--prev', 'Pantalla anterior', FLECHA);
    var next = boton('gal__flecha gal__flecha--next', 'Pantalla siguiente', FLECHA);
    var cuenta = document.createElement('span'); cuenta.className = 'gal__cuenta';
    var puntos = document.createElement('div'); puntos.className = 'gal__puntos';
    var dots = slides.map(function (s, i) {
      var t = s.querySelector('h3'), d = boton('gal__punto', 'Ir a la pantalla ' + (i + 1) + ' de ' + n + (t ? ': ' + t.textContent : ''), '<span></span>');
      d.addEventListener('click', function () { ir(i); });
      puntos.appendChild(d); return d;
    });
    var ctl = document.createElement('div'); ctl.className = 'gal__ctl';
    ctl.appendChild(prev); ctl.appendChild(puntos); ctl.appendChild(next);
    var lado = document.createElement('div'); lado.className = 'gal__lado';
    lado.appendChild(texto); lado.appendChild(cuenta); lado.appendChild(ctl);
    gal.appendChild(lado);

    function pintar(i) {
      var cap = slides[i].querySelector('.gal__cap');
      h.textContent = cap.querySelector('h3').textContent; p.textContent = cap.querySelector('p').textContent;
      cuenta.textContent = (i + 1) + ' / ' + n;
      dots.forEach(function (d, k) { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
      slides.forEach(function (s, k) { s.classList.toggle('is-activa', k === i); });
      prev.disabled = i === 0; next.disabled = i === n - 1;
    }
    function mostrar(i) {
      if (i === actual) return;
      var primera = actual < 0; actual = i;
      if (primera || quieto()) { pintar(i); return; }
      texto.classList.add('is-sale');
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { pintar(actual); texto.classList.remove('is-sale'); }, 140);
    }
    function ir(i) {
      i = Math.max(0, Math.min(n - 1, i));
      pista.scrollTo({ left: i * pista.clientWidth }); // suave o no lo decide el CSS (scroll-behavior)
    }
    var cuadro = 0;
    pista.addEventListener('scroll', function () {
      if (cuadro) return;
      cuadro = requestAnimationFrame(function () {
        cuadro = 0;
        mostrar(Math.max(0, Math.min(n - 1, Math.round(pista.scrollLeft / pista.clientWidth))));
      });
    }, { passive: true });
    prev.addEventListener('click', function () { ir(actual - 1); });
    next.addEventListener('click', function () { ir(actual + 1); });
    pista.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (e.key === 'Home') d = -n; else if (e.key === 'End') d = n;
      if (!d) return;
      e.preventDefault(); ir(actual + d);
    });
    window.addEventListener('resize', function () { ir(actual); });
    mostrar(0);
  }
  document.querySelectorAll('[data-galeria]').forEach(montar);
})();
