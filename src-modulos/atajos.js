// ===== Atajos de teclado de Ventas (v3.0.0, fase 1) =====
// F2 buscar/escanear · F4 efectivo · F5 tarjeta · F6 transferencia · F7 cuenta corriente · F8 cobrar (pide confirmación) · Esc cancelar.
// F8 nunca registra la venta solo: abre una confirmación que se acepta con Enter o con el botón. Los atajos no actúan
// si hay otra ventana abierta (caja, vista previa) y solo cambian el medio de pago estando en Ventas.
const AT={};
AT.MAP={F4:'Efectivo',F5:'Tarjeta de débito',F6:'Transferencia',F7:'Cuenta corriente'};
AT.modal=()=>!!($('#cjov')||$('#atov')||($('#pv')&&!$('#pv').classList.contains('hide'))||$('#tour')||$('#avtu'));
AT.enVentas=()=>!$('#v').classList.contains('hide');
AT.medio=m=>{const s=$('#pay'),o=[...s.options].find(x=>x.value===m||x.textContent===m);if(!o||o.disabled||o.hidden){toast(m==='Cuenta corriente'?'Para vender en cuenta corriente elegí primero un cliente':'Medio de pago no disponible');return false}s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));toast('Medio de pago: '+o.textContent);return true};
AT.cerrar=()=>{const o=$('#atov');if(o)o.remove()};
AT.confirmar=()=>{if(!Object.keys(cart).length)return toast('No hay productos en la venta');if($('#cobrar').disabled)return;
  if(typeof CJ!=='undefined'&&!CJ.puedeVender())return $('#cobrar').click();   // muestra la apertura de caja
  const pay=$('#pay').value,t=cartTotal(),c=cl$(clId),r=parseFloat($('#rec').value)||0;
  document.body.insertAdjacentHTML('beforeend',`<div class="ov" id="atov" role="dialog" aria-modal="true"><div class="card"><h3>¿Cobrar esta venta?</h3><div class="tot">${fmt(t)}</div><p>Medio de pago: <b>${esc(pay)}</b>${c?' · Cliente: <b>'+esc(c.name)+'</b>':''}${pay==='Efectivo'&&r>0?' · Recibido '+fmt(r)+(r>=t?' · Vuelto '+fmt(r-t):''):''}</p><div style="display:flex;gap:8px"><button class="btn" id="at_ok" style="flex:1">Cobrar (Enter)</button><button class="btn sec" id="at_x">Cancelar (Esc)</button></div></div></div>`);
  $('#at_ok').onclick=()=>{AT.cerrar();$('#cobrar').click();const q=$('#q');if(q)q.focus()};$('#at_x').onclick=AT.cerrar;$('#at_ok').focus()};
document.addEventListener('keydown',e=>{
  const o=$('#atov');if(o){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();AT.cerrar()}else if(e.key==='Enter'&&e.target.id!=='at_x'){e.preventDefault();e.stopPropagation();$('#at_ok').click()}return}
  if(e.ctrlKey||e.altKey||e.metaKey||!/^F([2-8])$/.test(e.key))return;
  if(AT.modal())return;e.preventDefault();
  if(e.key==='F2'){if(!AT.enVentas()){const b=$('nav button[data-t="v"]');if(!b||b.classList.contains('hide'))return;b.click()}const q=$('#q');q.focus();q.select();return}
  if(!AT.enVentas())return;
  if(AT.MAP[e.key])return AT.medio(AT.MAP[e.key]);
  if(e.key==='F8')AT.confirmar()},true);
// Esc en el buscador de Ventas: borra la búsqueda.
$('#q').addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#q').value){$('#q').value='';drawProds()}});
// Ayuda visible en la pantalla de Ventas.
$('#cobrar').parentElement.insertAdjacentHTML('afterend','<p class="mu" id="athelp" style="margin:8px 0 0;font-size:12px">Atajos: <b>F2</b> buscar · <b>F4</b> efectivo · <b>F5</b> tarjeta · <b>F6</b> transferencia · <b>F7</b> cuenta corriente · <b>F8</b> cobrar · <b>Esc</b> cancelar</p>');
