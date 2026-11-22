// ===== Efectos de 21st.dev adaptados a HTML/CSS/JS puro (sin React, sin CDN, sin pedidos a otros dominios) =====
//  - Crossfade entre pantallas y "elemento compartido" (la fila se estira hasta el detalle) con View Transitions nativas de Electron 33
//    (base: @dillionverma/blur-fade y @zanwei/shared-element-transition-dialog).
//  - Magnificación tipo dock de los botones importantes: contenedor .magnifica (base: @harshjadhavconnect/magnetic-dock).
//  - Desenfoque del fondo al abrir un diálogo: único dueño de la regla de .ov/.mod (base: @darshan-rajadhyaksha/backdrop).
// A pedido del dueño NO dependen de la opción de animaciones de Windows: se apagan solo con "Animaciones suaves" del programa
// (clase html.anim). En una PC lenta se apagan solos: si un crossfade tarda de más, el resto de la sesión cambia de pantalla directo.
const SPTransicion={activa:false,lenta:false,LIMITE_MS:500};
SPTransicion.on=()=>document.documentElement.classList.contains('anim')&&typeof document.startViewTransition==='function'&&!SPTransicion.lenta;
if(typeof document.startViewTransition==='function')document.documentElement.classList.add('vt');
document.head.insertAdjacentHTML('beforeend',`<style id="vtcss">
.ov,.mod,dialog::backdrop{background:rgba(10,19,34,.55)}
html.anim .ov,html.anim .mod,html.anim dialog::backdrop{backdrop-filter:blur(5px);transition:background-color .2s ease-out,backdrop-filter .2s ease-out}
html.anim .ov>.card,html.anim .mod>.card{transition:opacity .2s ease-out,transform .2s cubic-bezier(.2,.8,.2,1)}
@starting-style{html.anim .ov,html.anim .mod,html.anim dialog[open]::backdrop{background-color:rgba(10,19,34,0);backdrop-filter:blur(0)}html.anim .ov>.card,html.anim .mod>.card{opacity:0;transform:translateY(8px) scale(.98)}}
html.anim.vt main>section:not(.hide){animation:none}
::view-transition-old(root),::view-transition-new(root){animation-duration:.18s;animation-timing-function:ease-out}
::view-transition-old(root){animation-name:vtSalir}::view-transition-new(root){animation-name:vtEntrar}
@keyframes vtSalir{to{opacity:0;filter:blur(2px)}}@keyframes vtEntrar{from{opacity:0;filter:blur(2px)}}
::view-transition-group(sp-compartido){animation-duration:.28s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
::view-transition-old(sp-compartido),::view-transition-new(sp-compartido){height:100%}
.magnifica{display:flex;gap:8px;align-items:flex-end}.magnifica>*{transition:transform .18s cubic-bezier(.2,.8,.2,1);transform-origin:center bottom}
@media(hover:hover){html.anim .magnifica>:hover{transform:scale(var(--mg,1.12))}html.anim .magnifica>:hover+*,html.anim .magnifica>:has(+:hover){transform:scale(calc(1 + (var(--mg,1.12) - 1) / 2))}}
@media print{.ov,.mod{backdrop-filter:none}}
</style>`);
// Corre cambiar() dentro de una View Transition. Si ya hay una en curso, o están apagadas, lo aplica directo (nunca demora ni traba la acción).
SPTransicion.correr=(cambiar,nombre)=>{
  if(!SPTransicion.on()||SPTransicion.activa){cambiar();return Promise.resolve()}
  const t0=performance.now();SPTransicion.activa=true;let vt;
  try{vt=document.startViewTransition(()=>{try{return cambiar()}finally{SPTransicion.activa=false}})}catch(e){SPTransicion.activa=false;cambiar();return Promise.resolve()}
  return vt.finished.catch(()=>{}).then(()=>{SPTransicion.activa=false;if(performance.now()-t0>SPTransicion.LIMITE_MS)SPTransicion.lenta=true})};
SPTransicion.cruzar=cambiar=>SPTransicion.correr(cambiar);
// origen: elemento que se "estira" hasta el destino. cambiar(): aplica el DOM nuevo y devuelve el elemento destino.
SPTransicion.compartido=(origen,cambiar)=>{
  const NOM='sp-compartido';if(!origen||!SPTransicion.on()||SPTransicion.activa){cambiar();return Promise.resolve()}
  origen.style.viewTransitionName=NOM;let destino=null;
  return SPTransicion.correr(()=>{origen.style.viewTransitionName='';destino=cambiar();if(destino)destino.style.viewTransitionName=NOM}).then(()=>{if(destino)destino.style.viewTransitionName='';origen.style.viewTransitionName=''})};
// Dónde se usan: cambio de pantalla (nav), abrir el ticket de una venta (Reportes) y editar un producto desde Inventario.
// Botones importantes con efecto dock: cobrar/vaciar (Ventas) y ayuda/avisos del encabezado.
{const c=$('#cobrar'),f=c&&c.parentNode;if(f){f.classList.add('magnifica');f.style.setProperty('--mg','1.03')}const u=$('#phu');if(u)u.classList.add('magnifica')}
