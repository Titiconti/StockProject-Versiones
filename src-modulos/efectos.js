// ===== Efectos visuales adaptados de React Bits (reactbits.dev, MIT + Commons Clause) a JS sin React =====
// Solo decoran: no cambian datos, textos ni el orden de los clics. Se apagan con "Animaciones suaves" (clase html.anim).
//  - Indicador de sección: pastilla que se desliza en la barra lateral hasta la sección activa (estilo de los menús de React Bits).
//  - CountUp: los números de los indicadores cuentan al entrar a una pantalla (se dibuja encima; el texto real no se toca).
//  - SpotlightCard: luz suave que sigue al mouse sobre indicadores y productos.
//  - ClickSpark: chispas verdes al agregar un producto a la venta.
//  - ShinyText: brillo que cruza la marca en la animación de inicio.
const FX={};
FX.on=()=>document.documentElement.classList.contains('anim');
// Los efectos de lienzo solo se arman si el equipo puede dibujar (en el navegador simulado de las pruebas no se puede).
FX.lienzo=(()=>{try{const c=document.createElement('canvas');return typeof c.getContext==='function'&&typeof CanvasRenderingContext2D!=='undefined'&&!!c.getContext('2d')}catch(e){return false}})();
document.head.insertAdjacentHTML('beforeend',`<style id="fxcss">
header nav{position:relative}header nav>button,header nav #masb{position:relative;z-index:1}#fxind{position:absolute;left:0;top:0;z-index:0;border-radius:10px;background:rgba(255,255,255,.13);box-shadow:inset 3px 0 0 var(--ok);pointer-events:none;opacity:0;display:none}
html.anim #fxind{display:block;transition:transform .38s cubic-bezier(.22,1,.36,1),width .38s cubic-bezier(.22,1,.36,1),height .38s cubic-bezier(.22,1,.36,1),opacity .2s}html.anim header nav.fx-ind>button.on,html.anim header nav.fx-ind #masb.on{background:transparent;box-shadow:none}
html.anim header{background-image:linear-gradient(180deg,rgba(36,71,249,.22) 0,rgba(36,71,249,0) 260px)}
html.anim .kpis .card,html.anim #v .p:not(:disabled){background-image:radial-gradient(220px circle at var(--fx-x,-999px) var(--fx-y,-999px),color-mix(in srgb,var(--ac) 10%,transparent),transparent 70%)}
.fx-cu{position:relative;color:transparent!important}.fx-cu::after{content:attr(data-cu);position:absolute;left:0;top:0;white-space:nowrap;color:var(--fx-c,var(--tx))}
#fxspark{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:160}
#splash{background-image:radial-gradient(70% 60% at 50% 0,var(--pre2) 0,var(--pre) 60%),radial-gradient(color-mix(in srgb,var(--pre-tx) 7%,transparent) 1px,transparent 1.6px);background-size:auto,22px 22px}
#splash .wm{background:linear-gradient(110deg,var(--pre-tx) 42%,#6E8BFF 50%,var(--pre-tx) 58%) 100% 0/250% 100% no-repeat;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:tmIn .7s var(--ease) 1.05s both,fxShine 1.2s cubic-bezier(.4,0,.2,1) 1.3s both}
@keyframes fxShine{from{background-position:100% 0}to{background-position:0 0}}
@media print{#fxind,#fxspark{display:none!important}}
</style>`);

// ---- Indicador de sección (barra lateral) ----
// Una sola pastilla que se desliza hasta la sección elegida, en vez de saltar de botón en botón. Quieto el resto del tiempo.
FX.ind=()=>{const n=$('header nav');if(!n)return;const d=document.createElement('span');d.id='fxind';d.setAttribute('aria-hidden','true');n.insertBefore(d,n.firstChild);
  FX.mover=()=>{const b=n.querySelector(':scope > button.on:not(.hide)')||(n.querySelector('#masb.on'));if(!b||!b.offsetParent){d.style.opacity=0;n.classList.remove('fx-ind');return}
    d.style.cssText=`opacity:1;width:${b.offsetWidth}px;height:${b.offsetHeight}px;transform:translate(${b.offsetLeft}px,${b.offsetTop}px)`;n.classList.add('fx-ind')};
  n.addEventListener('click',()=>setTimeout(FX.mover,0));if(window.ResizeObserver)new ResizeObserver(FX.mover).observe(n);MODS.push(FX.mover);FX.mover()};

