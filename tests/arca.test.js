// Facturación electrónica ARCA: todo con respuestas SOAP simuladas (nunca se llama a ARCA real).
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), forge = require('node-forge');
const crear = require('../arca'), { firmarCms, armarTra } = require('../arca-ws');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-arca-')), archivo = path.join(tmp, 'arca-principal.json');
// "Protección" de prueba (en el programa real es Windows DPAPI): AES-256-GCM.
const KEY = crypto.randomBytes(32);
const proteger = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv), ct = Buffer.concat([c.update(t, 'utf8'), c.final()]); return 'T:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); };
const desproteger = t => { const b = Buffer.from(String(t).slice(2), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };

// ---- ARCA simulada ----
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tg = (x, n) => { const m = new RegExp('<(?:\\w+:)?' + n + '>([^<]*)<').exec(x); return m ? m[1] : null; };
const sim = { logins: 0, pedidos: [], emitidos: {}, caer: null, rechazar: null, observar: null, faultLogin: null, faultFe: null, ptos: [{ Nro: 3, Tipo: 'RECE para aplicativo y web services', Bloq: 'N' }] };
const clave = (t, p) => t + '/' + p;
async function post(url, { soapAction, body }) {
  if (sim.caer === 'todo') throw new TypeError('fetch failed');
  if (/LoginCms/.test(url)) {
    if (sim.faultLogin) return { status: 500, text: '<soapenv:Fault><faultstring>' + sim.faultLogin + '</faultstring></soapenv:Fault>' };
    sim.logins++;
    assert(/<wsaa:in0>[A-Za-z0-9+/=]{200,}<\/wsaa:in0>/.test(body), 'el TRA va firmado (CMS) en base64');
    const ta = '<loginTicketResponse><header/><credentials><token>TOKEN' + sim.logins + '</token><sign>SIGN</sign></credentials></loginTicketResponse>';
    return { status: 200, text: '<soapenv:Envelope><soapenv:Body><loginCmsResponse><loginCmsReturn>' + esc(ta) + '</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>' };
  }
  if (sim.faultFe) return { status: 500, text: '<s:Fault><faultstring>' + sim.faultFe + '</faultstring></s:Fault>' };
  const op = soapAction.split('/').pop(), R = x => ({ status: 200, text: '<soap:Envelope><soap:Body>' + x + '</soap:Body></soap:Envelope>' });
  assert(/<ar:Token>TOKEN\d+<\/ar:Token>/.test(body) && /<ar:Cuit>20111111112<\/ar:Cuit>/.test(body));
  const pto = tg(body, 'PtoVta'), tipo = tg(body, 'CbteTipo');
  if (op === 'FEParamGetPtosVenta') return R('<FEParamGetPtosVentaResponse><FEParamGetPtosVentaResult><ResultGet>' + sim.ptos.map(p => `<PtoVenta><Nro>${p.Nro}</Nro><EmisionTipo>${p.Tipo}</EmisionTipo><Bloqueado>${p.Bloq}</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta>`).join('') + '</ResultGet></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse>');
  if (op === 'FECompUltimoAutorizado') { const u = Math.max(0, ...Object.keys(sim.emitidos).filter(k => k.startsWith(clave(tipo, pto) + '/')).map(k => +k.split('/')[2])); return R(`<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>${pto}</PtoVta><CbteTipo>${tipo}</CbteTipo><CbteNro>${u}</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`); }
  if (op === 'FECompConsultar') { const nro = tg(body, 'CbteNro'), e = sim.emitidos[clave(tipo, pto) + '/' + nro]; return R(e ? `<FECompConsultarResponse><FECompConsultarResult><ResultGet><CodAutorizacion>${e.cae}</CodAutorizacion><FchVto>${e.vto}</FchVto><CbteFch>${e.fecha}</CbteFch><ImpTotal>${e.total}</ImpTotal><DocNro>${e.docNro}</DocNro></ResultGet></FECompConsultarResult></FECompConsultarResponse>` : '<FECompConsultarResponse><FECompConsultarResult><Errors><Err><Code>602</Code><Msg>No existe</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse>'); }
  if (op === 'FECAESolicitar') {
    sim.pedidos.push(body);
    const nro = +tg(body, 'CbteDesde'), total = tg(body, 'ImpTotal'), docNro = tg(body, 'DocNro');
    if (sim.rechazar) return R('<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code><Msg>' + sim.rechazar + '</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>');
    const cae = '7' + String(nro).padStart(13, '0'); sim.emitidos[clave(tipo, pto) + '/' + nro] = { cae, vto: '20261201', fecha: tg(body, 'CbteFch'), total, docNro };
    if (sim.caer === 'perderRespuesta') { sim.caer = null; throw new Error('timeout'); }   // ARCA lo autorizó pero la respuesta no llegó
    if (sim.caer === 'cortarAntes') { sim.caer = null; delete sim.emitidos[clave(tipo, pto) + '/' + nro]; throw new Error('timeout'); }
    return R(`<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>${nro}</CbteDesde><Resultado>A</Resultado><CAE>${cae}</CAE><CAEFchVto>20261201</CAEFchVto>${sim.observar ? '<Observaciones><Obs><Code>10063</Code><Msg>' + sim.observar + '</Msg></Obs></Observaciones>' : ''}</FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`);
  }
  throw new Error('operación inesperada ' + op);
}

// Certificado de prueba firmado por una "autoridad" propia a partir del CSR generado por el programa.
function certDesdeCsr(csrPem, { dias = 365, cuit = '20111111112' } = {}) {
  const csr = forge.pki.certificationRequestFromPem(csrPem), ca = forge.pki.rsa.generateKeyPair(1024), c = forge.pki.createCertificate();
  c.publicKey = csr.publicKey; c.serialNumber = '01'; c.validity.notBefore = new Date(Date.now() - 864e5); c.validity.notAfter = new Date(Date.now() + dias * 864e5);
  c.setSubject([{ name: 'commonName', value: 'stockproject' }, { name: 'serialNumber', value: 'CUIT ' + cuit }]); c.setIssuer([{ name: 'commonName', value: 'AC de prueba' }]); c.sign(ca.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(c);
}

(async () => {
  const A = crear({ archivo, proteger, desproteger, post });
  // ---- configuración ----
  assert(crear.cuitValido('20111111112') && !crear.cuitValido('20111111111') && !crear.cuitValido('123'));
  assert(/CUIT no es válido/.test(A.guardarConfig({ cuit: '20111111111', razon: 'X', condIva: 'monotributo' }).err));
  assert(A.guardarConfig({ cuit: '20111111112', razon: 'Kiosco Ana', condIva: 'monotributo', domicilio: 'Calle 1', ptoVta: 3 }).ok);
  assert.strictEqual(A.estado().cfg.ambiente, 'homologacion', 'homologación por defecto');
  assert(/producción primero cargá/.test(A.guardarConfig({ ambiente: 'produccion' }).err), 'producción exige certificado');
  assert(!A.estado().listo && !A.estado().tieneClave);

  // ---- clave privada y CSR ----
  const r = A.generarCsr(); assert(r.ok && /BEGIN CERTIFICATE REQUEST/.test(r.csr));
  const csr = forge.pki.certificationRequestFromPem(r.csr); assert(csr.verify(), 'CSR bien firmado'); const fld = n => csr.subject.attributes.find(a => a.name === n).value;
  assert.strictEqual(fld('countryName'), 'AR'); assert.strictEqual(fld('serialNumber'), 'CUIT 20111111112'); assert.strictEqual(fld('organizationName'), 'Kiosco Ana');
  const crudo = fs.readFileSync(archivo, 'utf8'); assert(!/PRIVATE KEY/.test(crudo), 'la clave privada no queda en claro en el disco');
  assert(JSON.parse(crudo).key.startsWith('T:')); assert(!JSON.stringify(A.estado()).includes('PRIVATE'), 'el estado no expone la clave');
  const A2 = crear({ archivo, proteger: () => { throw new Error('sin cifrado'); }, desproteger, post }); // si no se puede proteger, no se guarda una clave nueva
  assert.throws(() => A2.generarCsr({ regenerar: true })); assert(JSON.parse(fs.readFileSync(archivo, 'utf8')).key.startsWith('T:'));

  // ---- certificado ----
  assert(/no parece un certificado/.test(A.cargarCertificado('hola').err));
  const otro = crear({ archivo: path.join(tmp, 'otro.json'), proteger, desproteger, post }); otro.guardarConfig({ cuit: '20111111112', razon: 'Otro', condIva: 'monotributo', ptoVta: 3 });
  assert(/no corresponde al pedido/.test(A.cargarCertificado(certDesdeCsr(otro.generarCsr().csr)).err), 'certificado de otra clave');
  assert(/ya venció/.test(A.cargarCertificado(certDesdeCsr(r.csr, { dias: -2 })).err), 'certificado vencido');
  assert(/otro CUIT/.test(A.cargarCertificado(certDesdeCsr(r.csr, { cuit: '30500010912' })).err));
  const crt = certDesdeCsr(r.csr); assert(A.cargarCertificado('texto previo\n' + crt).ok); assert(A.estado().listo && !A.estado().vencido);
  assert(A.cargarCertificado(crt, 'produccion').ok && A.estado().certs.produccion && A.estado().certs.homologacion, 'un certificado por ambiente');
  assert(A.guardarConfig({ ambiente: 'produccion' }).ok && A.estado().cfg.ambiente === 'produccion'); assert(A.guardarConfig({ ambiente: 'homologacion' }).ok);
  assert(/Ya hay un certificado/.test(A.generarCsr().err), 'no pisa un certificado sin confirmar');

  // ---- firma del TRA ----
  { const cms = firmarCms(armarTra(Date.now()), crt, desproteger(JSON.parse(fs.readFileSync(archivo, 'utf8')).key)), der = Buffer.from(cms, 'base64'), p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary'))));
    assert(der.includes('<service>wsfe</service>'), 'el CMS contiene el TRA'); assert.strictEqual(p7.certificates.length, 1); }
  assert(/-03:00<\/generationTime>/.test(armarTra(Date.now())) && /<uniqueId>\d+<\/uniqueId>/.test(armarTra(Date.now())));

  // ---- conexión ----
  const p = await A.probar(); assert(p.ok && p.ptoVtaOk && p.ptos[0].nro === 3 && sim.logins === 1);
  A.guardarConfig({ ptoVta: 9 }); assert(!(await A.probar()).ptoVtaOk, 'punto de venta inexistente'); assert(/no existe en ARCA/.test((await A.probar()).ptoVtaMsg)); A.guardarConfig({ ptoVta: 3 });

  // ---- facturar: éxito (monotributo → Factura C) ----
  const venta = { id: 10, date: new Date().toISOString(), total: 1234.5, receptor: undefined };
  const f1 = await A.facturar(venta); assert(f1.ok, JSON.stringify(f1)); const fe = f1.fe;
  assert.deepStrictEqual([fe.tipo, fe.letra, fe.ptoVta, fe.nro, fe.amb], [11, 'C', 3, 1, 'homologacion']); assert(/^\d{14}$/.test(fe.cae) && fe.vto === '2026-12-01');
  const ped = sim.pedidos[0]; assert(/<ar:CbteTipo>11<\/ar:CbteTipo>/.test(ped) && /<ar:ImpTotal>1234.50<\/ar:ImpTotal>/.test(ped) && /<ar:ImpIVA>0.00<\/ar:ImpIVA>/.test(ped) && !/<ar:Iva>/.test(ped), 'C: sin IVA discriminado');
  assert(/<ar:DocTipo>99<\/ar:DocTipo><ar:DocNro>0<\/ar:DocNro>/.test(ped) && /<ar:CondicionIVAReceptorId>5<\/ar:CondicionIVAReceptorId>/.test(ped), 'consumidor final con condición del receptor');
  // QR oficial
  assert(fe.qr.startsWith('https://www.afip.gob.ar/fe/qr/?p=')); const q = JSON.parse(Buffer.from(fe.qr.split('?p=')[1], 'base64').toString());
  assert.deepStrictEqual(q, { ver: 1, fecha: fe.fecha, cuit: 20111111112, ptoVta: 3, tipoCmp: 11, nroCmp: 1, importe: 1234.5, moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: 'E', codAut: +fe.cae });
  assert(/<svg/.test(crear.qrSvg(fe.qr)), 'se dibuja el QR');
  // sin duplicar: la misma venta devuelve el mismo comprobante
  const f1b = await A.facturar(venta); assert(f1b.ok && f1b.repetido && f1b.fe.cae === fe.cae && sim.pedidos.length === 1, 'no se pide otro comprobante');
  const antes = sim.logins; await A.facturar({ id: 11, date: new Date().toISOString(), total: 10 }); assert.strictEqual(sim.logins, antes, 'no se pide un acceso nuevo en cada factura');

  // ---- rechazo ----
  sim.rechazar = 'Importe inválido'; const rc = await A.facturar({ id: 12, date: new Date().toISOString(), total: 50 }); sim.rechazar = null;
  assert(!rc.ok && rc.rechazo && /Importe inválido/.test(rc.err) && !rc.pendiente);
  const rc2 = await A.facturar({ id: 12, date: new Date().toISOString(), total: 50 }); assert(rc2.ok && rc2.fe.nro === 3, 'tras un rechazo se puede reintentar y usa el siguiente número libre');
  // ---- observaciones ----
  sim.observar = 'Observación de prueba'; const ob = await A.facturar({ id: 13, date: new Date().toISOString(), total: 70 }); sim.observar = null;
  assert(ob.ok && ob.fe.obs[0] === 'Observación de prueba');

  // ---- sin conexión y reintento sin duplicar ----
  const n0 = Object.keys(sim.emitidos).length;
  sim.caer = 'todo'; const off = await A.facturar({ id: 14, date: new Date().toISOString(), total: 80 }); sim.caer = null;
  assert(!off.ok && off.pendiente && /conexión/.test(off.err) && Object.keys(sim.emitidos).length === n0, 'sin internet: queda pendiente');
  // la respuesta se perdió pero ARCA SÍ autorizó
  sim.caer = 'perderRespuesta'; const tm = await A.facturar({ id: 15, date: new Date().toISOString(), total: 90 }); assert(!tm.ok && tm.pendiente, 'timeout: pendiente');
  assert.strictEqual(Object.keys(sim.emitidos).length, n0 + 1);
  const rr = await A.facturar({ id: 15, date: new Date().toISOString(), total: 90 }); assert(rr.ok && Object.keys(sim.emitidos).length === n0 + 1, 'el reintento recupera el CAE ya emitido, no crea otro comprobante');
  assert.strictEqual(rr.fe.cae, '7' + String(rr.fe.nro).padStart(13, '0'));
  // la respuesta se perdió y ARCA NO lo recibió
  sim.caer = 'cortarAntes'; assert((await A.facturar({ id: 16, date: new Date().toISOString(), total: 95 })).pendiente);
  const rn = await A.facturar({ id: 16, date: new Date().toISOString(), total: 95 }); assert(rn.ok && Object.keys(sim.emitidos).length === n0 + 2);
  // el mismo número jamás se repite
  const nros = Object.keys(sim.emitidos).map(k => +k.split('/')[2]); assert.strictEqual(new Set(nros).size, nros.length);

  // ---- errores claros ----
  sim.faultFe = 'ns1:coe.notAuthorized: Computador no autorizado a acceder al servicio'; const na = await A.facturar({ id: 20, date: new Date().toISOString(), total: 5 }); sim.faultFe = null;
  assert(!na.ok && !na.pendiente && /no está asociado al servicio/.test(na.err));
  assert(!(await A.facturar({ id: 21, date: new Date().toISOString(), total: 0 })).ok); assert(/CUIT del cliente/.test((await A.facturar({ id: 22, date: new Date().toISOString(), total: 5, receptor: { docTipo: 80, docNro: '123' } })).err));
  { // certificado que vence después de cargarlo
    const base = Date.now(); let t = base; const D = crear({ archivo: path.join(tmp, 'v.json'), proteger, desproteger, post, ahora: () => t }); D.guardarConfig({ cuit: '20111111112', razon: 'K', condIva: 'monotributo', ptoVta: 3 }); D.cargarCertificado(certDesdeCsr(D.generarCsr().csr, { dias: 30 }));
    t = base + 40 * 864e5; assert(D.estado().vencido && !D.estado().listo); assert(/venció/.test((await D.facturar({ id: 1, date: new Date().toISOString(), total: 5 })).err)); }

  // ---- responsable inscripto: A / B con IVA discriminado ----
  const RI = crear({ archivo: path.join(tmp, 'ri.json'), proteger, desproteger, post }); RI.guardarConfig({ cuit: '20111111112', razon: 'Ferretería SA', condIva: 'ri', ptoVta: 3, alicuota: 21 }); RI.cargarCertificado(certDesdeCsr(RI.generarCsr().csr));
  assert.deepStrictEqual(crear.importes({ condIva: 'ri', alicuota: 21 }, 121, 6), { total: 121, neto: 100, iva: 21, alicuotaId: 5 });
  const b = await RI.facturar({ id: 1, date: new Date().toISOString(), total: 121 }); assert(b.ok && b.fe.letra === 'B' && b.fe.iva === 21); let pd = sim.pedidos.pop();
  assert(/<ar:CbteTipo>6<\/ar:CbteTipo>/.test(pd) && /<ar:ImpNeto>100.00<\/ar:ImpNeto>/.test(pd) && /<ar:ImpIVA>21.00<\/ar:ImpIVA>/.test(pd) && /<ar:AlicIva><ar:Id>5<\/ar:Id><ar:BaseImp>100.00<\/ar:BaseImp><ar:Importe>21.00<\/ar:Importe>/.test(pd));
  const a = await RI.facturar({ id: 2, date: new Date().toISOString(), total: 242, receptor: { docTipo: 80, docNro: '30500010912', condIva: 1 } }); assert(a.ok && a.fe.letra === 'A' && a.fe.nro === 1, 'A y B tienen numeración propia');
  assert(/<ar:DocTipo>80<\/ar:DocTipo><ar:DocNro>30500010912<\/ar:DocNro>/.test(sim.pedidos.pop()));
  assert.strictEqual(crear.tipoDe({ condIva: 'monotributo' }, { docTipo: 80, condIva: 1 }), 11);

  console.log('arca.test.js OK');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
