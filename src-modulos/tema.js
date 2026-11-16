// ===== Identidad visual de StockProject: logo, tema, barra lateral, encabezado de pantalla y animaciones =====
// Paleta: tinta (azul marino, cromo) · papel (fondo) · cobalto (acciones) · verde caja (dinero) · ámbar (avisos).
// Las animaciones se controlan con la preferencia "Animaciones suaves" del programa (clase html.anim, en la campana).
// A pedido del dueño no dependen de la opción de Windows: muchas PCs de mostrador la traen desactivada.
const TM={};
// Símbolo "la caja sellada": la cinta cruza la tapa y dobla hacia el frente. Sobre fondos claros lleva su recuadro de tinta.
TM.LOGO=(n=28,recuadro=false)=>recuadro?`<svg viewBox="0 0 64 64" width="${n}" height="${n}" aria-hidden="true" class="lg"><rect width="64" height="64" rx="15" fill="#12233D"/><path class="lg-t" d="M32 13 49 22.75 32 32.5 15 22.75Z" fill="#0E9F6E"/><path class="lg-l" d="M15 22.75 32 32.5V52L15 42.25Z" fill="#2447F9"/><path class="lg-r" d="M49 22.75 32 32.5V52L49 42.25Z" fill="#6E8BFF"/><path class="lg-c" d="M23.5 17.9 40.5 27.6V36.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linejoin="round" pathLength="1"/></svg>`
  :`<svg viewBox="0 0 64 64" width="${n}" height="${n}" aria-hidden="true" class="lg"><path class="lg-l" d="M12 21.5 32 33V56L12 44.5Z" fill="#2447F9"/><path class="lg-r" d="M52 21.5 32 33V56L52 44.5Z" fill="#6E8BFF"/><path class="lg-t" d="M32 10 52 21.5 32 33 12 21.5Z" fill="#0E9F6E"/><path class="lg-c" d="M22 15.75 42 27.25V38" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" pathLength="1"/></svg>`;