// ---- CountUp (indicadores) ----
FX.NUM=/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/;
FX.contar=el=>{const orig=el.textContent,m=orig.match(FX.NUM);if(!m)return;
  const dec=(m[0].split(',')[1]||'').length,fin=parseFloat(m[0].replace(/\./g,'').replace(',','.'));if(!isFinite(fin)||fin===0)return;
  const f=v=>v.toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec,useGrouping:m[0].includes('.')||Math.abs(fin)>=1e4});
  const DUR=750,t0=performance.now(),ease=t=>t>=1?1:(1-Math.pow(2,-10*t))/(1-Math.pow(2,-10));
  el.style.setProperty('--fx-c',getComputedStyle(el).color);el.classList.add('fx-cu');
  const paso=now=>{const t=Math.min(1,(now-t0)/DUR);
    // Si la pantalla se redibujó en el medio, se suelta: manda el texto real.
    if(!el.isConnected||el.textContent!==orig||t>=1){el.classList.remove('fx-cu');el.removeAttribute('data-cu');el.style.removeProperty('--fx-c');return}
    el.setAttribute('data-cu',orig.slice(0,m.index)+f(fin*ease(t))+orig.slice(m.index+m[0].length));requestAnimationFrame(paso)};
  requestAnimationFrame(paso)};
FX.tab='';FX.alCambiar=()=>{const t=tabNow();if(t===FX.tab)return;FX.tab=t;if(!FX.on()||!FX.lienzo)return;
  setTimeout(()=>{const s=$('#'+t);if(s)s.querySelectorAll('.kpis .big').forEach(FX.contar)},0)};
MODS.push(FX.alCambiar);

// ---- SpotlightCard (indicadores y productos) ----
{let ult=null;const soltar=()=>{if(ult){ult.style.removeProperty('--fx-x');ult.style.removeProperty('--fx-y');ult=null}};
  document.addEventListener('pointermove',e=>{const c=FX.on()&&e.target.closest&&e.target.closest('.kpis .card,#v .p');if(c!==ult)soltar();if(!c)return;
    const r=c.getBoundingClientRect();c.style.setProperty('--fx-x',(e.clientX-r.left)+'px');c.style.setProperty('--fx-y',(e.clientY-r.top)+'px');ult=c},{passive:true});
  document.addEventListener('pointerleave',soltar,{passive:true})}

// ---- ClickSpark (agregar producto) ----
FX.chispas=(x,y)=>{if(!FX.lienzo)return;let cv=$('#fxspark');if(!cv){cv=document.createElement('canvas');cv.id='fxspark';cv.setAttribute('aria-hidden','true');document.body.appendChild(cv)}
  const ctx=cv.getContext('2d');if(!ctx)return;const dpr=Math.min(window.devicePixelRatio||1,2);cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
  const col=getComputedStyle(document.documentElement).getPropertyValue('--ok').trim()||'#0E9F6E',N=8,RAD=32,LAR=11,DUR=460,t0=performance.now(),giro=Math.random()*6.28;
  const paso=now=>{const t=Math.min(1,(now-t0)/DUR),e=1-Math.pow(1-t,3);ctx.clearRect(0,0,innerWidth,innerHeight);
    if(t>=1){if(cv.parentNode)cv.parentNode.removeChild(cv);return}
    ctx.strokeStyle=col;ctx.lineWidth=2.2;ctx.lineCap='round';ctx.globalAlpha=1-t;
    for(let i=0;i<N;i++){const a=giro+i*6.2832/N,d=e*RAD,l=LAR*(1-e);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*d,y+Math.sin(a)*d);ctx.lineTo(x+Math.cos(a)*(d+l),y+Math.sin(a)*(d+l));ctx.stroke()}
    requestAnimationFrame(paso)};requestAnimationFrame(paso)};
// Antes del clic se anota cuánto había de ese producto en la venta; después, solo si aumentó, hay chispas.
FX.antes=null;document.addEventListener('click',e=>{const p=e.target.closest&&e.target.closest('#v .p');FX.antes=p?{id:p.dataset.id,q:cart[p.dataset.id]||0}:null},true);
document.addEventListener('click',e=>{const p=FX.on()&&e.target.closest&&e.target.closest('#v .p');if(!p||p.disabled||!FX.antes||FX.antes.id!==p.dataset.id||!((cart[p.dataset.id]||0)>FX.antes.q))return;
  let x=e.clientX,y=e.clientY;if(!e.detail){const r=p.getBoundingClientRect();x=r.left+r.width/2;y=r.top+r.height/2}FX.chispas(x,y)},{passive:true});

FX.ind();
