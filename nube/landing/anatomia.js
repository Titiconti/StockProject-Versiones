// Figura isométrica del mostrador de StockProject (estilo "anatomy": el objeto explica el sistema).
// Un mostrador con la PC, el lector, la balanza, el cajón y, aparte, el celular del dueño. Se repite un ciclo corto:
// el lector suma tres productos, el total sube, el cajón se abre y la "foto" viaja al celular (cada 30 s en el programa real).
// Todo es SVG dibujado acá, sin librerías ni red. Con "reducir movimiento" queda quieto en la venta ya cobrada.
(() => {
const host = document.querySelector('[data-anatomia]');
if (!host) return;
const reducir = document.documentElement.classList.contains('sp-quieto');
const C = 0.866, S = 0.5;
const P = (x, y, z) => [(x - y) * C, (x + y) * S - z];
const pt = a => a.map(p => P(...p).map(n => n.toFixed(1)).join(',')).join(' ');
const TONOS = {
  papel: { t: '#fbfcfe', l: '#e3e8f1', r: '#c7d0e0' },
  tinta: { t: '#40526e', l: '#2b3b56', r: '#1d2a41' },
  cobalto: { t: '#6f88ff', l: '#4563f7', r: '#2447f9' },
  verde: { t: '#3fcb97', l: '#0e9f6e', r: '#0a7a54' },
  ambar: { t: '#f9c764', l: '#f5a524', r: '#c9830f' },
  suelo: { t: '#e9edf5', l: '#d9dfeb', r: '#c9d1e0' },
};
const LINEA = 'stroke="#12233d" stroke-opacity=".55" stroke-width=".7" stroke-linejoin="round"';
const poly = (pts, fill, extra = '') => `<polygon points="${pt(pts)}" fill="${fill}" ${LINEA} ${extra}/>`;
function caja(x, y, z, w, d, h, tono, id = '') {
  const t = TONOS[tono];
  return `<g ${id ? `id="${id}"` : ''}>` +
    poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], t.l) +
    poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], t.r) +
    poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], t.t) + '</g>';
}
// plano de la cara frontal (+y) en y = yp: (u a lo largo de x, w hacia abajo desde ztop)
const planoY = (x0, yp, ztop) => { const [e, f] = P(x0, yp, ztop); return `matrix(${C} ${S} 0 1 ${e.toFixed(2)} ${f.toFixed(2)})`; };
// plano del piso (z fijo): u a lo largo de x, v a lo largo de y
const planoZ = (x0, y0, z) => { const [e, f] = P(x0, y0, z); return `matrix(${C} ${S} ${-C} ${S} ${e.toFixed(2)} ${f.toFixed(2)})`; };
const cara = (x0, x1, yp, z0, z1, fill, extra = '') => poly([[x0, yp, z0], [x1, yp, z0], [x1, yp, z1], [x0, yp, z1]], fill, extra);

