// Preferencia propia "Reducir movimiento": los efectos de la landing siguen activos aunque el sistema pida menos animaciones;
// quien se marea los apaga con el botón. Se recuerda solo en este navegador (localStorage, sin cookies); si el navegador
// no deja guardar, el botón igual apaga los efectos hasta recargar.
(() => {
  const K = 'sp-reducir-movimiento', raiz = document.documentElement;
  let quieto = false;
  try { quieto = localStorage.getItem(K) === '1'; } catch (e) { /* sin almacenamiento: se queda en normal */ }
  if (quieto) raiz.classList.add('sp-quieto', 'sin-animaciones'); // sin-animaciones apaga también los componentes 21st
  document.addEventListener('DOMContentLoaded', () => {
    for (const b of document.querySelectorAll('[data-mov]')) {
      b.setAttribute('aria-pressed', String(quieto));
      b.addEventListener('click', () => {
        try { quieto ? localStorage.removeItem(K) : localStorage.setItem(K, '1'); } catch (e) { /* ver arriba */ }
        quieto = !quieto; raiz.classList.toggle('sp-quieto', quieto); raiz.classList.toggle('sin-animaciones', quieto);
        location.reload();
      });
    }
  });
})();