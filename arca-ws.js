// Web services oficiales de ARCA (ex AFIP): WSAA (autenticación con el certificado del comercio) y WSFEv1 (factura electrónica).
// Solo corre en el proceso principal. No depende de Electron: recibe `post` (HTTP) para poder probarse con respuestas simuladas.
'use strict';
const forge = require('node-forge');

const URLS = {
  homologacion: { wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms', wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx' },
  produccion: { wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms', wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx' }
};
const NS = 'http://ar.gov.afip.dif.FEV1/';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
// Lectura mínima de XML (los servicios de ARCA devuelven XML plano y conocido): ignora el prefijo del espacio de nombres.
const re = n => new RegExp('<(?:[\\w-]+:)?' + n + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + n + '>', 'g');
const tags = (x, n) => [...String(x || '').matchAll(re(n))].map(m => m[1]);
const tag = (x, n) => { const t = tags(x, n); return t.length ? t[0] : null; };
const lista = (x, n, campos) => tags(x, n).map(b => Object.fromEntries(campos.map(c => [c, tag(b, c)])));

class ErrorArca extends Error { constructor(msg, extra) { super(msg); this.name = 'ErrorArca'; Object.assign(this, extra); } }
class SinConexion extends ErrorArca { constructor(msg) { super(msg || 'No hay conexión con ARCA. Probá de nuevo en un rato.', { sinConexion: true }); } }

// Mensajes en criollo para los fallos más comunes.
function criollo(msg) {
  const m = String(msg || '');
  if (/expir|vencid/i.test(m)) return 'El certificado venció. Generá uno nuevo en el asistente y subilo a ARCA. (' + m + ')';
  if (/no apareci[óo] CUIT|relaci[óo]n|autorizad[oa]|computador fiscal|no esta autorizado/i.test(m)) return 'El certificado no está asociado al servicio de factura electrónica (WSFE) de este CUIT. Revisá el paso "Asociar el certificado" de la guía. (' + m + ')';
  if (/punto de venta|PtoVta/i.test(m)) return 'El punto de venta no es válido: tiene que ser de tipo "Factura electrónica - Web Services" y estar habilitado en ARCA. (' + m + ')';
  if (/ya posee un TA/i.test(m)) return 'ARCA ya entregó un acceso reciente y todavía está vigente. Esperá unos minutos y reintentá. (' + m + ')';
  return m;
}

function armarTra(ahora, servicio = 'wsfe') {
  const f = t => new Date(t - 3 * 36e5).toISOString().slice(0, 19) + '-03:00';   // hora de Argentina (UTC-3, sin horario de verano)
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora / 1000)}</uniqueId><generationTime>${f(ahora - 6e5)}</generationTime><expirationTime>${f(ahora + 6e5)}</expirationTime></header><service>${servicio}</service></loginTicketRequest>`;
}

// Firma el TRA (CMS/PKCS#7 con el certificado y la clave del comercio) y lo devuelve en base64.
function firmarCms(tra, certPem, keyPem) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  const certificate = forge.pki.certificateFromPem(certPem);
  p7.addCertificate(certificate);
  p7.addSigner({ key: forge.pki.privateKeyFromPem(keyPem), certificate, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

const sobre = (cuerpo, ns) => `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${ns}"><soapenv:Header/><soapenv:Body>${cuerpo}</soapenv:Body></soapenv:Envelope>`;

