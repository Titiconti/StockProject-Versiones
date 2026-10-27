// ===== Utilidades compartidas por los módulos nuevos =====
const UT={
  dk:d=>new Date(d).toLocaleDateString('sv-SE'),
  hoy:()=>UT.dk(Date.now()),
  add:(k,n)=>{const d=new Date(k+'T12:00:00');d.setDate(d.getDate()+n);return UT.dk(d)},
  ventas:(desde,hasta)=>db.sales.filter(s=>!s.void&&UT.dk(s.date)>=desde&&UT.dk(s.date)<=hasta),
  suma:a=>a.reduce((x,s)=>x+s.total,0),
  ganancia:a=>a.reduce((x,s)=>x+s.total-s.items.reduce((y,i)=>y+i.qty*(i.cost||0),0),0),
  r2:n=>Math.round((n||0)*100)/100,
  bajar(nombre,texto,tipo='text/plain'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([texto],{type:tipo+';charset=utf-8'}));a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)},
  csv:rows=>'\ufeff'+rows.map(r=>r.map(c=>{c=c==null?'':String(c);return /[";\n\r]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c}).join(';')).join('\r\n'),
  // Gráfico que se adapta al ancho: barras en HTML o línea en SVG con trazo de grosor constante. Cada barra/tramo lleva data-i (se puede tocar).
  grafico(vals,etq,{linea=false,alto=150,extra=null}={}){
    const n=Math.max(1,vals.length),todos=[...vals,...(extra||[])],hi=Math.max(1,...todos),lo=linea?Math.min(0,...todos):0,rg=(hi-lo)||1,pct=v=>Math.max(0,Math.min(100,(v-lo)/rg*100));
    const paso=Math.max(1,Math.ceil(n/6)),ejes=`<div class="gx">${etq.map((e,i)=>i%paso?'':`<span>${esc(e)}</span>`).join('')}</div>`;
    if(!linea)return `<div class="gr" style="height:${alto}px">${vals.map((v,i)=>`<div class="gc" data-i="${i}" title="${esc(etq[i])}: ${fmt(v)}"><div class="gb" style="height:${Math.max(1,pct(v))}%"></div>${extra&&extra[i]!=null?`<i class="gm" style="bottom:${pct(extra[i])}%"></i>`:''}</div>`).join('')}</div>${ejes}`;
    const x=i=>n>1?i/(n-1)*100:50,y=v=>96-pct(v)*0.92,pts=a=>a.map((v,i)=>`${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    const cero=lo<0?`<line x1="0" x2="100" y1="${y(0)}" y2="${y(0)}" class="g0"/>`:'';
    return `<div style="position:relative;height:${alto}px"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block">${cero}${extra?`<polyline class="gl gd" points="${pts(extra)}"/>`:''}<polyline class="gl" points="${pts(vals)}"/>${vals.map((v,i)=>`<rect x="${(i*100/n).toFixed(2)}" y="0" width="${(100/n).toFixed(2)}" height="100" fill="transparent" data-i="${i}"><title>${esc(etq[i])}: ${fmt(v)}</title></rect>`).join('')}</svg><span class="gmax">${fmt(hi)}</span></div>${ejes}`;
  }
};
// Número con formato libre: "1.234,56", "1,234.56", "$ 1234", "-50". null si está vacío, NaN si no es número.
UT.num=s=>{if(typeof s==='number')return s;s=String(s==null?'':s).trim();if(!s)return null;s=s.replace(/[^\d.,\-]/g,'');if(!/\d/.test(s))return NaN;const neg=s.startsWith('-');s=s.replace(/-/g,'');const lc=s.lastIndexOf(','),ld=s.lastIndexOf('.');let r;
  if(lc>-1&&ld>-1)r=lc>ld?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(lc>-1)r=(s.match(/,/g).length>1||/^\d{1,3}(,\d{3})+$/.test(s))?s.replace(/,/g,''):s.replace(',','.');
  else if(ld>-1)r=(s.match(/\./g).length>1||/^\d{1,3}(\.\d{3})+$/.test(s))?s.replace(/\./g,''):s;else r=s;
  const n=parseFloat(r);return isNaN(n)?NaN:(neg?-n:n)};
// Fecha en YYYY-MM-DD desde "2026-03-05", "05/03/2026", "5-3-26". null si vacía, NaN si no es una fecha real.
UT.fecha=s=>{s=String(s==null?'':s).trim();if(!s)return null;let y,m,d,x;if(x=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)){y=+x[1];m=+x[2];d=+x[3]}else if(x=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/)){d=+x[1];m=+x[2];y=+x[3];if(y<100)y+=2000}else return NaN;
  const t=new Date(Date.UTC(y,m-1,d));if(t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d)return NaN;return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`};
// CSV tolerante: detecta el separador (; , tab |), comillas, saltos de línea dentro de comillas y BOM.
UT.parseCSV=txt=>{txt=String(txt).replace(/^\ufeff/,'');const l1=txt.split(/\r?\n/,1)[0]||'';let del=[';',',','\t','|'].map(d=>[d,l1.split(d).length-1]).sort((a,b)=>b[1]-a[1])[0];del=del[1]?del[0]:',';
  const rows=[];let row=[],cur='',q=false;for(let i=0;i<txt.length;i++){const c=txt[i];
    if(q){if(c==='"'){if(txt[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c==='"'&&cur==='')q=true;else if(c===del){row.push(cur);cur=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(cur);cur='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[]}else cur+=c}
  row.push(cur);if(row.some(x=>x.trim()!==''))rows.push(row);return{delim:del,rows}};
// Cuenta corriente de un cliente: los pagos se aplican a las deudas más viejas primero. Devuelve saldo, deudas con su pendiente y antigüedad.
// Índice por cliente (ventas en cuenta corriente, pagos y cargos). Se reconstruye solo si cambian las cantidades o se recargan los datos.
UT._ix=null;UT._ixk='';UT._db=null;
UT.idx=()=>{const k=db.sales.length+'|'+db.pays.length+'|'+db.cargos.length;if(UT._ix&&UT._ixk===k&&UT._db===db)return UT._ix;const m=new Map(),g=id=>{let o=m.get(id);if(!o){o={s:[],p:[],c:[]};m.set(id,o)}return o};
  db.sales.forEach(s=>{if(s.cid!=null&&s.pay==='Cuenta corriente')g(s.cid).s.push(s)});db.pays.forEach(p=>g(p.cid).p.push(p));db.cargos.forEach(x=>g(x.cid).c.push(x));UT._ix=m;UT._ixk=k;UT._db=db;return m};
// Agrega un cargo manteniendo al día el índice (así no se reconstruye entero por cada cargo).
UT.pushCargo=c=>{db.cargos.push(c);if(UT._ix&&UT._db===db){let o=UT._ix.get(c.cid);if(!o){o={s:[],p:[],c:[]};UT._ix.set(c.cid,o)}o.c.push(c);UT._ixk=db.sales.length+'|'+db.pays.length+'|'+db.cargos.length}};
UT.cuenta=(cid,hoyK,ex)=>{hoyK=hoyK||UT.hoy();const deb=[],o=UT.idx().get(cid)||{s:[],p:[],c:[]};let cred=0;
  o.s.forEach(s=>{if(!s.void)deb.push({k:UT.dk(s.date),monto:s.total,ref:'v'+s.id,tipo:'venta',id:s.id})});
  o.c.forEach(x=>{if(ex&&ex.includes(x.id))return;if(x.amount>0)deb.push({k:UT.dk(x.date),monto:x.amount,ref:'g'+x.id,tipo:x.tipo||'cargo',id:x.id});else cred-=x.amount});
  o.p.forEach(p=>{cred+=p.amount});
  const totDeb=deb.reduce((a,b)=>a+b.monto,0),tot=cred;deb.sort((a,b)=>a.k<b.k?-1:a.k>b.k?1:0);
  const dias=k=>Math.round((new Date(hoyK+'T12:00:00')-new Date(k+'T12:00:00'))/864e5),ed={d0:0,d30:0,d60:0,d90:0};let mas=0;
  deb.forEach(d=>{const u=Math.min(cred,d.monto);d.pend=UT.r2(d.monto-u);cred-=u;d.dias=dias(d.k);if(d.pend>0.005){const b=d.dias<=30?'d0':d.dias<=60?'d30':d.dias<=90?'d60':'d90';ed[b]+=d.pend;mas=Math.max(mas,d.dias)}});
  return{saldo:UT.r2(totDeb-tot),deb,edades:ed,masVieja:mas}};
UT.notificar=(clave,texto)=>{if(typeof Notification==='undefined'||(db.cfg.encuesta&&db.cfg.encuesta.notif===false))return;db.cfg.avisos=db.cfg.avisos||{};const h=UT.hoy();if(db.cfg.avisos[clave]===h)return;db.cfg.avisos[clave]=h;save();
  const go=()=>{try{new Notification('StockProject',{body:texto})}catch(e){}};if(Notification.permission==='granted')go();else if(Notification.permission!=='denied')Notification.requestPermission().then(p=>{if(p==='granted')go()})};
UT.chk=(m,a)=>can(m,a)?true:(toast('Tu usuario no tiene permiso para esto'),false);
UT.tel=t=>String(t||'').replace(/[^\d]/g,'');

UT.addMes=(k,n)=>{const [y,m,d]=k.split('-').map(Number),t=new Date(Date.UTC(y,m-1+n,1)),ult=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();return `${t.getUTCFullYear()}-${String(t.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,ult)).padStart(2,'0')}`};
