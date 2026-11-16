// Permisos por colección al guardar (auditoría 16/11/2026, E2).
// La interfaz ya esconde lo que cada rol no puede hacer, pero el proceso principal no confía en lo que manda la interfaz:
// compara los datos guardados con los nuevos y, por cada colección que cambió, exige el permiso del módulo dueño.
// `tiene(modulo, accion)` dice si el usuario de la sesión tiene ese permiso. Devuelve null si está todo bien o un mensaje.
'use strict';
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lista = v => (Array.isArray(v) ? v : []);

// Altas, cambios y bajas de una lista de registros con `id`. Si algún registro no tiene id, se compara la lista entera.
function diferencias(antes, ahora, mira = x => x) {
  const A = lista(antes), B = lista(ahora);
  if ([...A, ...B].some(x => !x || x.id == null)) return { altas: [], cambios: igual(A, B) ? [] : [{}], bajas: [] };
  const viejos = new Map(A.map(x => [x.id, x])), nuevos = new Set(B.map(x => x.id));
  return {
    altas: B.filter(x => !viejos.has(x.id)),
    cambios: B.filter(x => viejos.has(x.id) && !igual(mira(viejos.get(x.id)), mira(x))),
    bajas: A.filter(x => !nuevos.has(x.id))
  };
}
const alguno = (tiene, ...p) => p.some(([m, a]) => tiene(m, a));

// Claves de configuración que la interfaz guarda sola mientras se usa (número de comprobante, avisos vistos, pestañas,
// borradores): cualquier usuario que puede escribir las puede cambiar. Todo lo demás de `cfg` es configuración del negocio.
const CFG_LIBRE = new Set(['nroComp', 'avisoDia', 'avisos', 'tourVisto', 'tipsOff', 'tipPreg', 'widgets', 'tabs', 'orden',
  'ultimaImport', 'mapeos', 'entrevistaBorrador', 'entrevista', 'encuesta', 'reposCobertura', 'reposDias']);
// Campos de un producto que hacen a su precio o costo.
const esPrecio = k => /^(price|cost|tramos|minimo)$/.test(k) || /precio|costo/i.test(k);
const FIN_LISTAS = ['mov', 'pagar', 'emp', 'banco'];

