const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
function boot(desktop){const printed=[];const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,beforeParse(w){require('./helpers').autoRec(w);
 w.print=()=>printed.push('window.print');
 if(desktop){let store='';w.sp={load:()=>store,save:s=>{store=s},defaults:()=>({demo:true}),info:async()=>({dir:'C:\\x',last:null,warn:''}),now:async()=>({}),choose:async()=>({}),restore:async()=>true,print:async (h,o)=>{printed.push(h);printed.opts=o;return{ok:true}}}}}});
 return{w:dom.window,printed}}
const run=async(desktop)=>{const{w,printed}=boot(desktop),d=w.document,$=s=>d.querySelector(s),click=s=>$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true})),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const errs=[];w.addEventListener('error',e=>errs.push(e.message));
 assert($('#pv').classList.contains('hide'),'oculta al inicio');
 // cobrar SIN la tilde: no aparece nada
 click('#prods .p:not([disabled])');click('#cobrar');await wait(150);assert($('#pv').classList.contains('hide'));assert.strictEqual(printed.length,0);
 // cobrar CON la tilde: muestra la vista previa y NO imprime todavía
 $('#prt').checked=true;click('#prods .p:not([disabled])');click('#cobrar');await wait(150);
 assert(!$('#pv').classList.contains('hide'),'muestra la vista previa');assert(/TOTAL/.test($('#pvb').textContent)&&/StockProject/.test($('#pvb').textContent)&&/no válido como factura/.test($('#pvb').textContent));
 assert.strictEqual(printed.length,0,'no imprime sin confirmar');
 // "No imprimir" cierra y no imprime
 click('#pvc');assert($('#pv').classList.contains('hide'));await wait(150);assert.strictEqual(printed.length,0);
 // reabrir desde el historial, cambiar a papel de 58 mm e imprimir
 click('nav button[data-t=r]');click('#hist [data-p]');assert(!$('#pv').classList.contains('hide'));
 assert.strictEqual($('#pvb').style.width,'80mm');
 $('#pvw').value='48';$('#pvw').dispatchEvent(new w.Event('change',{bubbles:true}));assert.strictEqual($('#pvb').style.width,'56mm');
 click('#pvp');await wait(250);assert($('#pv').classList.contains('hide'));assert.strictEqual(printed.length,1,'imprime una vez al confirmar');
 if(desktop){assert(/width:48mm/.test(printed[0])&&/<html>/.test(printed[0])&&/TOTAL/.test(printed[0]),'el documento enviado usa 58 mm')}else{assert.strictEqual(printed[0],'window.print');assert.strictEqual($('#tk').style.width,'48mm')}
 // la elección de ancho se recuerda y no se pierde al guardar datos del comercio
 $('#shn').value='Kiosco Pepe';click('#ss');click('#hist [data-p]');assert.strictEqual($('#pvw').value,'48');assert(/Kiosco Pepe/.test($('#pvb').textContent));
 // Escape cierra
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert($('#pv').classList.contains('hide'));
 
 // ----- HOJA A4 -----
 click('#hist [data-p]');$('#pvw').value='a4';$('#pvw').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.strictEqual($('#pvb').className,'pa4');assert(/Descripción/.test($('#pvb').textContent)&&/Precio unitario/.test($('#pvb').textContent)&&/Subtotal/.test($('#pvb').textContent)&&/TOTAL/.test($('#pvb').textContent)&&/Kiosco Pepe/.test($('#pvb').textContent),'comprobante A4 completo');
 assert.strictEqual($('#pvcard').style.maxWidth,'720px');assert(/\.a4/.test($('#pva').textContent));
 const n0=printed.length;click('#pvp');await wait(250);assert.strictEqual(printed.length,n0+1);
 if(desktop){const doc=printed[printed.length-1];assert(/<table>/.test(doc)&&/@page\{margin:0\}/.test(doc)&&/padding:15mm/.test(doc),'documento A4');assert.strictEqual(JSON.stringify(printed.opts),'{"a4":true}')}
 else{assert(/size:A4/.test($('#pgs').textContent));assert.strictEqual($('#tk').style.width,'180mm')}
 // se recuerda A4 y se puede volver al ticket angosto
 click('#hist [data-p]');assert.strictEqual($('#pvw').value,'a4');
 $('#pvw').value='72';$('#pvw').dispatchEvent(new w.Event('change',{bubbles:true}));assert.strictEqual($('#pvb').className,'');assert.strictEqual($('#pvb').style.width,'80mm');assert.strictEqual($('#pvcard').style.maxWidth,'440px');
 click('#pvp');await wait(250);if(desktop){assert.strictEqual(JSON.stringify(printed.opts),'{"a4":false}');assert(!/<table>/.test(printed[printed.length-1]))}else assert.strictEqual($('#pgs').textContent,'');
 assert.deepStrictEqual(errs,[]);};
(async()=>{await run(false);console.log('WEB_OK');process.exit(0);await run(true);console.log('ESCRITORIO_OK');process.exit(0)})().catch(e=>{console.log('FALLO',e.message);process.exit(1)});
