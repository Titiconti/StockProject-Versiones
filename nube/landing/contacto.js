// "Pedir una demo" abre WhatsApp con un mensaje armado (o el mail si no hay número); [data-mail] abre siempre el mail.
const meta = n => (document.querySelector(`meta[name="${n}"]`)?.content || '').trim();
const numero = meta('sp-whatsapp').replace(/\D/g, '');
const mail = meta('sp-mail');
const texto = 'Hola, quiero ver una demo de StockProject para mi comercio.';
const aMail = mail ? `mailto:${mail}?subject=${encodeURIComponent('Demo de StockProject')}&body=${encodeURIComponent(texto)}` : '';
const aWhatsapp = numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : aMail;

const poner = (sel, destino, nueva) => {
  if (!destino) return;
  for (const a of document.querySelectorAll(sel)) {
    a.href = destino;
    if (nueva) { a.target = '_blank'; a.rel = 'noopener'; }
  }
};
poner('[data-contacto]', aWhatsapp, Boolean(numero));
poner('[data-mail]', aMail, false);
