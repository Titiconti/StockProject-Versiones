// Validación de los datos en el proceso principal (v3.1.0 §9 y v3.0.0 §4.3/§8.2).
// Todo guardado (programa de escritorio y acceso remoto) pasa por store.put → validar(anterior, nuevo).
// La interfaz ya controla estas reglas, pero aquí se vuelven a controlar porque no se confía en lo que envía el renderer
// o un dispositivo remoto. Devuelve null si está todo bien, o un mensaje claro (sin detalles internos) si no.
'use strict';
const num = v => typeof v === 'number' && Number.isFinite(v);
const fecha = v => v === '' || v == null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const dia = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nom = p => '"' + String(p && p.name || 'producto').slice(0, 60) + '"';

// Solo se controlan los productos nuevos o modificados: un dato antiguo que no cambió no bloquea el guardado.
function productos(o, a) {
  if (!Array.isArray(o.prods)) return 'datos inválidos';
  const ids = new Set(), series = new Map(), combos = new Set(), prev = new Map(((a && a.prods) || []).map(p => [p && p.id, p]));
  for (const p of o.prods) {
    if (!p || !num(p.id) || ids.has(p.id)) return 'Hay un producto con identificador inválido o repetido';
    ids.add(p.id);
    const sinCambios = a && igual(p, prev.get(p.id));
    if (sinCambios) { for (const l of p.lots || []) if (p.control === 'serie' && l && l.qty > 0) series.set(String(l.n).trim().toUpperCase(), p.id); if (p.padre != null) combos.add(p.padre + '|' + JSON.stringify(Object.entries(p.attrs || {}).map(([x, v]) => [x.toLowerCase(), String(v).trim().toLowerCase()]).sort())); continue; }
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) return 'Hay un producto sin nombre o con un nombre demasiado largo';
    if (p.price != null && (!num(p.price) || p.price < 0)) return 'Precio inválido en ' + nom(p);
    if (p.cost != null && (!num(p.cost) || p.cost < 0)) return 'Costo inválido en ' + nom(p);
    if (p.min != null && (!num(p.min) || p.min < 0)) return 'Stock mínimo inválido en ' + nom(p);
    if (p.lots != null && !Array.isArray(p.lots)) return 'Stock inválido en ' + nom(p);
    const peso = p.unidad === 'kg', serie = p.control === 'serie';
    if (p.unidad != null && !['u', 'kg'].includes(p.unidad)) return 'Unidad de venta inválida en ' + nom(p);
    if (p.control != null && !['', 'serie', 'variantes'].includes(p.control)) return 'Método de control inválido en ' + nom(p);
    for (const l of p.lots || []) {
      if (!l || !num(l.qty) || l.qty < 0) return 'Cantidad de stock inválida en ' + nom(p);
      if (!fecha(l.exp)) return 'Fecha de vencimiento inválida en ' + nom(p);
      if (peso && !Number.isInteger(l.qty)) return 'El stock por peso se guarda en gramos enteros (' + nom(p) + ')';
      if (!peso && !serie && p.unidad === 'u' && !Number.isInteger(l.qty)) return 'Un producto por unidad no admite cantidades fraccionarias (' + nom(p) + ')';
      if (p.reqVto && l.qty > 0 && !l.exp) return nom(p) + ' exige fecha de vencimiento en cada lote';
      if (serie && l.qty > 0) {
        if (l.qty !== 1 || !String(l.n || '').trim()) return 'Cada unidad de ' + nom(p) + ' necesita su número de serie';
        const k = String(l.n).trim().toUpperCase();
        if (series.has(k)) return 'El número de serie ' + String(l.n).trim() + ' está repetido';
        series.set(k, p.id);
      }
    }
    if (p.tramos != null) {
      if (!Array.isArray(p.tramos) || p.tramos.length > 20) return 'Precios por cantidad inválidos en ' + nom(p);
      let ant = 1;
      for (const t of p.tramos) {
        if (!t || !Number.isInteger(t.desde) || t.desde <= ant) return 'Los tramos de precio de ' + nom(p) + ' deben empezar en 2 o más y no repetirse ni superponerse';
        if (!num(t.precio) || t.precio < 0) return 'Precio por cantidad inválido en ' + nom(p);
        ant = t.desde;
      }
    }
    if (p.plu != null && !/^\d{1,13}$/.test(String(p.plu))) return 'Código de balanza inválido en ' + nom(p);
    if (p.balde != null && (!num(p.balde) || p.balde <= 0 || p.balde > 100)) return 'Kg por balde inválidos en ' + nom(p);
    if (p.tipo != null && p.tipo !== 'armado') return 'Tipo de producto inválido en ' + nom(p);
    if (p.receta != null && (!p.receta || !Number.isInteger(p.receta.g) || p.receta.g < 1 || p.receta.g > 20000 || !Number.isInteger(p.receta.gustos) || p.receta.gustos < 1 || p.receta.gustos > 12)) return 'Tamaño de helado inválido en ' + nom(p);
    if (p.minimo != null && (!num(p.minimo) || p.minimo < 0)) return 'Cantidad mínima inválida en ' + nom(p);
    if (p.garantia != null && (!Number.isInteger(p.garantia) || p.garantia < 0 || p.garantia > 240)) return 'Garantía inválida en ' + nom(p);
    if (p.padre != null) {
      const k = p.padre + '|' + JSON.stringify(Object.entries(p.attrs || {}).map(([a, v]) => [a.toLowerCase(), String(v).trim().toLowerCase()]).sort());
      if (combos.has(k)) return 'Hay una variante repetida en ' + nom(p);
      combos.add(k);
    }
  }
  for (const p of o.prods) if (p.padre != null && !ids.has(p.padre)) return 'Una variante quedó sin su producto principal (' + nom(p) + ')';
  return null;
}

