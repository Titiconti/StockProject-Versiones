// ===== Interfaz simple: lo que casi nadie usa queda guardado detrás de un solo interruptor =====
// Registro de funciones (detalle en Obsidian: "Interfaz - registro de funciones"):
//  Esenciales (siempre a la vista): Ventas, Productos, Inventario, Clientes y cobros, Caja, Reportes.
//  Útiles (menú Más): Pedidos y reposición, Baja de Stock, Finanzas (movimientos, a pagar, recordatorios), Actividad, Usuarios, Configuración.
//  Ocasionales (ocultas hasta activar "Funciones avanzadas"): Analítica, conciliación bancaria, sueldos, análisis de clientes y
//    programa de puntos, datos personales (exportar/anonimizar), empresas y monedas, personalización manual del menú, nota legal de privacidad.
// No se borra ningún dato ni función: con el interruptor todo vuelve a aparecer. Se oculta con CSS para no alterar el funcionamiento.
const SI={};
SI.on=()=>!!db.cfg.avanzado;
document.head.insertAdjacentHTML('beforeend',`<style id="sicss">
body.simple nav button[data-t="f"],body.simple #fnp [data-s="b"],body.simple #fnp [data-s="s"],body.simple #cs_det,body.simple #c_x .chips,body.simple #c_x details[data-k="priv"],
body.simple #cfg_emp,body.simple #cfg_menu,body.simple #cfg_priv{display:none!important}
</style>`);
{const n=$('#cfg_si');if(n){n.insertAdjacentHTML('beforeend',`<div class="card" id="si" data-kw="funciones avanzadas simple finanzas libro mayor conciliacion sueldos puntos empresas"><h3>Funciones avanzadas</h3><div class="aj"><div class="aj-t"><label for="si_on">Mostrar las funciones avanzadas</label><p class="mu">Finanzas completa (libro mayor, gastos fijos), conciliación bancaria, sueldos, análisis de clientes y programa de puntos, empresas y monedas, y personalización manual del menú. Están ocultas para que el programa sea más simple; tus datos no se tocan.</p></div><div class="aj-c"><input type="checkbox" id="si_on"></div></div></div>`);
  $('#si_on').onchange=()=>{if(!can('configuracion','editar')){$('#si_on').checked=SI.on();return toast('Tu usuario no tiene permiso para esto')}db.cfg.avanzado=$('#si_on').checked;save();draw();toast(db.cfg.avanzado?'Funciones avanzadas a la vista':'Funciones avanzadas ocultas')}}}
SI.aplicar=()=>{document.body.classList.toggle('simple',!SI.on());const c=$('#si_on');if(c)c.checked=SI.on();
  // Si quedó abierta una pantalla que ahora está oculta, se vuelve a Ventas.
  if(!SI.on()&&!$('#f').classList.contains('hide')){const v=$('nav button[data-t="v"]');if(v)v.click()}};
MODS.push(SI.aplicar);SI.aplicar();