// ---------- partes fijas ----------
let s = '';
s += caja(-26, -26, -6, 424, 182, 6, 'suelo');                                  // piso
s += `<polygon points="${pt([[4, 126, 0], [300, 126, 0], [330, 150, 0], [34, 150, 0]])}" fill="#12233d" fill-opacity=".08"/>`; // sombra del mostrador
// mostrador: cuerpo, zócalo, mesada con saliente
s += caja(0, 0, 0, 300, 120, 66, 'papel');
s += caja(6, 6, 0, 288, 118, 7, 'tinta');
s += cara(14, 98, 120, 14, 58, 'none', 'stroke-opacity=".35"') + cara(242, 286, 120, 14, 58, 'none', 'stroke-opacity=".35"');
s += `<g fill="#12233d" fill-opacity=".5"><circle cx="${P(92, 120, 36)[0]}" cy="${P(92, 120, 36)[1]}" r="1.6"/><circle cx="${P(248, 120, 36)[0]}" cy="${P(248, 120, 36)[1]}" r="1.6"/></g>`;
for (let i = 0; i < 5; i++) s += `<polygon points="${pt([[300, 22 + i * 18, 30], [300, 30 + i * 18, 30], [300, 30 + i * 18, 52], [300, 22 + i * 18, 52]])}" fill="#12233d" fill-opacity=".14" ${LINEA} stroke-opacity=".3"/>`; // rejilla del lateral
s += caja(-4, -4, 66, 308, 128, 5, 'papel');
s += `<polygon points="${pt([[110, 120, 30], [232, 120, 30], [232, 120, 64], [110, 120, 64]])}" fill="#16253f" ${LINEA}/>`; // hueco del cajón
// PC: base, cuello, pantalla, teclado
s += caja(40, 18, 71, 36, 30, 3, 'tinta') + caja(54, 28, 74, 8, 8, 26, 'tinta') + caja(8, 30, 100, 100, 7, 64, 'tinta');
s += `<g transform="${planoY(8, 37.01, 164)}"><rect x="3" y="3" width="94" height="58" rx="1.5" fill="#f4f6fa"/><rect x="3" y="3" width="94" height="9" fill="#12233d"/>` +
  `<text x="7" y="9.6" font-size="5.2" fill="#f4f6fa" font-family="Chivo,sans-serif">Venta actual</text>` +
  `<g id="a-filas" font-size="4.4" font-family="Chivo,sans-serif" fill="#12233d"><g id="a-f1"><text x="7" y="20">Yerba 1 kg</text><text x="93" y="20" text-anchor="end">$ 6.900</text></g><g id="a-f2"><text x="7" y="27">Leche 1 L x2</text><text x="93" y="27" text-anchor="end">$ 3.300</text></g><g id="a-f3"><text x="7" y="34">Aceite 1,5 L</text><text x="93" y="34" text-anchor="end">$ 5.200</text></g></g>` +
  `<line x1="7" y1="38" x2="93" y2="38" stroke="#12233d" stroke-opacity=".25" stroke-width=".5"/><text id="a-total" x="7" y="50" font-size="11" font-weight="700" fill="#12233d" font-family="Chivo,sans-serif">$ 15.400</text>` +
  `<rect x="66" y="45" width="27" height="10" rx="2" fill="#0e9f6e"/><text x="79.5" y="52" font-size="5" fill="#fff" text-anchor="middle" font-family="Chivo,sans-serif">Cobrar</text></g>`;
s += caja(22, 52, 71, 70, 24, 4, 'papel');
for (let r = 0; r < 3; r++) s += `<line x1="${P(26, 58 + r * 6, 75)[0]}" y1="${P(26, 58 + r * 6, 75)[1]}" x2="${P(88, 58 + r * 6, 75)[0]}" y2="${P(88, 58 + r * 6, 75)[1]}" stroke="#12233d" stroke-opacity=".3" stroke-width="1.6" stroke-dasharray="2.2 1.2"/>`;
// lector de códigos
s += caja(130, 40, 71, 34, 28, 5, 'tinta') + caja(140, 48, 76, 14, 14, 12, 'tinta');
s += cara(142, 152, 62.01, 80, 86, '#ff5a4d', 'fill-opacity=".85" stroke-opacity=".2"');
// productos
s += caja(150, 84, 71, 26, 20, 36, 'papel');
s += `<polygon points="${pt([[150, 104.01, 82], [176, 104.01, 82], [176, 104.01, 92], [150, 104.01, 92]])}" fill="#2447f9"/>`;
s += caja(186, 86, 71, 20, 18, 30, 'cobalto') + caja(214, 82, 71, 22, 16, 16, 'verde');
// balanza
s += caja(246, 12, 71, 48, 44, 6, 'tinta') + caja(262, 13, 77, 16, 6, 32, 'tinta');
s += `<g transform="${planoY(262, 19.01, 109)}"><rect x="2" y="3" width="12" height="9" rx="1" fill="#0b1626"/><text x="13" y="10" text-anchor="end" font-size="4.4" font-family="Chivo Mono,monospace" fill="#3fcb97">0,35</text></g>`;
s += caja(250, 22, 77, 40, 32, 3, 'papel') + caja(262, 32, 80, 14, 12, 10, 'verde');
// celular del dueño
s += caja(310, 4, 0, 50, 30, 5, 'tinta') + caja(316, 12, 5, 40, 8, 100, 'tinta');
s += `<g transform="${planoY(316, 20.01, 102)}"><rect x="3" y="4" width="34" height="90" rx="2" fill="#f4f6fa"/><text x="7" y="13" font-size="5" fill="#59667b" font-family="Chivo,sans-serif">Vendido hoy</text><text id="a-cel" x="6" y="24" font-size="6.6" font-weight="700" fill="#12233d" font-family="Chivo,sans-serif">$ 15.400</text>` +
  `<g id="a-barras" fill="#2447f9"><rect x="7" y="75" width="5" height="8"/><rect x="14" y="68" width="5" height="15"/><rect x="21" y="72" width="5" height="11"/><rect id="a-b4" x="28" y="62" width="5" height="21" fill="#0e9f6e"/></g><line x1="7" y1="83.5" x2="33" y2="83.5" stroke="#12233d" stroke-opacity=".3" stroke-width=".5"/></g>`;