function ventas(o, a) {
  if (o.sales != null && !Array.isArray(o.sales)) return 'datos inválidos';
  const prev = new Map(((a && a.sales) || []).map(s => [s && s.id, s]));
  for (const s of o.sales || []) {
    if (a && igual(s, prev.get(s && s.id))) continue;
    if (!s || !num(s.id) || !num(s.total) || s.total < 0 || !Array.isArray(s.items)) return 'Hay una venta con datos inválidos';
    for (const i of s.items) if (!i || !num(i.qty) || i.qty <= 0 || !num(i.price) || i.price < 0) return 'Hay una venta con una cantidad o un precio inválido';
  }
  return null;
}

// Reglas que comparan con lo que ya estaba guardado.
function cambios(a, o) {
  if (!a) return null;
  // Un cierre de caja confirmado no se puede modificar ni borrar.
  const cj = new Map((o.cajas || []).map(c => [c.id, c]));
  for (const c of a.cajas || []) if (c.cierre && !igual(c, cj.get(c.id))) return 'Un cierre de caja confirmado no se puede modificar';
  // Una venta registrada no se puede alterar: solo anularse (o quitarse para corregirla y registrarla de nuevo).
  const sv = new Map((o.sales || []).map(s => [s.id, s])), clave = s => ({ date: s.date, items: s.items, total: s.total, pay: s.pay, cid: s.cid, caja: s.caja });
  for (const s of a.sales || []) { const n = sv.get(s.id); if (n && !igual(clave(s), clave(n))) return 'Una venta registrada no se puede modificar: anulala y registrala de nuevo'; if (n && s.void && !n.void) return 'Una venta anulada no se puede reactivar'; }
  // Ventas nuevas: no pueden salir de lotes vencidos y, si se exige, tienen que pertenecer a una caja abierta.
  const viejas = new Set((a.sales || []).map(s => s.id)), cajasAbiertas = new Set((o.cajas || []).filter(c => !c.cierre).map(c => c.id));
  const exige = !(o.cfg && o.cfg.cajaObligatoria === false);
  for (const s of o.sales || []) {
    if (viejas.has(s.id)) continue;
    const d = dia(s.date);
    for (const i of s.items) for (const l of i.lots || []) if (l.exp && d && l.exp < d) return 'No se puede vender un lote vencido (' + String(i.name || '').slice(0, 60) + ', lote ' + String(l.n || '') + ')';
    if (exige && !cajasAbiertas.has(s.caja)) return 'Para registrar una venta tiene que haber una caja abierta';
  }
  return null;
}

module.exports = function validar(anterior, nuevo) {
  if (!nuevo || typeof nuevo !== 'object' || Array.isArray(nuevo)) return 'datos inválidos';
  return productos(nuevo, anterior) || ventas(nuevo, anterior) || cambios(anterior, nuevo);
};
module.exports.dia = dia;
