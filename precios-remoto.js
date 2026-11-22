// Cambios de precio pedidos por el dueño desde el celular. Corre en el PROCESO PRINCIPAL (no en la ventana): la autoridad del cambio es
// la sesión del dueño en el panel (el servidor ya la verificó y nube.js trae el pedido con el token de esta instalación), no el
// usuario que tenga la sesión abierta en la PC. La ventana no decide nada ni puede crear estos pedidos: solo recibe el aviso.
// Sin dependencias de Electron: se prueba con Node solo.
'use strict';
const PRECIO_MAX = 1e7;
const plata = n => '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// leer(): texto JSON de los datos · guardar(texto, revBase): store.put (rechaza si otro cambio se coló) · rev(): versión actual.
// aplicar(lista): [{id, pid, precio, visto}] -> null si no se pudo guardar (quedan pendientes) o
//   { resultados:[{id, estado:'aplicado'|'rechazado', motivo}], cambios:[{pid, nombre, antes, precio}], rev, ajustes, ajid, preciosCel }
module.exports = function crearAplicador({ leer, guardar, rev, ahora = () => Date.now() }) {
  return function aplicar(lista) {
    if (!Array.isArray(lista)) return null;
    let db; try { db = JSON.parse(leer() || 'null'); } catch (e) { return null; }
    if (!db || !Array.isArray(db.prods)) return null;
    db.preciosCel = Array.isArray(db.preciosCel) ? db.preciosCel : []; db.ajustes = Array.isArray(db.ajustes) ? db.ajustes : []; db.ajid = db.ajid || 1;
    const resultados = [], cambios = []; let hubo = false;
    for (const c of lista) {
      if (!c || typeof c.id !== 'string') continue;
      const ya = db.preciosCel.find(x => x.id === c.id);   // idempotencia: lo ya resuelto no se vuelve a aplicar
      if (ya) { resultados.push({ id: c.id, estado: ya.estado, motivo: ya.motivo }); continue; }
      const p = db.prods.find(x => x.id === c.pid); let r;
      if (!p) r = { estado: 'rechazado', motivo: 'El producto ya no existe en el local' };
      else if (typeof c.precio !== 'number' || !Number.isFinite(c.precio) || !(c.precio > 0) || c.precio > PRECIO_MAX || Math.round(c.precio * 100) / 100 !== c.precio) r = { estado: 'rechazado', motivo: 'Precio inválido' };
      else if (typeof c.visto !== 'number' || Math.abs((p.price || 0) - c.visto) > 0.004) r = { estado: 'rechazado', motivo: 'El precio cambió en el local, revisalo' };   // no se pisa lo que cambió acá
      else {
        const antes = p.price; p.price = c.precio;
        db.ajustes.push({ id: db.ajid++, date: new Date(ahora()).toISOString(), user: 'dueño desde el celular', tipo: 'producto.precio', pid: p.id, txt: `${p.name}: precio ${plata(antes)} → ${plata(c.precio)} (dueño desde el celular)` });
        cambios.push({ pid: p.id, nombre: p.name, antes, precio: c.precio }); r = { estado: 'aplicado', motivo: '' };
      }
      db.preciosCel.push({ id: c.id, pid: c.pid, estado: r.estado, motivo: r.motivo, date: new Date(ahora()).toISOString() }); resultados.push({ id: c.id, ...r }); hubo = true;
    }
    if (!hubo) return { resultados, cambios: [] };
    if (db.preciosCel.length > 300) db.preciosCel.splice(0, db.preciosCel.length - 300);
    if (db.ajustes.length > 5000) db.ajustes.splice(0, db.ajustes.length - 5000);
    const g = guardar(JSON.stringify(db), rev());
    if (!g || !g.ok) return null;   // otro cambio se coló o los datos no se pueden escribir: quedan pendientes y se reintenta
    return { resultados, cambios, rev: g.rev, ajustes: db.ajustes, ajid: db.ajid, preciosCel: db.preciosCel };
  };
};
