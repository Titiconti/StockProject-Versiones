const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true});
const w=dom.window,d=w.document,$=s=>d.querySelector(s),click=s=>{const e=typeof s==='string'?$(s):s;e.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};
const errs=[];w.addEventListener('error',e=>errs.push(e.message));
// pestañas
const tabs=[...d.querySelectorAll('nav button')].map(b=>b.dataset.t);assert.deepStrictEqual(tabs,['v','i','p','o','c','e','r']);
assert(!$('#i').querySelector('#fg'),'el formulario ya no está en Inventario');assert($('#p').querySelector('#fg'),'el formulario está en Productos');
// agregar producto desde la pestaña Productos
click('nav button[data-t=p]');assert(!$('#p').classList.contains('hide')&&$('#i').classList.contains('hide'));
$('#fn').value='Fideos 500 g';$('#fp').value='1500';$('#fm').value='5';$('#fs').value='0';click('#fg');
const db=()=>JSON.parse(w.localStorage.getItem('stockproject_v2'));
assert(db().prods.some(p=>p.name==='Fideos 500 g'));
const fid=db().prods.find(p=>p.name==='Fideos 500 g');
// armar pedido
click('nav button[data-t=o]');
$('#os').value='Distribuidora Sur';
const add=(pid,q)=>{$('#op').value=db().prods.find(p=>p.id===pid).name;$('#oq').value=String(q);click('#oa')};
add(fid.id,20);add(1,10);assert.strictEqual($('#od').querySelectorAll('tbody tr').length,2);
click('#og');let o=db().orders[0];assert.strictEqual(o.items.length,2);assert.strictEqual(o.supplier,'Distribuidora Sur');
assert($('nav button[data-t=o]').textContent==='Pedidos (1)');
// recibir parcialmente: 12 de fideos (vence), 10 de coca
click('#ol [data-rv]');
const setr=(k,q,n,x)=>{$(`#ol [data-r='${k}']`).value=q;$(`#ol [data-n='${k}']`).value=n;$(`#ol [data-x='${k}']`).value=x};
const stock0=db().prods.find(p=>p.id===1).lots.reduce((a,l)=>a+l.qty,0);
setr(0,12,'F-1','2027-03-01');setr(1,10,'C-9','');
click('#ol [data-ok]');
o=db().orders[0];assert.strictEqual(o.items[0].rec,12);assert.strictEqual(o.items[1].rec,10);
assert(/Faltan 8/.test($('#ol').textContent),'muestra faltantes');assert(/Parcial/.test($('#ol').textContent));
const f2=db().prods.find(p=>p.id===fid.id);assert.strictEqual(f2.lots[0].qty,12);assert.strictEqual(f2.lots[0].exp,'2027-03-01');
assert.strictEqual(db().prods.find(p=>p.id===1).lots.reduce((a,l)=>a+l.qty,0),stock0+10);
// segunda recepción: llegan los 8 que faltaban
click('#ol [data-rv]');setr(0,8,'F-2','2027-04-01');click('#ol [data-ok]');
o=db().orders[0];assert.strictEqual(faltanTotal(o),0);function faltanTotal(o){return o.items.reduce((a,i)=>a+Math.max(0,i.qty-i.rec),0)}
assert(/Completo/.test($('#ol').textContent));assert.strictEqual($('nav button[data-t=o]').textContent,'Pedidos');
assert.strictEqual(db().prods.find(p=>p.id===fid.id).lots.length,2);
// cerrar con faltantes (2 pasos)
add(2,5);click('#og');click('#ol [data-cl]');assert(/Seguro\? Cerrar/.test($('#ol').textContent));click('#ol [data-cl]');
assert(db().orders[1].closed===true&&/Cerrado con faltantes/.test($('#ol').textContent));
// eliminar (2 pasos)
const n=db().orders.length;click('#ol [data-del]');assert.strictEqual(db().orders.length,n);click('#ol [data-del]');assert.strictEqual(db().orders.length,n-1);
// editar desde Inventario lleva a Productos y vuelve al guardar
click('nav button[data-t=i]');click('#inv [data-e]');assert(!$('#p').classList.contains('hide'));
$('#fp').value='999';click('#fg');assert(!$('#i').classList.contains('hide'),'vuelve a Inventario');
// venta con lote recibido sigue funcionando
click('nav button[data-t=v]');click('#prods .p:not([disabled])');click('#cobrar');assert.strictEqual(db().sales.length,1);
assert.deepStrictEqual(errs,[]);console.log('PEDIDOS_OK');process.exit(0);
