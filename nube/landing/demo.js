// Demo de la pantalla Ventas: todo en memoria, nada se guarda ni se envía.
const PRODUCTOS = [
  { n: 'Yerba Playadito 1 kg', c: '7790387000011', p: 6900, s: 18 },
  { n: 'Coca-Cola 2,25 L', c: '7790895000997', p: 3900, s: 24 },
  { n: 'Leche La Serenísima 1 L', c: '7790742000412', p: 1650, s: 30, v: '21/11' },
  { n: 'Pan lactal Fargo', c: '7792170000123', p: 3200, s: 6, v: '18/11' },
  { n: 'Fideos Matarazzo 500 g', c: '7790070000111', p: 1900, s: 40 },
  { n: 'Aceite Natura 1,5 L', c: '7790060000222', p: 5200, s: 15 },
  { n: 'Galletitas Criollitas', c: '7790040000333', p: 1450, s: 3 },
  { n: 'Dulce de leche Ilolay 400 g', c: '7790850000444', p: 2600, s: 12 },
  { n: 'Arroz Gallo Oro 1 kg', c: '7790070000555', p: 2300, s: 22 },
  { n: 'Azúcar Ledesma 1 kg', c: '7790150000666', p: 1500, s: 35 },
  { n: 'Café La Virginia 250 g', c: '7790170000777', p: 4800, s: 9 },
  { n: 'Mate cocido Taragüí x50', c: '7790387000888', p: 2100, s: 14 },
];
const BAJO = 5;
const pesos = n => '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function montar(raiz) {
  if (!raiz) return;
  const $ = s => raiz.querySelector(s);
  const grilla = $('[data-d-grilla]'), lista = $('[data-d-lista]'), total = $('[data-d-total]');
  const buscar = $('[data-d-buscar]'), recibido = $('[data-d-recibido]'), medio = $('[data-d-medio]');
  const vuelto = $('[data-d-vuelto]'), aviso = $('[data-d-aviso]'), vendido = $('[data-d-vendido]');
  const stock = new Map(PRODUCTOS.map(p => [p.c, p.s]));
  let venta = new Map(), caja = 0;

  const suma = () => [...venta].reduce((t, [c, q]) => t + PRODUCTOS.find(p => p.c === c).p * q, 0);

  function pintarGrilla() {
    const q = buscar.value.trim().toLowerCase();
    grilla.innerHTML = '';
    for (const p of PRODUCTOS) {
      if (q && !p.n.toLowerCase().includes(q) && !p.c.includes(q)) continue;
      const d = stock.get(p.c) - (venta.get(p.c) || 0);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'd-prod'; b.disabled = d <= 0;
      const estado = d <= 0 ? '<i class="d-chip d-chip--off">Sin stock</i>' : d <= BAJO ? '<i class="d-chip d-chip--warn">Stock bajo</i>' : '<i class="d-chip d-chip--ok">Disponible</i>';
      b.innerHTML = `<b>${p.n}</b><small>Disponible: ${d}<span class="d-code"> · ${p.c}</span></small>${estado}${p.v ? `<i class="d-chip d-chip--warn">Vence ${p.v}</i>` : ''}<strong>${pesos(p.p)}</strong>`;
      b.addEventListener('click', () => agregar(p.c, 1));
      grilla.append(b);
    }
  }

  function pintarVenta() {
    lista.innerHTML = '';
    if (!venta.size) lista.innerHTML = '<li class="d-vacia">Tocá un producto o escribí su código.</li>';
    for (const [c, q] of venta) {
      const p = PRODUCTOS.find(x => x.c === c);
      const li = document.createElement('li');
      li.innerHTML = `<span><b>${p.n}</b><small>${pesos(p.p)} c/u</small></span><span class="d-qty"><button type="button" aria-label="Uno menos de ${p.n}">−</button><output>${q}</output><button type="button" aria-label="Uno más de ${p.n}">+</button></span><b class="d-sub">${pesos(p.p * q)}</b>`;
      const [menos, mas] = li.querySelectorAll('button');
      menos.addEventListener('click', () => agregar(c, -1));
      mas.addEventListener('click', () => agregar(c, 1));
      lista.append(li);
    }
    total.textContent = pesos(suma());
    calcularVuelto();
    pintarGrilla();
  }

  function agregar(c, n) {
    const q = (venta.get(c) || 0) + n;
    if (q > stock.get(c)) return decir('No queda más stock de ese producto.');
    if (q <= 0) venta.delete(c); else venta.set(c, q);
    decir('');
    pintarVenta();
  }

  function calcularVuelto() {
    const r = Number(recibido.value) || 0, t = suma();
    const efectivo = medio.value === 'Efectivo';
    recibido.disabled = !efectivo;
    vuelto.textContent = efectivo && r >= t && t > 0 ? pesos(r - t) : pesos(0);
  }

  function decir(t) { aviso.textContent = t; }

  buscar.addEventListener('input', pintarGrilla);
  buscar.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const p = PRODUCTOS.find(x => x.c === buscar.value.trim());
    if (p) { agregar(p.c, 1); buscar.value = ''; pintarGrilla(); }
  });
  // los atajos del programa, solo mientras el foco está dentro de la demo
  raiz.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); buscar.focus(); }
    if (e.key === 'F8') { e.preventDefault(); $('[data-d-cobrar]').click(); }
  });
  recibido.addEventListener('input', calcularVuelto);
  medio.addEventListener('change', calcularVuelto);
  $('[data-d-vaciar]').addEventListener('click', () => { venta = new Map(); recibido.value = ''; pintarVenta(); });
  $('[data-d-cobrar]').addEventListener('click', () => {
    const t = suma();
    if (!t) return decir('Primero agregá algún producto.');
    if (medio.value === 'Efectivo' && (Number(recibido.value) || 0) < t) return decir('Falta plata: poné cuánto te dieron.');
    for (const [c, q] of venta) stock.set(c, stock.get(c) - q);
    caja += t;
    vendido.textContent = pesos(caja);
    decir(`Venta cobrada: ${pesos(t)} en ${medio.value.toLowerCase()}. El stock ya se descontó.`);
    venta = new Map(); recibido.value = '';
    pintarVenta();
  });
  pintarVenta();
}

montar(document.querySelector('[data-demo]'));