module.exports = function ({ post, ahora = () => Date.now(), timeoutMs = 25000 }) {
  // post(url, {soapAction, body, timeoutMs}) -> { status, text }. Si la red falla, tira (se traduce a SinConexion).
  async function enviar(url, soapAction, body) {
    let r;
    try { r = await post(url, { soapAction, body, timeoutMs }); } catch (e) { throw new SinConexion('No hay conexión con ARCA (' + String((e && e.message) || e).slice(0, 80) + '). La factura queda pendiente y se reintenta sola.'); }
    const falla = tag(r.text, 'faultstring');
    if (falla) throw new ErrorArca(criollo(unesc(falla)), { fault: true });
    if (r.status >= 500 || !r.text) throw new SinConexion('ARCA no respondió bien (error ' + r.status + '). La factura queda pendiente y se reintenta sola.');
    return r.text;
  }

  // WSAA: devuelve { token, sign, exp } (vigencia ~12 h).
  async function login(ambiente, certPem, keyPem) {
    const cms = firmarCms(armarTra(ahora()), certPem, keyPem);
    const x = await enviar(URLS[ambiente].wsaa, '',
      `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`);
    const ta = unesc(tag(x, 'loginCmsReturn') || '');
    const token = tag(ta, 'token'), sign = tag(ta, 'sign'), exp = tag(ta, 'expirationTime');
    if (!token || !sign) throw new ErrorArca('ARCA no devolvió el acceso (token). Revisá el certificado.');
    return { token, sign, exp: exp ? Date.parse(exp) : ahora() + 11 * 36e5 };
  }

  const auth = (ta, cuit) => `<ar:Auth><ar:Token>${esc(ta.token)}</ar:Token><ar:Sign>${esc(ta.sign)}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
  const wsfe = async (ambiente, op, ta, cuit, extra = '') => enviar(URLS[ambiente].wsfe, NS + op, sobre(`<ar:${op}>${auth(ta, cuit)}${extra}</ar:${op}>`, NS));
  const erroresDe = x => lista(tag(x, 'Errors') || '', 'Err', ['Code', 'Msg']).map(e => ({ code: e.Code, msg: e.Msg }));
  const obsDe = x => lista(tag(x, 'Observaciones') || '', 'Obs', ['Code', 'Msg']).map(e => ({ code: e.Code, msg: e.Msg }));
  const sinErrores = x => { const e = erroresDe(x); if (e.length) throw new ErrorArca(criollo(e.map(i => i.msg).join(' · ')), { errores: e }); return x; };

  async function ultimoAutorizado(amb, ta, cuit, ptoVta, tipo) {
    const x = sinErrores(await wsfe(amb, 'FECompUltimoAutorizado', ta, cuit, `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo>`));
    return parseInt(tag(x, 'CbteNro'), 10) || 0;
  }
  async function consultar(amb, ta, cuit, ptoVta, tipo, nro) {
    const x = await wsfe(amb, 'FECompConsultar', ta, cuit, `<ar:FeCompConsReq><ar:CbteTipo>${tipo}</ar:CbteTipo><ar:CbteNro>${nro}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq>`);
    if (erroresDe(x).length || !tag(x, 'CodAutorizacion')) return null;   // no existe ese número
    return { cae: tag(x, 'CodAutorizacion'), vto: tag(x, 'FchVto'), fecha: tag(x, 'CbteFch'), total: parseFloat(tag(x, 'ImpTotal')), docNro: tag(x, 'DocNro') };
  }
  async function puntosVenta(amb, ta, cuit) {
    const x = sinErrores(await wsfe(amb, 'FEParamGetPtosVenta', ta, cuit));
    return lista(x, 'PtoVenta', ['Nro', 'EmisionTipo', 'Bloqueado', 'FchBaja']).map(p => ({ nro: +p.Nro, tipo: p.EmisionTipo, bloqueado: p.Bloqueado === 'S', baja: p.FchBaja && p.FchBaja !== 'NULL' ? p.FchBaja : '' }));
  }
  async function tiposComprobante(amb, ta, cuit) {
    const x = sinErrores(await wsfe(amb, 'FEParamGetTiposCbte', ta, cuit));
    return lista(x, 'CbteTipo', ['Id', 'Desc']).map(t => ({ id: +t.Id, desc: t.Desc }));
  }

  // c: { ptoVta, tipo, nro, fecha:'YYYYMMDD', total, neto, iva, alicuotaId, docTipo, docNro, condIvaReceptor, concepto }
  async function solicitarCae(amb, ta, cuit, c) {
    const conIva = c.iva > 0;
    const det = `<ar:FECAEDetRequest><ar:Concepto>${c.concepto || 1}</ar:Concepto><ar:DocTipo>${c.docTipo}</ar:DocTipo><ar:DocNro>${c.docNro}</ar:DocNro><ar:CbteDesde>${c.nro}</ar:CbteDesde><ar:CbteHasta>${c.nro}</ar:CbteHasta><ar:CbteFch>${c.fecha}</ar:CbteFch><ar:ImpTotal>${c.total.toFixed(2)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${c.neto.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${c.iva.toFixed(2)}</ar:ImpIVA><ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${c.condIvaReceptor}</ar:CondicionIVAReceptorId>${conIva ? `<ar:Iva><ar:AlicIva><ar:Id>${c.alicuotaId}</ar:Id><ar:BaseImp>${c.neto.toFixed(2)}</ar:BaseImp><ar:Importe>${c.iva.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>` : ''}</ar:FECAEDetRequest>`;
    const x = await wsfe(amb, 'FECAESolicitar', ta, cuit, `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${c.ptoVta}</ar:PtoVta><ar:CbteTipo>${c.tipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq>${det}</ar:FeDetReq></ar:FeCAEReq>`);
    const resultado = tag(tag(x, 'FeCabResp') || '', 'Resultado') || tag(x, 'Resultado');
    const d = tag(x, 'FECAEDetResponse') || '';
    const errores = erroresDe(x), obs = obsDe(d);
    if (resultado === 'A' && tag(d, 'CAE')) return { ok: true, cae: tag(d, 'CAE'), vto: tag(d, 'CAEFchVto'), nro: parseInt(tag(d, 'CbteDesde'), 10) || c.nro, observaciones: obs.map(o => o.msg) };
    const msgs = [...errores, ...obs].map(e => e.msg);
    return { ok: false, rechazo: true, err: criollo(msgs.join(' · ') || 'ARCA rechazó el comprobante'), errores: [...errores, ...obs] };
  }

  return { login, ultimoAutorizado, consultar, puntosVenta, tiposComprobante, solicitarCae };
};
module.exports.URLS = URLS;
module.exports.armarTra = armarTra;
module.exports.firmarCms = firmarCms;
module.exports.ErrorArca = ErrorArca;
module.exports.SinConexion = SinConexion;
