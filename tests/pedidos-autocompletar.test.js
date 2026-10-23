const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert');
const dom=new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'),{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true});
const w=dom.window,d=w.document,$=s=>d.querySelector(s),click=s=>$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const key=(s,k)=>$(s).dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
const type=t=>{$('#op').value=t;$('#op').dispatchEvent(new w.Event('input',{bubbles:true}))};
const pickByMouse=()=>$('#osg').querySelector('[data-s]').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
const db=()=>JSON.parse(w.localStorage.getItem('stockproject_v2'));
const errs=[];w.addEventListener('error',e=>errs.push(e.message));
assert.strictEqual($('#op').tagName,'INPUT','ya no es una lista desplegable');
// cargar 300 productos
click('nav button[data-t=p]');
for(let i=1;i<=300;i++){$('#fn').value='Producto de prueba '+String(i).padStart(3,'0');$('#fp').value='100';$('#fm').value='1';$('#fs').value='5';click('#fg')}
assert.strictEqual(db().prods.length,306);
click('nav button[data-t=o]');
// sugerencias: limitadas a 8, sin tildes ni mayúsculas
type('PRODUCTO DE');assert(!$('#osg').classList.contains('hide'));assert.strictEqual($('#osg').querySelectorAll('[data-s]').length,8);
type('prueba 27');assert.strictEqual($('#osg').querySelectorAll('[data-s]').length,10-1+0>8?8:$('#osg').querySelectorAll('[data-s]').length);
type('prueba 277');assert.strictEqual($('#osg').querySelectorAll('[data-s]').length,1);assert(/Producto de prueba 277/.test($('#osg').textContent));
type('zzzz');assert($('#osg').classList.contains('hide'));
type('yerba');assert(/Yerba mate/.test($('#osg').textContent));type('7793010');assert(/Leche entera/.test($('#osg').textContent),'busca por código');
// flujo de teclado: nombre + Enter (elige) -> cantidad + Enter (agrega) -> vuelve al nombre
type('prueba 277');key('#op','Enter');assert.strictEqual($('#op').value,'Producto de prueba 277');assert($('#osg').classList.contains('hide'));
$('#oq').value='12';key('#oq','Enter');
assert.strictEqual($('#od').querySelectorAll('tbody tr').length,1);assert(/Producto de prueba 277/.test($('#od').textContent)&&/>12</.test($('#od').innerHTML));
assert.strictEqual($('#op').value,'');assert.strictEqual($('#oq').value,'');
// elegir con el mouse, y sumar a un producto ya agregado
type('prueba 277');pickByMouse();$('#oq').value='3';click('#oa');assert.strictEqual($('#od').querySelectorAll('tbody tr').length,1);assert(/>15</.test($('#od').innerHTML));
// escribir el nombre exacto sin elegir de la lista también sirve
$('#op').value='  yerba MATE 1 kg ';$('#oq').value='4';click('#oa');assert.strictEqual($('#od').querySelectorAll('tbody tr').length,2);
// errores claros
$('#op').value='cosa inexistente';$('#oq').value='2';click('#oa');assert(/lista/.test($('#toast').textContent));assert.strictEqual($('#od').querySelectorAll('tbody tr').length,2);
type('prueba 100');pickByMouse();$('#oq').value='';click('#oa');assert(/cantidad/.test($('#toast').textContent));assert.strictEqual($('#od').querySelectorAll('tbody tr').length,2);
// el pedido se guarda y se recibe igual que antes
$('#oq').value='6';click('#oa');$('#os').value='Mayorista';click('#og');
const o=db().orders[0];assert.strictEqual(o.items.length,3);assert.strictEqual(o.items.find(i=>i.name==='Producto de prueba 277').qty,15);
click('#ol [data-rv]');const n=o.items.length;for(let k=0;k<n;k++){$(`#ol [data-r='${k}']`).value=o.items[k].qty}click('#ol [data-ok]');
assert(db().orders[0].items.every(i=>i.rec===i.qty));assert(/Completo/.test($('#ol').textContent));
assert.deepStrictEqual(errs,[]);console.log('PEDIDOS_AUTOCOMPLETAR_OK');process.exit(0);