// guía punteada de la foto que viaja al celular
const A = [108, 34, 150], B = [220, 18, 236], D = [336, 16, 100];
const bez = t => [0, 1, 2].map(i => (1 - t) * (1 - t) * A[i] + 2 * (1 - t) * t * B[i] + t * t * D[i]);
let guia = ''; for (let i = 0; i <= 24; i++) guia += P(...bez(i / 24)).map(n => n.toFixed(1)).join(i ? ' ' : ',').replace(/^/, i ? 'L' : 'M').replace(' ', ',');
const pathD = Array.from({ length: 25 }, (_, i) => (i ? 'L' : 'M') + P(...bez(i / 24)).map(n => n.toFixed(1)).join(' ')).join('');
s += `<path d="${pathD}" fill="none" stroke="#2447f9" stroke-opacity=".5" stroke-width="1.2" stroke-dasharray="1.5 4" stroke-linecap="round"/>`;

// ---------- partes que se mueven ----------
const dinamico = `<g id="a-laser"></g><g id="a-cajon"></g><g id="a-foto"><circle id="a-halo" r="7" fill="#2447f9" fill-opacity=".18"/><circle id="a-dot" r="3.2" fill="#2447f9"/></g>`;
host.innerHTML = `<svg viewBox="-175 -165 570 445" width="100%" height="100%" aria-hidden="true" focusable="false">${s}${dinamico}</svg>`;
const $ = id => host.querySelector('#' + id);
const laser = $('a-laser'), cajon = $('a-cajon'), dot = $('a-dot'), halo = $('a-halo'), foto = $('a-foto'), total = $('a-total'), cel = $('a-cel'), b4 = $('a-b4');
const filas = [$('a-f1'), $('a-f2'), $('a-f3')];
const TOTALES = ['$ 0', '$ 6.900', '$ 10.200', '$ 15.400'];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const suave = x => (x = clamp(x), x * x * (3 - 2 * x));

