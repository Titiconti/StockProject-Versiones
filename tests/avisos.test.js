// Avisos, preferencias de este equipo, tutorial de atajos e indicador de guardado (v3.0.0, fase 3).
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, tab, txt, db, errs } = web();
  const ev = w.eval.bind(w), abrir = () => { if ($('#avp').classList.contains('hide')) click('#avb'); };
  // demo: Leche L-001 vence en 8 días (no entra en 7), galletitas con stock bajo, pan sin stock (reposición alta)
  ev('draw()'); abrir(); let t = txt('#avp');
  assert(/stock bajo/.test(t) && /Galletitas/.test(t), 'stock bajo'); assert(/reposición con prioridad alta/.test(t)); assert(!/lotes? vencidos? en el inventario/.test(t));
  const n0 = +txt('#avn'); assert(n0 >= 2, 'contador de avisos nuevos');
  // un lote vencido y otro por vencer
  ev("db.prods.find(p=>p.id===3).lots[0].exp='2020-01-01';db.prods.find(p=>p.id===2).lots[0].exp=plus(3);draw()"); t = txt('#avp');
  assert(/1 lote vencido/.test(t) && /Baja de Stock|motivo Vencimiento/.test(t)); assert(/vence en los próximos 7 días: Agua mineral/.test(t));
  // diferencia de caja reciente
  ev('CJ.abrir(100);CJ.cerrar(90,"faltó cambio");draw()'); assert(/cerró con faltante de/.test(txt('#avp')));
  // "Visto": no se repite mientras no cambie; si cambia, vuelve
  const antes = +txt('#avn'); click('#avp [data-avok^="vencidos|"]'); assert.strictEqual(+txt('#avn'), antes - 1, 'visto baja el contador'); assert(!$('#avp [data-avok^="vencidos|"]'));
  ev("db.prods.find(p=>p.id===1).lots[0].exp='2020-01-02';draw()"); assert($('#avp [data-avok^="vencidos|"]') && /2 lotes vencidos/.test(txt('#avp')), 'cambió la cantidad: vuelve a avisar');
  // "Ver" lleva a la pantalla
  click('#avp [data-avir="e"]'); assert(!$('#e').classList.contains('hide') && $('#avp').classList.contains('hide'));
  // preferencias personales: ocultar un tipo de aviso, la ayuda de atajos y las animaciones (no tocan db.cfg)
  const cfg0 = JSON.stringify(db().cfg); abrir();
  const chk = (s, v) => { const c = $(s); c.checked = v; c.dispatchEvent(new w.Event('change', { bubbles: true })); };
  chk('#avp [data-avt="stock"]', false); assert(!/stock bajo/.test(txt('#avp')), 'tipo de aviso desactivado');
  chk('#av_at', false); tab('v'); assert($('#athelp').classList.contains('hide'), 'sin ayuda de atajos');
  abrir(); chk('#av_an', false); assert(!w.document.documentElement.classList.contains('anim'));
  assert.strictEqual(JSON.stringify(db().cfg), cfg0, 'las preferencias del equipo no cambian la configuración del negocio');
  assert.strictEqual(JSON.parse(w.localStorage.getItem('sp_prefs_equipo')).avisos.stock, false, 'se guardan en este equipo');
  // tutorial de atajos: se abre desde preferencias, Enter lo cierra y queda recordado
  abrir(); click('#av_tu'); assert(/F8/.test(txt('#avtu')));
  w.eval("$('#avtu').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))"); assert(!$('#avtu') && JSON.parse(w.localStorage.getItem('sp_prefs_equipo')).tutorial === true);
  // indicador de guardado: aparece si hay cambios pendientes un rato
  ev('pending=1'); await new Promise(r => setTimeout(r, 600)); assert(!$('#guard').classList.contains('hide'), 'Guardando…'); ev('pending=0'); await new Promise(r => setTimeout(r, 300)); assert($('#guard').classList.contains('hide'));
  assert.deepStrictEqual(errs, []);
  console.log('AVISOS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
