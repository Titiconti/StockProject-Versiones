// Caja que quedó abierta (cerraron con la X, se cortó la luz o falló el programa): se retoma, se avisa y el dueño puede cerrar la de otro.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, db, errs } = web();
  const ev = w.eval.bind(w);
  // Una caja abierta ayer por otro empleado y una propia de ayer.
  ev("CJ.fix();const ay=new Date(Date.now()-864e5).toISOString();db.cajas.push({id:db.cjid++,uid:7,user:'Ana',caja:'Caja 2',abre:ay,ini:100,movs:[]},{id:db.cjid++,uid:0,user:'Sin usuario',caja:'Caja 1',abre:ay,ini:50,movs:[]});draw()");
  assert.strictEqual(ev('CJ.abierta().ini'), 50, 'la caja propia se retoma tal como quedó');
  tab('v'); assert(/Abierta desde otro día/.test(txt('#cjbar')), 'la barra avisa que es de otro día');
  const av = ev('AV.lista().filter(x=>/quedó abierta/.test(x.txt)).length'); assert.strictEqual(av, 2, 'un aviso por cada caja sin cerrar de días anteriores');
  // En el navegador (demo web) cerrar la pestaña no se frena.
  const e = new w.Event('beforeunload', { cancelable: true }); w.dispatchEvent(e); assert.strictEqual(e.defaultPrevented, false);
  ev("CJ.app=()=>true"); const e2 = new w.Event('beforeunload', { cancelable: true }); w.dispatchEvent(e2); assert.strictEqual(e2.defaultPrevented, true, 'en el programa instalado se frena para preguntar'); ev("CJ.app=()=>false;CJ.close()");
  // Cerrar la caja de Ana desde el historial (sin usuarios activados, se puede editar la configuración).
  ev("$$('nav button').find(b=>b.dataset.t==='k').click()");
  const b = $('[data-cjc]'); assert(b, 'botón para cerrar cajas abiertas'); const id = ev("db.cajas.find(c=>c.user==='Ana').id");
  click(`[data-cjc="${id}"]`); assert(/caja de Ana/.test(txt('#cjov')));
  set('#cj_ct', '100'); click('#cj_cok');
  const ana = db().cajas.find(c => c.user === 'Ana'); assert(ana.cierre, 'quedó cerrada'); assert.strictEqual(ana.dif, 0); assert.strictEqual(ana.cerro, 'Sin usuario');
  assert(ev('CJ.abierta()'), 'la caja propia sigue abierta');
  // Sin permiso no se puede cerrar la de otro.
  ev("AU.habilitado=true;AU.usuario={id:9,nombre:'Beto'};AU.permisos={caja:['ver']}");
  assert.strictEqual(ev("CJ.puedeCerrar({uid:7})"), false); assert.strictEqual(ev("CJ.puedeCerrar({uid:9})"), true);
  ev("AU.habilitado=false");
  assert.deepStrictEqual(errs, []); console.log('CAJA_ABIERTA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
