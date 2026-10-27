// ===== Movilidad: trabajo sin conexión con sincronización =====
// Si la conexión con la PC principal se corta (o dos dispositivos guardan a la vez) no se pierde nada: las ventas, cobros,
// clientes y contactos nuevos quedan en una cola local; al volver la conexión se recarga lo del servidor y se vuelven a aplicar.
const OFF={ctr:null,activo:false,key:'sp_cola_'+location.host};
OFF.contadores=()=>({sid:db.sid,payid:db.payid,cid:db.cid,iid:db.iid});
// Nuevos desde la última vez que el servidor confirmó nuestros datos.
OFF.extraer=()=>{if(KIND==='local'||!OFF.ctr)return null;const c=OFF.ctr,o={sales:db.sales.filter(s=>s.id>=c.sid&&!s.void),pays:db.pays.filter(p=>p.id>=c.payid),clients:db.clients.filter(x=>x.id>=c.cid),inter:db.inter.filter(x=>x.id>=c.iid)};o.n=o.sales.length+o.pays.length+o.clients.length+o.inter.length;return o};
OFF.guardarCola=o=>{try{if(o&&o.n)localStorage.setItem(OFF.key,JSON.stringify(o));else localStorage.removeItem(OFF.key)}catch(e){}};
OFF.leerCola=()=>{try{return JSON.parse(localStorage.getItem(OFF.key)||'null')}catch(e){return null}};
// Vuelve a aplicar las operaciones sobre los datos recién cargados, sin duplicar lo que el servidor ya tenía.
OFF.aplicar=ops=>{if(!ops||!ops.n)return{sales:0,pays:0,clients:0,inter:0,sinProducto:0,sinStock:0};const r={sales:0,pays:0,clients:0,inter:0,sinProducto:0,sinStock:0},map=new Map();
  ops.clients.forEach(c=>{const ya=db.clients.find(x=>(x.id===c.id&&x.name===c.name)||norm(x.name)===norm(c.name));if(ya){map.set(c.id,ya.id);return}const nid=db.cid++;map.set(c.id,nid);db.clients.push({...c,id:nid});r.clients++});
  const cid=id=>id==null?id:map.has(id)?map.get(id):id;
  ops.sales.forEach(s=>{if(db.sales.some(x=>x.id===s.id&&x.date===s.date&&x.total===s.total))return;const items=[];let ok=true;
    s.items.forEach(i=>{const p=db.prods.find(x=>x.id===i.id);if(!p){r.sinProducto++;ok=false;return}if(avail(p)<i.qty)r.sinStock++;items.push({...i,lots:sell(p,i.qty)})});
    if(!ok||!items.length)return;const n={...s,id:db.sid++,items};if(s.cid!=null)n.cid=cid(s.cid);db.sales.push(n);r.sales++});
  ops.pays.forEach(p=>{if(db.pays.some(x=>x.id===p.id&&x.date===p.date&&x.amount===p.amount&&x.cid===cid(p.cid)))return;if(cid(p.cid)==null||!cl$(cid(p.cid)))return;db.pays.push({...p,id:db.payid++,cid:cid(p.cid)});r.pays++});
  ops.inter.forEach(x=>{if(db.inter.some(y=>y.id===x.id&&y.fecha===x.fecha))return;if(!cl$(cid(x.cid)))return;db.inter.push({...x,id:db.iid++,cid:cid(x.cid)});r.inter++});return r};
OFF.banner=()=>{let b=$('#off');if(!OFF.activo){if(b)b.remove();return}if(!b){b=document.createElement('div');b.id='off';b.style.cssText='position:sticky;top:0;z-index:55;background:var(--bad);color:#fff;text-align:center;padding:6px 10px;font-weight:600;font-size:14px';document.body.prepend(b)}
  const c=OFF.extraer();b.textContent='Sin conexión con la PC principal. '+(c&&c.n?`Hay ${c.n} cambio(s) pendientes: se enviarán solos al volver.`:'Podés seguir trabajando: se enviará todo al volver.')};
OFFH.ok=()=>{OFF.ctr=OFF.contadores();OFF.guardarCola(null)};
OFFH.fallo=()=>{OFF.activo=true;OFF.guardarCola(OFF.extraer());OFF.banner()};
OFFH.red=()=>{if(KIND==='local'||ED)return;OFF.activo=true;OFF.banner()};
OFFH.extraer=()=>OFF.extraer();
OFFH.reaplicar=ops=>{if(!ops||!ops.n)return;const r=OFF.aplicar(ops);if(r.sales+r.pays+r.clients+r.inter>0){save()}OFF.guardarCola(null);const av=[];if(r.sinProducto)av.push(r.sinProducto+' renglón(es) de productos que ya no existen');if(r.sinStock)av.push('hay productos con stock insuficiente: revisá el inventario');if(av.length)toast('Atención: '+av.join('; '))};
// Al volver la conexión: se baja lo del servidor y se reaplican los cambios pendientes.
OFFH.online=async()=>{if(!OFF.activo)return;OFF.activo=false;const ops=OFF.extraer()||OFF.leerCola();OFF.banner();if(ops&&ops.n){await reloadAll();OFFH.reaplicar(ops);toast('Volvió la conexión: se enviaron '+ops.n+' cambio(s) pendientes')}};
// Si se cerró la página con cambios sin enviar, se retoman al abrir de nuevo.
OFF.arranque=()=>{if(KIND==='local')return;OFF.ctr=OFF.contadores();const q=OFF.leerCola();if(q&&q.n){OFF.guardarCola(null);setTimeout(()=>{OFFH.reaplicar(q);toast('Se enviaron '+q.n+' cambio(s) que habían quedado sin enviar')},800)}};
OFF.arranque();