TM.MARCA=n=>`${TM.LOGO(n)}<span class="wm"><b>Stock</b>Project</span>`;
// Iconos del menú (trazo, 24×24) por pantalla.
TM.IC={h:'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',v:'M4 5h2l2.2 10h9.6L20 8H7.2M9 19.5h.01M17 19.5h.01',p:'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',i:'M12 3 21 8v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8',
  c:'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.9M15.5 3.2a3.5 3.5 0 0 1 0 6.6',r:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  o:'M2 6h11v10H2zM13 9h4l4 4v3h-8M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',f:'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2M16.5 14h.01',
  a:'M3 17l6-6 4 4 8-8M15 7h6v6',e:'M12 3 21 8v8l-9 5-9-5V8zM8.5 12.5 12 16l3.5-3.5M12 16V9',g:'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 12l2-1.2-2-3.5-2.3.7-1.7-1L14.5 4.5h-5L9 7l-1.7 1L5 7.3l-2 3.5L5 12l-2 1.2 2 3.5 2.3-.7 1.7 1 .5 2.5h5l.5-2.5 1.7-1 2.3.7 2-3.5z',
  w:'M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2',
  u:'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4',k:'M3 13h18v7H3zM5 13l2-8h10l2 8M10 17h4',z:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2'};
TM.css=`
@font-face{font-family:"SP Marca";src:url(data:font/woff2;base64,${typeof SP_FUENTE!=='undefined'?SP_FUENTE:''}) format("woff2");font-weight:300 700;font-display:swap}
:root{--bg:#F4F6FA;--card:#fff;--tx:#14213A;--mu:#5F6B7E;--bd:#E2E7F0;--ac:#2447F9;--act:#fff;--ok:#0E9F6E;--bad:#D92D20;--warn:#B45309;--ink:#12233D;--ink2:#1B3157;--sh:0 1px 2px rgba(18,35,61,.05),0 10px 28px -14px rgba(18,35,61,.18);--r:14px;--ease:cubic-bezier(.2,.8,.2,1)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0C1626;--card:#14223A;--tx:#E8EDF7;--mu:#9AA8BF;--bd:#24344F;--ac:#6E8BFF;--act:#0C1626;--ok:#2BC48E;--bad:#FF6B5E;--warn:#F5A524;--ink:#0A1322;--ink2:#14223A;--sh:0 1px 2px rgba(0,0,0,.3),0 12px 30px -16px rgba(0,0,0,.6)}}
:root[data-theme="dark"]{--bg:#0C1626;--card:#14223A;--tx:#E8EDF7;--mu:#9AA8BF;--bd:#24344F;--ac:#6E8BFF;--act:#0C1626;--ok:#2BC48E;--bad:#FF6B5E;--warn:#F5A524;--ink:#0A1322;--ink2:#14223A;--sh:0 1px 2px rgba(0,0,0,.3),0 12px 30px -16px rgba(0,0,0,.6)}
body{font:15px/1.45 "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
h3{font:600 16px/1.3 "SP Marca","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.01em}
/* ---- cromo: barra superior (pantallas chicas) o lateral (pantallas anchas) ---- */
header{background:var(--ink);border:0;color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.06) inset}
.logo{display:inline-flex;align-items:center;gap:10px;color:#fff;font-size:17px;font-weight:400;letter-spacing:-.01em}.wm{font-family:"SP Marca","Segoe UI",sans-serif;letter-spacing:-.03em}.wm b{font-weight:700}
nav button,#masb{color:rgba(255,255,255,.74);font-weight:500;border-radius:10px;display:inline-flex;align-items:center;gap:10px;transition:background .15s,color .15s}
nav button::before{content:"";flex:none;width:18px;height:18px;background:currentColor;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat;opacity:.9}
nav button:hover,#masb:hover{background:rgba(255,255,255,.08);color:#fff}nav button.on,#masb.on{background:rgba(255,255,255,.13);color:#fff;box-shadow:inset 3px 0 0 var(--ok)}
#masmenu{background:var(--ink2);border-color:rgba(255,255,255,.12)}
#ses .mu{color:rgba(255,255,255,.7)}header .btn.sec{background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)}
main{max-width:1320px;padding:18px 20px 40px}
#ph{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:2px 0 16px}#pht{margin:0;font:700 26px/1.15 "SP Marca","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.025em}#phd{font-size:13px}#phu{display:flex;gap:8px;align-items:center}
@media(max-width:1099px){nav button::before{display:none}nav button,#masb{padding:7px 11px;font-size:14px}.bar{gap:8px;padding:8px 12px}#ph{margin-bottom:12px}#pht{font-size:22px}.tot{font-size:38px}}
@media(min-width:1100px){
 header{position:fixed;inset:0 auto 0 0;width:236px;z-index:8}.bar{flex-direction:column;align-items:stretch;flex-wrap:nowrap;height:100%;padding:20px 12px 14px;gap:18px;max-width:none}
 .logo{padding:0 8px}nav{flex-direction:column;align-items:stretch;flex-wrap:nowrap;gap:2px;overflow:auto;flex:1}nav button{width:100%;text-align:left;padding:10px 12px}
 .mas{display:flex;flex-direction:column;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}#masb{display:none}
 #masmenu,#masmenu.hide{display:flex;position:static;background:none;border:0;box-shadow:none;padding:0;min-width:0}
 #ses{margin:0!important;padding:10px 8px 0;border-top:1px solid rgba(255,255,255,.1);flex-wrap:wrap;font-size:13px}
 main{margin:0 0 0 236px;padding:26px 34px 48px}}
/* ---- superficies ---- */
.card{border-radius:var(--r);border-color:var(--bd);box-shadow:var(--sh);padding:18px}.kpis .card,.herr .card,.ov .card .card{box-shadow:none}
.kpis .card{border-top:3px solid var(--bd);padding:14px 16px}.kpis .card:first-child{border-top-color:var(--ok)}.kpis .big,.kpi div{font:700 26px/1.2 "SP Marca","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.025em}
input,select,textarea{background:var(--card);border-color:var(--bd);border-radius:10px;transition:border-color .15s,box-shadow .15s}input:focus,select:focus,textarea:focus{outline:0;border-color:var(--ac);box-shadow:0 0 0 3px color-mix(in srgb,var(--ac) 22%,transparent)}
label{font-size:12.5px;font-weight:500}
.btn{border-radius:10px;font-weight:600;transition:transform .08s,filter .15s,box-shadow .15s}.btn:hover:not(:disabled){filter:brightness(1.07)}.btn:focus-visible,.p:focus-visible,nav button:focus-visible{outline:0;box-shadow:0 0 0 3px color-mix(in srgb,var(--ac) 40%,transparent)}
.btn.sec{background:var(--card);border-color:var(--bd)}.btn.sec:hover:not(:disabled){border-color:var(--ac);filter:none}
#cobrar{background:var(--ok);color:#fff;font-size:18px!important;padding:14px 16px;box-shadow:0 8px 20px -10px var(--ok)}
.tot{font:700 46px/1.05 "SP Marca","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.035em;margin:2px 0 10px}.tot.bump{animation:tmBump .28s var(--ease)}
.p{background:var(--card);border-radius:12px;padding:12px;transition:transform .12s var(--ease),border-color .12s,box-shadow .12s}.p:hover:not(:disabled){transform:translateY(-2px);box-shadow:var(--sh)}.p b{font-weight:600;line-height:1.25}.p .pt{display:flex;flex-wrap:wrap;gap:4px}.p .pt i{white-space:nowrap}#ses:empty{display:none}.p em{font-size:16px;letter-spacing:-.01em}
th{font-weight:600;font-size:12.5px}tbody tr{transition:background .12s}tbody tr:hover{background:color-mix(in srgb,var(--ac) 5%,transparent)}
.tag{font-weight:600}.pills button{font-weight:500}.pills button.on{color:var(--act)}
.row{padding:10px 0}.tip{border-radius:10px}
.ov,.mod{background:rgba(10,19,34,.55);backdrop-filter:blur(5px)}#enc .card{max-width:760px}.ov .card{border-radius:18px;padding:22px;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)}
#toast{background:var(--ink);color:#fff;border-radius:12px;padding:12px 18px;font-weight:500;box-shadow:0 14px 34px -12px rgba(0,0,0,.5);transform:translate(-50%,12px);transition:opacity .2s,transform .25s var(--ease);max-width:min(560px,92vw)}#toast.show{transform:translate(-50%,0)}
/* ---- animaciones ---- */
html.anim main>section:not(.hide){animation:tmIn .26s var(--ease)}html.anim main>section:not(.hide)>.card,html.anim main>section:not(.hide)>.grid>.card,html.anim main>section:not(.hide) .kpis>.card{animation:tmUp .34s var(--ease) backwards}
html.anim main>section:not(.hide)>:nth-child(2),html.anim main>section:not(.hide) .kpis>:nth-child(2),html.anim main>section:not(.hide)>.grid>:nth-child(2){animation-delay:.05s}html.anim main>section:not(.hide)>:nth-child(3),html.anim main>section:not(.hide) .kpis>:nth-child(3){animation-delay:.1s}html.anim main>section:not(.hide)>:nth-child(4),html.anim main>section:not(.hide) .kpis>:nth-child(4){animation-delay:.15s}html.anim main>section:not(.hide)>:nth-child(n+5),html.anim main>section:not(.hide) .kpis>:nth-child(n+5){animation-delay:.2s}
html.anim #pht{animation:tmIn .3s var(--ease)}html.anim .ov>.card{animation:tmPop .22s var(--ease)}html.anim #cart .row{animation:tmIn .2s var(--ease)}
@keyframes tmIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes tmUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes tmPop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}@keyframes tmBump{0%{transform:scale(1)}40%{transform:scale(1.045)}100%{transform:scale(1)}}
/* ---- inicio: la caja se arma, se tapa, la cinta la sella y corre la cinta de carga ---- */
#splash{position:fixed;inset:0;z-index:200;background:var(--ink);background-image:radial-gradient(60% 50% at 50% 42%,#1D3B6E 0,transparent 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;color:#fff;transition:opacity .38s ease,visibility .38s}#splash.fin{opacity:0;visibility:hidden}
#splash .lg{width:150px;height:150px;filter:drop-shadow(0 18px 30px rgba(0,0,0,.45))}
#splash .lg-l{animation:spL .42s var(--ease) both}#splash .lg-r{animation:spR .42s var(--ease) .1s both}#splash .lg-t{animation:spT .42s var(--ease) .26s both}#splash .lg-c{stroke-dasharray:1;animation:spC .36s ease-out .6s both}
#splash .wm{font-size:40px;line-height:1;animation:tmIn .4s var(--ease) .62s both}#splash .cinta{width:200px;animation:tmIn .3s ease .7s both}
@keyframes spL{from{opacity:0;transform:translate(-9px,7px)}to{opacity:1;transform:none}}@keyframes spR{from{opacity:0;transform:translate(9px,7px)}to{opacity:1;transform:none}}@keyframes spT{from{opacity:0;transform:translateY(-11px)}to{opacity:1;transform:none}}@keyframes spC{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
/* ---- cinta de carga: la espera con el ángulo de la cinta del símbolo ---- */
.cinta{display:inline-block;height:6px;width:64px;border-radius:3px;background-color:color-mix(in srgb,currentColor 18%,transparent);background-image:repeating-linear-gradient(120deg,currentColor 0 10px,transparent 10px 28px);background-size:32px 100%;animation:tmCinta .9s linear infinite;vertical-align:middle}
@keyframes tmCinta{from{background-position:0 0}to{background-position:32px 0}}
#guard{display:inline-flex;align-items:center;gap:8px;color:var(--ok)}#guard.hide{display:none}
/* ---- venta sellada: la cinta cruza y cierra con el visto verde ---- */
#sello{position:fixed;inset:0;z-index:150;pointer-events:none;display:flex;align-items:center;justify-content:center;overflow:hidden}
#sello .sc{position:absolute;left:-20%;width:140%;height:54px;background:#fff;box-shadow:0 10px 30px rgba(10,19,34,.35);transform:translateX(-130%) rotate(-30deg);animation:tmSelloC .95s cubic-bezier(.3,.7,.2,1) both}
#sello .so{width:112px;height:112px;border-radius:50%;background:var(--ok);display:flex;align-items:center;justify-content:center;box-shadow:0 18px 40px rgba(10,19,34,.4);animation:tmSelloO .95s var(--ease) both}
#sello .so path{stroke-dasharray:1;animation:tmSelloV .95s ease-out both}
@keyframes tmSelloC{0%{transform:translateX(-130%) rotate(-30deg)}38%,62%{transform:translateX(0) rotate(-30deg)}100%{transform:translateX(130%) rotate(-30deg)}}
@keyframes tmSelloO{0%,30%{opacity:0;transform:scale(.5)}46%,78%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.06)}}
@keyframes tmSelloV{0%,40%{stroke-dashoffset:1}62%,100%{stroke-dashoffset:0}}
/* ---- cambio de pantalla: una franja cobalto inclinada barre el contenido ---- */
#barrido{position:fixed;top:0;bottom:0;left:0;width:22vw;z-index:7;pointer-events:none;background:var(--ac);opacity:.9;transform:translateX(-140%) skewX(-30deg);animation:tmBarrido .46s cubic-bezier(.3,.7,.2,1) both}
@keyframes tmBarrido{from{transform:translateX(-140%) skewX(-30deg)}to{transform:translateX(620%) skewX(-30deg)}}
@media print{#splash,#ph,#sello,#barrido{display:none!important}}
`;
document.head.insertAdjacentHTML('beforeend','<style id="tmcss">'+TM.css+Object.entries(TM.IC).map(([t,d])=>`nav button[data-t="${t}"]{--i:url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='${d}'/></svg>`)}")}`).join('')+'</style>');
// Logo en la barra y encabezado de cada pantalla (título + fecha, con ayuda y avisos a la derecha).
{const l=$('.logo');if(l)l.innerHTML=TM.MARCA(30)}
$('main').insertAdjacentHTML('afterbegin','<div id="ph"><div><h1 id="pht"></h1><span id="phd" class="mu"></span></div><span id="phu"></span></div>');
{const u=$('#phu'),a=$('#ayuda'),w=$('#avw');if(w)u.appendChild(w);if(a){a.textContent='Ayuda';u.appendChild(a)}}
TM.TIT={h:'Inicio',v:'Ventas',p:'Productos',i:'Inventario',c:'Clientes',r:'Reportes',o:'Mercadería',w:'Resumen financiero',f:'Finanzas',a:'Analítica',e:'Baja de Stock',g:'Configuración',u:'Usuarios',k:'Caja',z:'Actividad'};
TM.ult='';TM.titulo=()=>{const t=tabNow();if(t!==TM.ult){TM.ult=t;const h=$('#pht');h.textContent=TM.TIT[t]||'';h.style.animation='none';void h.offsetWidth;h.style.animation='';TM.barrido()}
  const d=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});$('#phd').textContent=((db.shop&&db.shop.n)||'')+(db.shop&&db.shop.n?' · ':'')+d.charAt(0).toUpperCase()+d.slice(1)};
