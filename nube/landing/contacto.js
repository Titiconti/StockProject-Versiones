// Los botones "Pedir una demo" abren WhatsApp con un mensaje armado; sin número cargado, van al mail.
const meta = n => (document.querySelector(`meta[name="${n}"]`)?.content || '').trim();
const numero = meta('sp-whatsapp').replace(/\D/g, '');
const mail = meta('sp-mail');
const texto = 'Hola, quiero ver una demo de StockProject para mi comercio.';
const destino = numero
  ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
  : mail ? `mailto:${mail}?subject=${encodeURIComponent('Demo de StockProject')}&body=${encodeURIComponent(texto)}` : '';

if (destino) {
  for (const a of document.querySelectorAll('[data-contacto]')) {
    a.href = destino;
    if (numero) { a.target = '_blank'; a.rel = 'noopener'; }
  }
}
