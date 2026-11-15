// ===== Efectos visuales adaptados de React Bits (reactbits.dev, MIT + Commons Clause) a JS sin React =====
// Solo decoran: no cambian datos, textos ni el orden de los clics. Se apagan con "Animaciones suaves" (clase html.anim).
//  - DotGrid: trama de puntos en la barra lateral que se aparta y se ilumina con el mouse.
//  - CountUp: los números de los indicadores cuentan al entrar a una pantalla (se dibuja encima; el texto real no se toca).
//  - SpotlightCard: luz suave que sigue al mouse sobre indicadores y productos.
//  - ClickSpark: chispas verdes al agregar un producto a la venta.
//  - ShinyText: brillo que cruza la marca en la animación de inicio.
const FX={};
FX.on=()=>document.documentElement.classList.contains('anim');
// Los efectos de lienzo solo se arman si el equipo puede dibujar (en el navegador simulado de las pruebas no se puede).
FX.lienzo=(()=>{try{const c=document.createElement('canvas');return typeof c.getContext==='function'&&typeof CanvasRenderingContext2D!=='undefined'&&!!c.getContext('2d')}catch(e){return false}})();
document.head.insertAdjacentHTML('beforeend',`<style id="fxcss">
header>.bar{position:relative;z-index:1}#fxdots{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none}html.anim #fxdots{display:block}
html.anim .kpis .card,html.anim #v .p:not(:disabled){background-image:radial-gradient(220px circle at var(--fx-x,-999px) var(--fx-y,-999px),color-mix(in srgb,var(--ac) 10%,transparent),transparent 70%)}
.fx-cu{position:relative;color:transparent!important}.fx-cu::after{content:attr(data-cu);position:absolute;left:0;top:0;white-space:nowrap;color:var(--fx-c,var(--tx))}
#fxspark{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:160}
#splash{background-image:radial-gradient(60% 50% at 50% 42%,#1D3B6E 0,transparent 70%),radial-gradient(rgba(255,255,255,.07) 1px,transparent 1.6px);background-size:auto,22px 22px}
#splash .wm{background:linear-gradient(110deg,#fff 42%,#9FB4FF 50%,#fff 58%) 100% 0/250% 100% no-repeat;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:tmIn .4s var(--ease) .62s both,fxShine 1.1s cubic-bezier(.4,0,.2,1) .8s both}
@keyframes fxShine{from{background-position:100% 0}to{background-position:0 0}}
@media print{#fxdots,#fxspark{display:none!important}}
</style>`);

// ---- DotGrid (barra lateral) ----
FX.dots=()=>{const h=$('header');if(!h||!FX.lienzo)return;
  const cv=document.createElement('canvas');cv.id='fxdots';cv.setAttribute('aria-hidden','true');h.insertBefore(cv,h.firstChild);
  const ctx=cv.getContext('2d');if(!ctx)return;
  const GAP=22,R=1.2,PROX=110,EMPUJE=7,RESORTE=.14,FRENO=.72;let pts=[],w=0,hh=0,dpr=1,px=-1e4,py=-1e4,dentro=false,corre=false;
  const armar=()=>{dpr=Math.min(window.devicePixelRatio||1,2);w=h.clientWidth;hh=h.clientHeight;cv.width=w*dpr;cv.height=hh*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);pts=[];
    const ox=(w%GAP)/2+GAP/2,oy=(hh%GAP)/2+GAP/2;for(let y=oy;y<hh;y+=GAP)for(let x=ox;x<w;x+=GAP)pts.push({x,y,dx:0,dy:0,vx:0,vy:0,e:0});pintar()};
  const pintar=()=>{ctx.clearRect(0,0,w,hh);let mueve=false;
    for(const p of pts){const ax=p.x-px,ay=p.y-py,d=Math.hypot(ax,ay),k=dentro&&d<PROX?1-d/PROX:0;
      const tx=k?ax/(d||1)*EMPUJE*k*k:0,ty=k?ay/(d||1)*EMPUJE*k*k:0;p.vx=(p.vx+(tx-p.dx)*RESORTE)*FRENO;p.vy=(p.vy+(ty-p.dy)*RESORTE)*FRENO;p.dx+=p.vx;p.dy+=p.vy;p.e+=(k-p.e)*.2;
      if(Math.abs(p.vx)+Math.abs(p.vy)>.02||p.e>.01)mueve=true;
      ctx.fillStyle=p.e>.01?`rgba(${Math.round(255-145*p.e)},${Math.round(255-116*p.e)},255,${.08+.55*p.e})`:'rgba(255,255,255,.08)';
      ctx.beginPath();ctx.arc(p.x+p.dx,p.y+p.dy,R*(1+.9*p.e),0,6.2832);ctx.fill()}
    return mueve};
  const ciclo=()=>{if(!FX.on()){corre=false;return}const m=pintar();if(m||dentro)requestAnimationFrame(ciclo);else corre=false};
  const arrancar=()=>{if(!corre&&FX.on()){corre=true;requestAnimationFrame(ciclo)}};
  h.addEventListener('pointermove',e=>{const r=h.getBoundingClientRect();px=e.clientX-r.left;py=e.clientY-r.top;dentro=true;arrancar()},{passive:true});
  h.addEventListener('pointerleave',()=>{dentro=false;arrancar()},{passive:true});
  if(window.ResizeObserver)new ResizeObserver(armar).observe(h);else window.addEventListener('resize',armar);armar()};

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

FX.dots();