MODS.push(TM.titulo);
// El total "late" cuando cambia.
{const t=$('#total');let v=t.textContent;new MutationObserver(()=>{if(t.textContent===v)return;v=t.textContent;t.classList.remove('bump');void t.offsetWidth;t.classList.add('bump')}).observe(t,{childList:true,characterData:true,subtree:true})}
// Animación de inicio (una vez por apertura). Sin animaciones: no se muestra.
// Arranque: index.html pinta primero una cortina (#pre) del color de la marca, así nunca se ve la interfaz sin estilos.
// La cortina se va recién cuando el programa está listo (fuentes cargadas) y pasó un tiempo mínimo, aunque cargue antes.
TM.listo=()=>Promise.race([(document.fonts&&document.fonts.ready)||Promise.resolve(),new Promise(r=>setTimeout(r,2500))]);
TM.quitarPre=()=>{const p=$('#pre');if(!p)return;p.classList.add('fin');setTimeout(()=>p.remove(),400)};
TM.splash=()=>{let on=true;try{on=AV.prefs().anim}catch(e){}
  if(!on){TM.listo().then(()=>setTimeout(TM.quitarPre,Math.max(0,700-performance.now())));return}
  document.body.insertAdjacentHTML('beforeend',`<div id="splash" aria-hidden="true">${TM.MARCA(150)}<span class="cinta"></span></div>`);const s=$('#splash');const pr=$('#pre');if(pr)pr.remove();
  const t0=performance.now();TM.listo().then(()=>{const resta=Math.max(0,1600-(performance.now()-t0));setTimeout(()=>{s.classList.add('fin');setTimeout(()=>s.parentNode&&s.parentNode.removeChild(s),450)},resta)})};
