// ===== Identidad visual de StockProject: logo, tema, barra lateral, encabezado de pantalla y animaciones =====
// Paleta: tinta (azul marino, cromo) · papel (fondo) · cobalto (acciones) · verde caja (dinero) · ámbar (avisos).
// Las animaciones se controlan con la preferencia "Animaciones suaves" del programa (clase html.anim, en la campana).
// A pedido del dueño no dependen de la opción de Windows: muchas PCs de mostrador la traen desactivada.
const TM={};
TM.LOGO=(n=28)=>`<svg viewBox="0 0 64 64" width="${n}" height="${n}" aria-hidden="true" class="lg"><rect width="64" height="64" rx="15" fill="#12233D"/><path class="lg-t" d="M32 14 48 23 32 32 16 23Z" fill="#0E9F6E"/><path class="lg-l" d="M16 23 32 32V50L16 41Z" fill="#2447F9"/><path class="lg-r" d="M48 23 32 32V50L48 41Z" fill="#6E8BFF"/><path class="lg-c" d="M24 18.5 40 27.5" stroke="#fff" stroke-width="3" stroke-linecap="round" pathLength="1"/></svg>`;
TM.MARCA=n=>`${TM.LOGO(n)}<span class="wm"><b>Stock</b>Project</span>`;
// Iconos del menú (trazo, 24×24) por pantalla.
TM.IC={h:'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',v:'M4 5h2l2.2 10h9.6L20 8H7.2M9 19.5h.01M17 19.5h.01',p:'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',i:'M12 3 21 8v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8',
  c:'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.9M15.5 3.2a3.5 3.5 0 0 1 0 6.6',r:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  o:'M2 6h11v10H2zM13 9h4l4 4v3h-8M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',f:'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2M16.5 14h.01',
  a:'M3 17l6-6 4 4 8-8M15 7h6v6',e:'M12 3 21 8v8l-9 5-9-5V8zM8.5 12.5 12 16l3.5-3.5M12 16V9',g:'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 12l2-1.2-2-3.5-2.3.7-1.7-1L14.5 4.5h-5L9 7l-1.7 1L5 7.3l-2 3.5L5 12l-2 1.2 2 3.5 2.3-.7 1.7 1 .5 2.5h5l.5-2.5 1.7-1 2.3.7 2-3.5z',
  u:'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4',k:'M3 13h18v7H3zM5 13l2-8h10l2 8M10 17h4',z:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2'};
TM.css=`
:root{--bg:#F4F6FA;--card:#fff;--tx:#14213A;--mu:#5F6B7E;--bd:#E2E7F0;--ac:#2447F9;--act:#fff;--ok:#0E9F6E;--bad:#D92D20;--warn:#B45309;--ink:#12233D;--ink2:#1B3157;--sh:0 1px 2px rgba(18,35,61,.05),0 10px 28px -14px rgba(18,35,61,.18);--r:14px;--ease:cubic-bezier(.2,.8,.2,1)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0C1626;--card:#14223A;--tx:#E8EDF7;--mu:#9AA8BF;--bd:#24344F;--ac:#6E8BFF;--act:#0C1626;--ok:#2BC48E;--bad:#FF6B5E;--warn:#F5A524;--ink:#0A1322;--ink2:#14223A;--sh:0 1px 2px rgba(0,0,0,.3),0 12px 30px -16px rgba(0,0,0,.6)}}
:root[data-theme="dark"]{--bg:#0C1626;--card:#14223A;--tx:#E8EDF7;--mu:#9AA8BF;--bd:#24344F;--ac:#6E8BFF;--act:#0C1626;--ok:#2BC48E;--bad:#FF6B5E;--warn:#F5A524;--ink:#0A1322;--ink2:#14223A;--sh:0 1px 2px rgba(0,0,0,.3),0 12px 30px -16px rgba(0,0,0,.6)}
body{font:15px/1.45 "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
h3{font:600 16px/1.3 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.01em}
/* ---- cromo: barra superior (pantallas chicas) o lateral (pantallas anchas) ---- */
header{background:var(--ink);border:0;color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.06) inset}
.logo{display:inline-flex;align-items:center;gap:10px;color:#fff;font-size:17px;font-weight:400;letter-spacing:-.01em}.logo .lg{border-radius:8px;box-shadow:0 0 0 1px rgba(255,255,255,.16)}.wm b{font-weight:700}
nav button,#masb{color:rgba(255,255,255,.74);font-weight:500;border-radius:10px;display:inline-flex;align-items:center;gap:10px;transition:background .15s,color .15s}
nav button::before{content:"";flex:none;width:18px;height:18px;background:currentColor;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat;opacity:.9}
nav button:hover,#masb:hover{background:rgba(255,255,255,.08);color:#fff}nav button.on,#masb.on{background:rgba(255,255,255,.13);color:#fff;box-shadow:inset 3px 0 0 var(--ok)}
#masmenu{background:var(--ink2);border-color:rgba(255,255,255,.12)}
#ses .mu{color:rgba(255,255,255,.7)}header .btn.sec{background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.16)}
main{max-width:1320px;padding:18px 20px 40px}
#ph{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:2px 0 16px}#pht{margin:0;font:700 26px/1.15 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.025em}#phd{font-size:13px}#phu{display:flex;gap:8px;align-items:center}
@media(min-width:1100px){
 header{position:fixed;inset:0 auto 0 0;width:236px;z-index:8}.bar{flex-direction:column;align-items:stretch;flex-wrap:nowrap;height:100%;padding:20px 12px 14px;gap:18px;max-width:none}
 .logo{padding:0 8px}nav{flex-direction:column;align-items:stretch;flex-wrap:nowrap;gap:2px;overflow:auto;flex:1}nav button{width:100%;text-align:left;padding:10px 12px}
 .mas{display:flex;flex-direction:column;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}#masb{display:none}
 #masmenu,#masmenu.hide{display:flex;position:static;background:none;border:0;box-shadow:none;padding:0;min-width:0}
 #ses{margin:0!important;padding:10px 8px 0;border-top:1px solid rgba(255,255,255,.1);flex-wrap:wrap;font-size:13px}
 main{margin:0 0 0 236px;padding:26px 34px 48px}}
/* ---- superficies ---- */
.card{border-radius:var(--r);border-color:var(--bd);box-shadow:var(--sh);padding:18px}.kpis .card,.herr .card,.ov .card .card{box-shadow:none}
.kpis .card{border-top:3px solid var(--bd);padding:14px 16px}.kpis .card:first-child{border-top-color:var(--ok)}.kpis .big,.kpi div{font:700 26px/1.2 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.025em}
input,select,textarea{background:var(--card);border-color:var(--bd);border-radius:10px;transition:border-color .15s,box-shadow .15s}input:focus,select:focus,textarea:focus{outline:0;border-color:var(--ac);box-shadow:0 0 0 3px color-mix(in srgb,var(--ac) 22%,transparent)}
label{font-size:12.5px;font-weight:500}
.btn{border-radius:10px;font-weight:600;transition:transform .08s,filter .15s,box-shadow .15s}.btn:hover:not(:disabled){filter:brightness(1.07)}.btn:focus-visible,.p:focus-visible,nav button:focus-visible{outline:0;box-shadow:0 0 0 3px color-mix(in srgb,var(--ac) 40%,transparent)}
.btn.sec{background:var(--card);border-color:var(--bd)}.btn.sec:hover:not(:disabled){border-color:var(--ac);filter:none}
#cobrar{background:var(--ok);color:#fff;font-size:18px!important;padding:14px 16px;box-shadow:0 8px 20px -10px var(--ok)}
.tot{font:700 46px/1.05 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.035em;margin:2px 0 10px}.tot.bump{animation:tmBump .28s var(--ease)}
.p{background:var(--card);border-radius:12px;padding:12px;transition:transform .12s var(--ease),border-color .12s,box-shadow .12s}.p:hover:not(:disabled){transform:translateY(-2px);box-shadow:var(--sh)}.p b{font-weight:600;line-height:1.25}.p .pt{display:flex;flex-wrap:wrap;gap:4px}.p .pt i{white-space:nowrap}#ses:empty{display:none}.p em{font-size:16px;letter-spacing:-.01em}
th{font-weight:600;font-size:12.5px}tbody tr{transition:background .12s}tbody tr:hover{background:color-mix(in srgb,var(--ac) 5%,transparent)}
.tag{font-weight:600}.pills button{font-weight:500}.pills button.on{color:var(--act)}
.row{padding:10px 0}.tip{border-radius:10px}
.ov,.mod{background:rgba(10,19,34,.55);backdrop-filter:blur(5px)}.ov .card{border-radius:18px;padding:22px;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)}
#toast{background:var(--ink);color:#fff;border-radius:12px;padding:12px 18px;font-weight:500;box-shadow:0 14px 34px -12px rgba(0,0,0,.5);transform:translate(-50%,12px);transition:opacity .2s,transform .25s var(--ease);max-width:min(560px,92vw)}#toast.show{transform:translate(-50%,0)}
/* ---- animaciones ---- */
html.anim main>section:not(.hide){animation:tmIn .26s var(--ease)}html.anim main>section:not(.hide)>.card,html.anim main>section:not(.hide)>.grid>.card,html.anim main>section:not(.hide) .kpis>.card{animation:tmUp .34s var(--ease) backwards}
html.anim main>section:not(.hide)>:nth-child(2),html.anim main>section:not(.hide) .kpis>:nth-child(2),html.anim main>section:not(.hide)>.grid>:nth-child(2){animation-delay:.05s}html.anim main>section:not(.hide)>:nth-child(3),html.anim main>section:not(.hide) .kpis>:nth-child(3){animation-delay:.1s}html.anim main>section:not(.hide)>:nth-child(4),html.anim main>section:not(.hide) .kpis>:nth-child(4){animation-delay:.15s}html.anim main>section:not(.hide)>:nth-child(n+5),html.anim main>section:not(.hide) .kpis>:nth-child(n+5){animation-delay:.2s}
html.anim #pht{animation:tmIn .3s var(--ease)}html.anim .ov>.card{animation:tmPop .22s var(--ease)}html.anim #cart .row{animation:tmIn .2s var(--ease)}
@keyframes tmIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes tmUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes tmPop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}@keyframes tmBump{0%{transform:scale(1)}40%{transform:scale(1.045)}100%{transform:scale(1)}}
/* ---- inicio: la caja se arma, se cierra con cinta y da paso al programa ---- */
#splash{position:fixed;inset:0;z-index:200;background:var(--ink);background-image:radial-gradient(60% 50% at 50% 42%,#1D3B6E 0,transparent 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;color:#fff;transition:opacity .38s ease,visibility .38s}#splash.fin{opacity:0;visibility:hidden}
#splash .lg{width:112px;height:112px;filter:drop-shadow(0 18px 30px rgba(0,0,0,.45))}#splash .lg rect{fill:transparent}
#splash .lg-l{animation:spL .5s var(--ease) both}#splash .lg-r{animation:spR .5s var(--ease) .1s both}#splash .lg-t{animation:spT .5s var(--ease) .26s both}#splash .lg-c{stroke-dasharray:1;animation:spC .32s ease-out .62s both}
#splash .wm{font:400 30px/1 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.03em;animation:tmIn .45s var(--ease) .5s both}#splash small{color:rgba(255,255,255,.6);font-size:13px;animation:tmIn .45s var(--ease) .7s both}
@keyframes spL{from{opacity:0;transform:translate(-14px,10px)}to{opacity:1;transform:none}}@keyframes spR{from{opacity:0;transform:translate(14px,10px)}to{opacity:1;transform:none}}@keyframes spT{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}@keyframes spC{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@media print{#splash,#ph{display:none!important}}
`;
document.head.insertAdjacentHTML('beforeend','<style id="tmcss">'+TM.css+Object.entries(TM.IC).map(([t,d])=>`nav button[data-t="${t}"]{--i:url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='${d}'/></svg>`)}")}`).join('')+'</style>');
// Logo en la barra y encabezado de cada pantalla (título + fecha, con ayuda y avisos a la derecha).
{const l=$('.logo');if(l)l.innerHTML=TM.MARCA(30)}
$('main').insertAdjacentHTML('afterbegin','<div id="ph"><div><h1 id="pht"></h1><span id="phd" class="mu"></span></div><span id="phu"></span></div>');
{const u=$('#phu'),a=$('#ayuda'),w=$('#avw');if(w)u.appendChild(w);if(a){a.textContent='Ayuda';u.appendChild(a)}}
TM.TIT={h:'Inicio',v:'Ventas',p:'Productos',i:'Inventario',c:'Clientes',r:'Reportes',o:'Pedidos',f:'Finanzas',a:'Analítica',e:'Baja de Stock',g:'Configuración',u:'Usuarios',k:'Caja',z:'Actividad'};
TM.ult='';TM.titulo=()=>{const t=tabNow();if(t!==TM.ult){TM.ult=t;const h=$('#pht');h.textContent=TM.TIT[t]||'';h.style.animation='none';void h.offsetWidth;h.style.animation=''}
  const d=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});$('#phd').textContent=((db.shop&&db.shop.n)||'')+(db.shop&&db.shop.n?' · ':'')+d.charAt(0).toUpperCase()+d.slice(1)};
MODS.push(TM.titulo);
// El total "late" cuando cambia.
{const t=$('#total');let v=t.textContent;new MutationObserver(()=>{if(t.textContent===v)return;v=t.textContent;t.classList.remove('bump');void t.offsetWidth;t.classList.add('bump')}).observe(t,{childList:true,characterData:true,subtree:true})}
// Animación de inicio (una vez por apertura). Sin animaciones: no se muestra.
TM.splash=()=>{let on=true;try{on=AV.prefs().anim}catch(e){}if(!on)return;
  document.body.insertAdjacentHTML('beforeend',`<div id="splash" aria-hidden="true">${TM.MARCA(112)}<small>Preparando tu negocio…</small></div>`);const s=$('#splash');setTimeout(()=>s.classList.add('fin'),1150);setTimeout(()=>s.remove(),1600)};
TM.splash();
// Primer dibujo con el tema ya aplicado (título de la pantalla y barra de caja).
draw();
