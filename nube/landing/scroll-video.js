// Hero con el video real del programa que avanza al scrollear: los cuadros WebP se dibujan en un canvas fijo
// (GSAP + ScrollTrigger miden el scroll; Lenis lo suaviza). Con "reducir movimiento" o sin librerías queda el
// primer cuadro quieto y los textos a la vista.
const raiz = document.querySelector('[data-scroll-video]');
const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;

function cfg() {
  const movil = matchMedia('(max-width: 767px)').matches;
  const total = Number(raiz.dataset.frames) || 0;
  const dir = movil ? raiz.dataset.pathMobile : raiz.dataset.path;
  return { total, url: i => `${dir}/f-${String(i + 1).padStart(4, '0')}.webp` };
}

function montar() {
  if (!raiz) return;
  const canvas = raiz.querySelector('canvas'), ctx = canvas.getContext('2d');
  const { total, url } = cfg();
  const cuadros = new Array(total);
  let actual = 0;

  function dibujar(i) {
    const img = cuadros[i];
    if (!img || !img.complete || !img.naturalWidth) return;
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    // "cover": llena la pantalla sin deformar, centrado
    const s = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }

  function cargar(i) {
    if (cuadros[i]) return cuadros[i];
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { if (i === actual) dibujar(i); };
    img.src = url(i);
    return (cuadros[i] = img);
  }

  cargar(0);
  addEventListener('resize', () => { canvas.width = 0; dibujar(actual); });
  if (reducir || !window.gsap || !window.ScrollTrigger) { raiz.classList.add('is-still'); return; }

  // el resto de los cuadros en orden, sin trabar la primera pintura
  let n = 1;
  const siguiente = () => { if (n < total) { cargar(n++); (window.requestIdleCallback || setTimeout)(siguiente); } };
  siguiente();

  gsap.registerPlugin(ScrollTrigger);
  if (window.Lenis) {
    const lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const estado = { f: 0 };
  const tl = gsap.timeline({
    scrollTrigger: { trigger: raiz, start: 'top top', end: 'bottom bottom', scrub: true },
  });
  // el video termina al 80 % del recorrido; el último tramo deja leer el cierre
  tl.to(estado, {
    f: total - 1, ease: 'none', duration: 0.8,
    onUpdate: () => { const i = Math.round(estado.f); if (i !== actual) { actual = i; cargar(i); dibujar(i); } },
  }, 0);

  // textos: la portada se va y entra cada paso en su tramo
  const pasos = [...raiz.querySelectorAll('[data-paso]')];
  tl.to(raiz.querySelector('[data-portada]'), { autoAlpha: 0, y: -24, duration: 0.08, ease: 'power2.in' }, 0.06);
  pasos.forEach(p => {
    const [a, b] = p.dataset.paso.split('-').map(Number);
    tl.fromTo(p, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.05, ease: 'power3.out' }, a);
    if (b < 1) tl.to(p, { autoAlpha: 0, y: -16, duration: 0.05, ease: 'power2.in' }, b);
  });
  tl.set({}, {}, 1); // la línea dura exactamente 1: los tramos de data-paso son fracciones del recorrido
  raiz.classList.add('is-live');
}

montar();