// Animaciones propias (solo con "Animaciones suaves" activadas).
TM.anim=()=>document.documentElement.classList.contains('anim');
TM.efimero=(id,html,ms)=>{const v=$('#'+id);if(v)v.parentNode.removeChild(v);document.body.insertAdjacentHTML('beforeend',html);const e=$('#'+id);setTimeout(()=>{if(e.parentNode)e.parentNode.removeChild(e)},ms)};
TM.primera=true;TM.barrido=()=>{if(TM.primera){TM.primera=false;return}if(TM.anim())TM.efimero('barrido','<div id="barrido" aria-hidden="true"></div>',520)};
TM.sello=()=>{if(TM.anim())TM.efimero('sello','<div id="sello" aria-hidden="true"><div class="sc"></div><div class="so"><svg viewBox="0 0 24 24" width="60" height="60"><path d="M5 12.5 10 17.5 19 7.5" pathLength="1" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>',1000)};
// Venta sellada: aparece solo cuando el cobro registró una venta de verdad.
{let antes=0;document.addEventListener('click',e=>{if(e.target.closest('#cobrar'))antes=db.sales.length},true);$('#cobrar').addEventListener('click',()=>{if(db.sales.length>antes)TM.sello()})}
// Indicador de guardado con la cinta de carga.
{const g=$('#guard');if(g)g.innerHTML='<span class="cinta"></span> Guardando'}
TM.splash();
// Primer dibujo con el tema ya aplicado (título de la pantalla y barra de caja).
draw();
