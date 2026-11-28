// Permisos por colección al guardar (auditoría 16/11/2026, E2).
// La interfaz ya esconde lo que cada rol no puede hacer, pero el proceso principal no confía en lo que manda la interfaz:
// compara los datos guardados con los nuevos y, por cada colección que cambió, exige el permiso del módulo dueño.
// `tiene(modulo, accion)` dice si el usuario de la sesión tiene ese permiso. Devuelve null si está todo bien o un mensaje.
'use strict';
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const { correccionCaja } = require('./validar');
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
// Cajas: quien vende las abre, carga movimientos y las cierra. Borrar una caja es otra cosa; una caja cerrada no cambia más.
function cajas(a, o, tiene) {
  const d = diferencias(a.cajas, o.cajas);
  const cerrada = c => (lista(a.cajas).find(x => x.id === c.id) || {}).cierre;
  if (d.bajas.some(cerrada)) return 'Un cierre de caja confirmado no se puede modificar';
  const tocadas = d.cambios.filter(cerrada);
  if (tocadas.length) {   // un cierre solo cambia con una corrección registrada (con historial) y con el permiso de corregir
    if (!tocadas.every(c => correccionCaja(lista(a.cajas).find(x => x.id === c.id), lista(o.cajas).find(x => x.id === c.id)))) return 'Un cierre de caja confirmado no se puede modificar';
    if (!tiene('caja', 'editar')) return 'Tu usuario no puede corregir cierres de caja';
  }
  // Retiros e ingresos extraordinarios nuevos piden caja.crear (gastos y devoluciones siguen con ventas).
  const nuevosRI = lista(o.cajas).some(c => { const v = lista(a.cajas).find(x => x.id === c.id), mv = lista(c.movs).slice(v ? lista(v.movs).length : 0); return mv.some(m => m.tipo === 'retiro' || m.tipo === 'ingreso'); });
  if (nuevosRI && !tiene('caja', 'crear')) return 'Tu usuario no puede registrar retiros ni ingresos de caja';
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
const cambiadas = (x, y) => [...new Set([...Object.keys(x || {}), ...Object.keys(y || {})])].filter(k => !igual((x || {})[k], (y || {})[k]));
function configuracion(a, o, tiene) {
  const c = cambiadas(a.cfg, o.cfg).filter(k => !CFG_LIBRE.has(k));
  // El programa de puntos (fidel) también lo maneja quien edita clientes (así lo permite la pantalla de Clientes).
  if (c.includes('fidel') && !alguno(tiene, ['configuracion', 'editar'], ['clientes', 'editar'])) return 'Tu usuario no puede cambiar el programa de puntos';
  if (c.some(k => k !== 'fidel') && !tiene('configuracion', 'editar')) return 'Tu usuario no puede cambiar la configuración';
  // Datos del negocio (nombre, ticket): configuración. El ancho de impresión (`w`) se elige al imprimir.
  if (cambiadas(a.shop, o.shop).some(k => k !== 'w') && !tiene('configuracion', 'editar')) return 'Tu usuario no puede cambiar los datos del negocio';
  if (!igual(a.rules || {}, o.rules || {}) && !alguno(tiene, ['configuracion', 'editar'], ['clientes', 'editar'])) return 'Tu usuario no puede cambiar los recordatorios';
  return null;
}
// Planes de pago en cuotas e interacciones con clientes: módulo clientes.
function planesClientes(a, o, tiene) {
  const p = diferencias(a.planes, o.planes);
  if (p.altas.length && !alguno(tiene, ['clientes', 'crear'], ['clientes', 'editar'], ['ventas', 'crear'])) return 'Tu usuario no puede crear planes de pago';
  if (p.cambios.length && !alguno(tiene, ['clientes', 'editar'], ['ventas', 'crear'])) return 'Tu usuario no puede modificar planes de pago';
  if (p.bajas.length && !tiene('clientes', 'eliminar')) return 'Tu usuario no puede borrar planes de pago';
  const i = diferencias(a.inter, o.inter);
  if ((i.altas.length || i.cambios.length || i.bajas.length) && !alguno(tiene, ['clientes', 'crear'], ['clientes', 'editar'])) return 'Tu usuario no puede modificar el historial de clientes';
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
  for (const f of [ventas, productos, clientes, cuentas, cajas, pedidos, finanzas, configuracion, planesClientes, bajasMercaderia]) {
    const e = f(anterior, nuevo, tiene); if (e) return e;
  }
  return null;
};
module.exports.CFG_LIBRE = CFG_LIBRE;
