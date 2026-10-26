const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert');
const dom=new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'),{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true});
const w=dom.window,d=w.document,$=s=>d.querySelector(s),ev=(s,t,o)=>$(s).dispatchEvent(new w.Event(t,{bubbles:true,...o})),click=s=>(typeof s==='string'?$(s):s).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const errs=[];w.addEventListener('error',e=>errs.push(e.message));
const db=()=>JSON.parse(w.localStorage.getItem('stockproject_v2'));
const stock=id=>db().prods.find(p=>p.id===id).lots.reduce((a,l)=>a+l.qty,0);
click('nav button[data-t=p]');
// sugerencias al escribir (sin tildes ni mayúsculas)
$('#fn').value='LECHE';ev('#fn','input');
assert(!$('#sg').classList.contains('hide'),'muestra sugerencias');assert(/Leche entera/.test($('#sg').textContent));
$('#fn').value='cóca';ev('#fn','input');assert(/Coca-Cola/.test($('#sg').textContent),'ignora tildes');
$('#fn').value='7790387';ev('#fn','input');assert(/Yerba/.test($('#sg').textContent),'busca por código');
$('#fn').value='zzz';ev('#fn','input');assert($('#sg').classList.contains('hide'),'sin coincidencias no muestra');
// elegir sugerencia: autocompleta nombre, código, precio y mínimo
$('#fn').value='yerba';ev('#fn','input');
$('#sg').querySelector('[data-s]').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
assert.strictEqual($('#fn').value,'Yerba mate 1 kg');assert.strictEqual($('#fc').value,'7790387');assert.strictEqual($('#fp').value,'6900');assert.strictEqual($('#fm').value,'4');
assert(/Agregar stock a: Yerba/.test($('#ft').textContent)&&/stock actual: 12/.test($('#ft').textContent));
// sumar stock con lote y vencimiento
const s0=12;$('#fs').value='30';$('#fl').value='Y-77';$('#fv').value='2027-05-10';click('#fg');
assert.strictEqual(stock(3),s0+30);const l=db().prods.find(p=>p.id===3).lots.find(x=>x.n==='Y-77');assert(l&&l.exp==='2027-05-10'&&l.qty===30);
assert(!$('#p').classList.contains('hide'),'se queda en Productos');assert.strictEqual($('#fn').value,'','formulario limpio');assert.strictEqual(db().prods.length,6,'no creó duplicado');
// mismo lote y vencimiento se suma
$('#fn').value='yerba';ev('#fn','input');$('#sg').querySelector('[data-s]').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
$('#fs').value='5';$('#fl').value='Y-77';$('#fv').value='2027-05-10';click('#fg');assert.strictEqual(db().prods.find(p=>p.id===3).lots.find(x=>x.n==='Y-77').qty,35);
// no deja crear un duplicado por nombre
$('#fn').value='  yerba MATE 1 kg ';$('#fp').value='1';click('#fg');assert.strictEqual(db().prods.length,6);assert(/ya existe/i.test($('#toast').textContent));
// producto nuevo sigue funcionando (con lote opcional)
$('#fn').value='Arroz 1 kg';ev('#fn','input');$('#fc').value='123';$('#fp').value='2100';$('#fm').value='3';$('#fs').value='10';click('#fg');
const ar=db().prods.find(p=>p.name==='Arroz 1 kg');assert(ar&&ar.code==='123'&&ar.min===3&&stock(ar.id)===10&&ar.lots[0].n==='Inicial');
// sin cantidad solo actualiza datos (precio) del existente
$('#fn').value='arroz';ev('#fn','input');$('#sg').querySelector('[data-s]').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
$('#fp').value='2300';click('#fg');assert.strictEqual(db().prods.find(p=>p.id===ar.id).price,2300);assert.strictEqual(stock(ar.id),10);
// Editar desde Inventario: lleva a Productos y vuelve a Inventario al guardar
click('nav button[data-t=i]');click('#inv [data-e]');assert(!$('#p').classList.contains('hide'));assert(/Agregar stock a/.test($('#ft').textContent));
$('#fs').value='2';click('#fg');assert(!$('#i').classList.contains('hide'));
// Limpiar sale del modo existente y vuelve a sugerir
click('nav button[data-t=p]');$('#fn').value='coca';ev('#fn','input');$('#sg').querySelector('[data-s]').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));click('#fx');
assert.strictEqual($('#fn').value,'');assert(/Agregar producto o stock/.test($('#ft').textContent));
assert.deepStrictEqual(errs,[]);console.log('SUGERENCIAS_OK');process.exit(0);
