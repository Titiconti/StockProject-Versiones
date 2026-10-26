const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, pick, tab, txt, f, db, errs } = web();
  const lotes = id => db().prods.find(p => p.id === id).lots.map(l => `${l.n}:${l.qty}`).sort().join(',');
  const stock = id => db().prods.find(p => p.id === id).lots.reduce((a, l) => a + l.qty, 0);
  const hoy = w.eval('plus(0)'), fD = d => w.eval(`fD('${d}')`), dia = iso => w.eval(`ld('${iso}')`);
  assert.strictEqual(lotes(5), 'L-001:6,L-002:12');   // Leche: vence antes L-001 (6 u.), después L-002 (12 u.)
  tab('e'); assert(!$('#e').classList.contains('hide'));
  assert($('#eg').disabled, 'sin productos no se puede registrar');
  // ---- ya no pide el nombre de la escuela; muestra la fecha del desvío (hoy por defecto) ----
  assert.strictEqual($('#ed'), null, 'no hay campo de nombre de escuela'); assert(!/Escuela \/ destino|Destino/.test(txt('#e')), 'no se menciona un destino');
  assert.strictEqual($('#edf').value, hoy, 'la fecha arranca en hoy'); assert.strictEqual($('#edf').max, hoy, 'no se puede elegir una fecha futura en el calendario'); assert(/Fecha del desvío/.test(txt('#e')));

  // armar el desvío escribiendo (con sugerencias)
  $('#en').value = 'Copa de leche';
  set('#ep', 'leche'); assert(/Disponible 18/.test(txt('#esg'))); pick('#esg'); assert.strictEqual($('#ep').value, 'Leche entera 1 L');
  $('#eq').value = '8'; click('#ea'); assert(/Leche entera 1 L/.test(txt('#et')) && !$('#eg').disabled);
  $('#ep').value = 'zzz'; $('#eq').value = '1'; click('#ea'); assert(/lista/.test($('#toast').textContent), 'producto inexistente');
  set('#ep', 'leche'); pick('#esg'); $('#eq').value = '11'; click('#ea'); assert(/Stock insuficiente: disponible 18/.test($('#toast').textContent), 'no deja pasar el stock disponible (8 ya en el borrador)');
  $('#eq').value = '10'; click('#ea'); assert(/>18</.test($('#et').innerHTML), 'suma al producto ya agregado (8 + 10)');
  click('#et [data-k]'); assert(!/Leche/.test(txt('#et')), 'se puede quitar');
  set('#ep', 'leche ENTERA 1 l'); $('#eq').value = '8'; click('#ea');            // nombre exacto sin elegir de la lista
  set('#ep', 'yerba'); pick('#esg'); $('#eq').value = '2'; click('#ea');

  // registrar SIN escribir ningún nombre: descuenta stock (primero el lote que vence antes), NO es una venta, y queda registrado con su fecha
  const ventas0 = db().sales.length, caja0 = JSON.stringify(db().sales);
  click('#eg');
  assert.strictEqual(lotes(5), 'L-002:10', 'FEFO: 6 de L-001 y 2 de L-002'); assert.strictEqual(stock(3), 10);
  assert.strictEqual(db().sales.length, ventas0, 'no se registra como venta'); assert.strictEqual(JSON.stringify(db().sales), caja0);
  const v = db().desv[0]; assert(v && v.note === 'Copa de leche' && v.items.length === 2 && !v.void && v.dest === undefined, 'no guarda nombre de escuela');
  assert.strictEqual(dia(v.date), hoy, 'se guardó con la fecha de hoy'); assert(Math.abs(Date.now() - new Date(v.date)) < 60e3, 'hoy: con la hora real');
  assert.deepStrictEqual([v.items[0].qty, v.items[0].cost], [8, 1200], 'guarda el costo del momento'); assert(v.items[0].lots.length === 2, 'recuerda de qué lotes salió');
  assert(txt('#el').includes(fD(hoy)), 'el listado muestra la fecha del desvío'); assert(/8 x Leche entera 1 L/.test(txt('#el')) && /Copa de leche/.test(txt('#el')) && txt('#el').includes(f(8 * 1200 + 2 * 4800)), 'listado con detalle, nota y costo total');
  assert(txt('#elp').includes(f(19200)) && /1 desvío registrado/.test(txt('#elp')));
  assert(new RegExp('Desvío registrado el ' + fD(hoy).replace(/\//g, '\\/')).test($('#toast').textContent), 'el aviso incluye la fecha'); assert($('#eg').disabled && !/Leche/.test(txt('#et')), 'el borrador queda vacío');
  assert.strictEqual($('#edf').value, hoy, 'la fecha vuelve a hoy');
  tab('v'); assert(/10/.test(txt('#prods')), 'el stock descontado se ve en Ventas');

  // ---- desvío de una fecha anterior (por ejemplo, cargar uno que se olvidaron de registrar) ----
  tab('e'); const hace5 = w.eval('plus(-5)');
  set('#ep', 'agua'); pick('#esg'); $('#eq').value = '3'; click('#ea'); $('#edf').value = hace5; click('#eg');
  const v2 = db().desv[1]; assert.strictEqual(dia(v2.date), hace5, 'quedó con la fecha elegida'); assert.strictEqual(stock(2), 37); assert.strictEqual(v2.note, '');
  assert(txt('#el').includes(fD(hace5)), 'la fecha anterior aparece en el listado');
  const filas = [...w.document.querySelectorAll('#el tr')].map(tr => tr.textContent); assert(filas[0].includes(fD(hoy)) && filas[1].includes(fD(hace5)), 'ordenados del más reciente al más antiguo, aunque se hayan cargado al revés');
  // ---- fecha futura: no se acepta y no toca el stock ----
  set('#ep', 'agua'); pick('#esg'); $('#eq').value = '2'; click('#ea'); $('#edf').value = w.eval('plus(2)'); click('#eg');
  assert(/no puede ser futura/.test($('#toast').textContent)); assert.strictEqual(db().desv.length, 2); assert.strictEqual(stock(2), 37, 'no descontó stock'); assert(/Agua mineral/.test(txt('#et')), 'el borrador sigue ahí');
  $('#edf').value = hoy; click('#eg'); assert.strictEqual(db().desv.length, 3); assert.strictEqual(stock(2), 35);

  // no se puede desviar más de lo que hay
  set('#ep', 'pan'); pick('#esg'); $('#eq').value = '1'; click('#ea'); assert(/Stock insuficiente: disponible 0/.test($('#toast').textContent), 'sin stock');
  // lotes vencidos no se pueden desviar
  w.eval("db.prods.find(p=>p.id===4).lots[0].exp='2020-01-01'");
  set('#ep', 'galletitas'); pick('#esg'); $('#eq').value = '1'; click('#ea'); assert(/disponible 0/.test($('#toast').textContent), 'lote vencido no disponible');

  // ---- reportes: el período respeta la fecha del desvío; el PDF muestra la fecha y no un destino ----
  tab('r'); const per = v => { $('#per').value = v; w.eval("$('#per').dispatchEvent(new Event('change'))"); };
  per('0'); assert(txt('#kpis').includes(f(19200 + 2 * 700)), 'hoy: solo los desvíos de hoy (el de hace 5 días no entra)');
  per('7'); assert(txt('#kpis').includes(f(19200 + 3 * 700 + 2 * 700)), 'últimos 7 días: entra también el de hace 5 días');
  const pdf = w.eval('buildReport()').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert(/Desvíos a escuela/.test(pdf) && pdf.includes(fD(hoy)) && pdf.includes(fD(hace5)) && /Total desviado/.test(pdf) && !/Destino/.test(pdf), 'PDF con fechas y sin columna de destino');
  assert(pdf.indexOf(fD(hace5)) < pdf.lastIndexOf(fD(hoy)), 'en el PDF van del más antiguo al más nuevo');
  // desvíos registrados con versiones anteriores (que sí tenían escuela) siguen viéndose
  w.eval("db.desv.push({id:99,date:new Date().toISOString(),dest:'Escuela Vieja N° 5',note:'',items:[{id:2,name:'Agua mineral 500 ml',qty:1,cost:700,lots:[]}]});draw()");
  tab('e'); assert(/Escuela Vieja N° 5/.test(txt('#el')), 'un desvío antiguo conserva su destino como nota'); per('0');
  assert(/Escuela Vieja N° 5/.test(w.eval('buildReport()')));
  assert.strictEqual(db().sales.length, 0, 'los desvíos no aparecen como ventas'); tab('r'); assert(!/Escuela/.test(txt('#hist')));

  // ---- anular devuelve el stock a los mismos lotes ----
  tab('e'); const anular = id => { const b = [...w.document.querySelectorAll('#el [data-v]')].find(x => x.dataset.v == id); click(b); return b; };
  const id1 = db().desv[0].id; anular(id1); assert(!db().desv.find(x => x.id === id1).void, 'pide confirmación'); anular(id1);
  assert(db().desv.find(x => x.id === id1).void); assert.strictEqual(lotes(5), 'L-001:6,L-002:12', 'volvió exactamente a sus lotes'); assert.strictEqual(stock(3), 12);
  assert(/Anulado/.test(txt('#el')) && !w.document.querySelector('#el [data-v="' + id1 + '"]'), 'queda marcado y no se anula dos veces');
  tab('r'); per('0'); assert(!txt('#kpis').includes(f(19200)), 'el anulado deja de contar'); assert.deepStrictEqual(errs, []);
  console.log('ESCUELA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