function ventas(a, o, tiene) {
  // Solo importa si una venta se anuló o se quitó; el resto de una venta registrada ya lo bloquea validar.js.
  const d = diferencias(a.sales, o.sales, s => ({ void: !!s.void }));
  if (d.altas.length && !tiene('ventas', 'crear')) return 'Tu usuario no puede registrar ventas';
  if ((d.cambios.length || d.bajas.length) && !tiene('ventas', 'eliminar')) return 'Tu usuario no puede anular ni corregir ventas ya registradas';
  return null;
}
function productos(a, o, tiene) {
  const d = diferencias(a.prods, o.prods);
  if (d.altas.length && !tiene('productos', 'crear')) return 'Tu usuario no puede crear productos';
  if (d.bajas.length && !tiene('productos', 'eliminar')) return 'Tu usuario no puede eliminar productos';
  const viejos = new Map(lista(a.prods).map(p => [p.id, p]));
  const tocaPrecio = d.cambios.some(p => { const v = viejos.get(p.id) || {}; return [...new Set([...Object.keys(v), ...Object.keys(p)])].some(k => esPrecio(k) && !igual(v[k], p[k])); });
  if (tocaPrecio && !tiene('productos', 'editar')) return 'Tu usuario no puede cambiar precios ni costos';
  return null;
}
function clientes(a, o, tiene) {
  const d = diferencias(a.clients, o.clients);
  if (d.altas.length && !alguno(tiene, ['clientes', 'crear'], ['ventas', 'crear'])) return 'Tu usuario no puede crear clientes';
  if (d.cambios.length && !tiene('clientes', 'editar')) return 'Tu usuario no puede modificar clientes';
  if (d.bajas.length && !tiene('clientes', 'eliminar')) return 'Tu usuario no puede eliminar clientes';
  return null;
}
// Pagos y cargos de cuenta corriente: se crean al cobrar o vender fiado; cambiarlos o borrarlos es tarea de clientes o finanzas.
function cuentas(a, o, tiene) {
  for (const k of ['pays', 'cargos']) {
    const d = diferencias(a[k], o[k]);
    if (d.altas.length && !alguno(tiene, ['ventas', 'crear'], ['clientes', 'crear'], ['clientes', 'editar'], ['finanzas', 'crear'])) return 'Tu usuario no puede registrar cobros ni cargos';
    if (d.cambios.length && !alguno(tiene, ['clientes', 'editar'], ['finanzas', 'editar'])) return 'Tu usuario no puede modificar cobros ni cargos';
    if (d.bajas.length && !alguno(tiene, ['clientes', 'eliminar'], ['finanzas', 'eliminar'])) return 'Tu usuario no puede borrar cobros ni cargos';
  }
  return null;
}
// Cajas: quien vende las abre, carga movimientos y las cierra. Borrar una caja es otra cosa.
function cajas(a, o, tiene) {
  const d = diferencias(a.cajas, o.cajas);
  if ((d.altas.length || d.cambios.length) && !tiene('ventas', 'crear')) return 'Tu usuario no puede usar la caja';
  if (d.bajas.length && !tiene('ventas', 'eliminar')) return 'Tu usuario no puede borrar cajas';
  return null;
}
function pedidos(a, o, tiene) {
  for (const k of ['orders', 'recepciones']) {
    const d = diferencias(a[k], o[k]);
    if ((d.altas.length || d.cambios.length) && !alguno(tiene, ['pedidos', 'crear'], ['pedidos', 'editar'])) return 'Tu usuario no puede cargar pedidos';
    if (d.bajas.length && !tiene('pedidos', 'eliminar')) return 'Tu usuario no puede borrar pedidos';
  }
  return null;
}
function finanzas(a, o, tiene) {
  const fa = a.fin || {}, fo = o.fin || {};
  for (const k of FIN_LISTAS) {
    const d = diferencias(fa[k], fo[k]);
    // Al recibir mercadería a pagar, pedidos agrega la deuda con el proveedor (lleva `rec` u `ord`).
    const deMercaderia = x => k === 'pagar' && (x.rec != null || x.ord != null);
    if (d.altas.some(x => !deMercaderia(x)) && !tiene('finanzas', 'crear')) return 'Tu usuario no puede cargar movimientos de finanzas';
    if (d.altas.some(deMercaderia) && !alguno(tiene, ['finanzas', 'crear'], ['pedidos', 'crear'], ['pedidos', 'editar'])) return 'Tu usuario no puede cargar deudas con proveedores';
    if (d.cambios.length && !tiene('finanzas', 'editar')) return 'Tu usuario no puede modificar las finanzas';
    if (d.bajas.length && !tiene('finanzas', 'eliminar')) return 'Tu usuario no puede borrar movimientos de finanzas';
  }
  const resto = f => Object.fromEntries(Object.entries(f).filter(([k]) => !FIN_LISTAS.includes(k) && k !== 'id'));   // `id` es solo el contador
  if (!igual(resto(fa), resto(fo)) && !tiene('finanzas', 'editar')) return 'Tu usuario no puede modificar las finanzas';
  return null;
}
function configuracion(a, o, tiene) {
  const ca = a.cfg || {}, co = o.cfg || {};
  const cambio = [...new Set([...Object.keys(ca), ...Object.keys(co)])].some(k => !CFG_LIBRE.has(k) && !igual(ca[k], co[k]));
  if (cambio && !tiene('configuracion', 'editar')) return 'Tu usuario no puede cambiar la configuración';
  return null;
}
function bajasMercaderia(a, o, tiene) {
  const d = diferencias(a.desv, o.desv);
  if ((d.altas.length || d.cambios.length) && !alguno(tiene, ['productos', 'editar'], ['inventario', 'editar'], ['inventario', 'crear'])) return 'Tu usuario no puede registrar bajas de mercadería';
  if (d.bajas.length && !alguno(tiene, ['productos', 'eliminar'], ['inventario', 'eliminar'])) return 'Tu usuario no puede borrar bajas de mercadería';
  // El registro de ajustes es un historial: se agrega, no se cambia ni se borra sin permiso.
  const j = diferencias(a.ajustes, o.ajustes);
  if ((j.cambios.length || j.bajas.length) && !alguno(tiene, ['inventario', 'eliminar'], ['configuracion', 'editar'])) return 'Tu usuario no puede borrar el historial de ajustes';
  return null;
}

module.exports = function autorizar(anterior, nuevo, tiene) {
  if (!anterior || !nuevo) return null;   // sin datos previos (primer guardado) no hay nada que comparar
  for (const f of [ventas, productos, clientes, cuentas, cajas, pedidos, finanzas, configuracion, bajasMercaderia]) {
    const e = f(anterior, nuevo, tiene); if (e) return e;
  }
  return null;
};
module.exports.CFG_LIBRE = CFG_LIBRE;