function dibujarCajon(abre) {
  const sd = 36 * abre, y0 = 120, yf = y0 + sd, zt = 52;
  let g = '';
  if (sd > 1) {
    g += caja(112, y0, 50, 2, sd, 7, 'papel');                                              // pared izquierda
    g += `<polygon points="${pt([[112, y0, zt], [228, y0, zt], [228, yf, zt], [112, yf, zt]])}" fill="#dfe5ef" ${LINEA}/>`;
    for (let i = 1; i < 4; i++) g += `<line x1="${P(112 + i * 29, y0, zt)[0].toFixed(1)}" y1="${P(112 + i * 29, y0, zt)[1].toFixed(1)}" x2="${P(112 + i * 29, yf, zt)[0].toFixed(1)}" y2="${P(112 + i * 29, yf, zt)[1].toFixed(1)}" stroke="#12233d" stroke-opacity=".35" stroke-width=".7"/>`;
    const largo = Math.max(0, sd - 10);
    if (largo > 4) {
      g += `<g transform="${planoZ(112, y0, zt)}">`;
      [[6, 'verde'], [35, 'verde'], [64, 'ambar']].forEach(([u, t]) => { g += `<rect x="${u}" y="5" width="23" height="${largo}" fill="${TONOS[t].t}" stroke="#12233d" stroke-opacity=".4" stroke-width=".5"/>`; });
      g += `<circle cx="102" cy="${Math.min(16, 5 + largo / 2)}" r="4.5" fill="#f5a524" stroke="#12233d" stroke-opacity=".4" stroke-width=".5"/><circle cx="110" cy="${Math.min(26, 8 + largo / 2)}" r="4.5" fill="#c7d0e0" stroke="#12233d" stroke-opacity=".4" stroke-width=".5"/></g>`;
    }
    g += caja(226, y0, 50, 2, sd, 7, 'papel');                                             // pared derecha
  }
  g += poly([[112, yf, 30], [228, yf, 30], [228, yf, 54], [112, yf, 54]], TONOS.papel.l);     // frente del cajón
  g += poly([[112, yf, 54], [228, yf, 54], [228, yf + 3, 54], [112, yf + 3, 54]], TONOS.papel.t);
  g += `<polygon points="${pt([[156, yf + .01, 44], [184, yf + .01, 44], [184, yf + .01, 48], [156, yf + .01, 48]])}" fill="#12233d" fill-opacity=".45"/>`;
  cajon.innerHTML = g;
}
function dibujarLaser(barrido, activo) {
  if (!activo) { laser.innerHTML = ''; return; }
  const x = 140 + 12 * barrido;
  laser.innerHTML = `<polygon points="${pt([[x + 4, 62, 83], [x + 4, 82, 83], [x + 18, 90, 83]])}" fill="#ff5a4d" fill-opacity=".22"/>` +
    `<line x1="${P(x + 4, 62, 83)[0]}" y1="${P(x + 4, 62, 83)[1]}" x2="${P(x + 12, 88, 83)[0]}" y2="${P(x + 12, 88, 83)[1]}" stroke="#ff5a4d" stroke-width="1.4" stroke-linecap="round"/>`;
}
function dibujar(t) {
  // 0-3,2 el lector suma tres productos; 3,4-4,8 se abre el cajón; 5,2-7,4 viaja la foto al celular; 7,6-8,6 cierra
  const n = t < 1 ? 0 : t < 1.9 ? 1 : t < 2.8 ? 2 : 3;
  total.textContent = TOTALES[n];
  filas.forEach((f, i) => { f.style.opacity = i < n ? 1 : 0; });
  const pulso = [1, 1.9, 2.8].some(a => t >= a - 0.35 && t < a + 0.1);
  dibujarLaser(((t * 3) % 1), pulso);
  const abre = suave((t - 3.4) / 1.2) - suave((t - 7.6) / 1.0);
  dibujarCajon(clamp(abre));
  const v = clamp((t - 5.2) / 2.2);
  foto.style.opacity = v > 0 && v < 1 ? 1 : 0;
  if (v > 0 && v < 1) { const [x, y] = P(...bez(suave(v))); dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); halo.setAttribute('cx', x.toFixed(1)); halo.setAttribute('cy', y.toFixed(1)); }
  const llego = suave((t - 7.2) / 0.5);
  cel.textContent = t > 7.2 ? '$ 15.400' : '$ 0';
  cel.style.opacity = t > 7.2 ? llego : 0.35;
  b4.setAttribute('height', String(5 + 16 * llego)); b4.setAttribute('y', String(83 - (5 + 16 * llego)));
}

if (reducir) { dibujar(8.9); } else {
  let t0 = performance.now(), visible = true, raf = 0;
  const ciclo = 9.6;
  const paso = ahora => { dibujar(((ahora - t0) / 1000) % ciclo); raf = visible ? requestAnimationFrame(paso) : 0; };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) { t0 = performance.now(); raf = requestAnimationFrame(paso); } }).observe(host);
  raf = requestAnimationFrame(paso);
}
})();
