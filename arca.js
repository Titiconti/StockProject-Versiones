// Facturación electrónica con ARCA (ex AFIP) para UN comercio: configuración, clave privada y certificado, emisión sin duplicados y QR.
// Corre solo en el proceso principal. La clave privada se guarda protegida (proteger/desproteger = Windows DPAPI vía safeStorage) y nunca sale del equipo.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), forge = require('node-forge');
const ws = require('./arca-ws');

const CONDICIONES = ['monotributo', 'ri'];                       // condición del comercio frente al IVA (emisor)
const MODOS = ['manual', 'siempre', 'clientes'];                 // cuándo se factura
const ALICUOTAS = { 0: 3, 2.5: 9, 5: 8, 10.5: 4, 21: 5, 27: 6 };  // % -> id de ARCA
const COND_RECEPTOR = [1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16];       // 5 = consumidor final
const DOC_TIPOS = [80, 86, 96, 99];                              // CUIT, CUIL, DNI, sin identificar
const LETRA = { 1: 'A', 6: 'B', 11: 'C' };
const QR_URL = 'https://www.afip.gob.ar/fe/qr/?p=';
const DIAS_FECHA = 5;                                            // ARCA acepta fechas de hasta 5 días antes (productos)

function cuitValido(c) {
  c = String(c || '');
  if (!/^\d{11}$/.test(c)) return false;
  const p = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], s = p.reduce((a, w, i) => a + w * +c[i], 0);
  const dv = 11 - (s % 11);
  return (dv === 11 ? 0 : dv) === +c[10];
}
const r2 = n => Math.round(n * 100) / 100;
const ymd = (d) => new Date(d - new Date(d).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Factura C para monotributo; A (receptor inscripto/monotributo con CUIT) o B para responsable inscripto.
function tipoDe(cfg, r) {
  if (cfg.condIva === 'monotributo') return 11;
  return r.docTipo === 80 && [1, 6, 13, 16].includes(r.condIva) ? 1 : 6;
}
// Los precios del programa llevan IVA incluido: en A y B se separa el neto; en C no se discrimina IVA.
function importes(cfg, total, tipo) {
  total = r2(total);
  if (tipo === 11) return { total, neto: total, iva: 0, alicuotaId: 0 };
  const al = +cfg.alicuota, neto = r2(total / (1 + al / 100));
  return { total, neto, iva: r2(total - neto), alicuotaId: ALICUOTAS[al] };
}
function armarQr(fe, total) {
  const j = { ver: 1, fecha: fe.fecha, cuit: +fe.emisor.cuit, ptoVta: fe.ptoVta, tipoCmp: fe.tipo, nroCmp: fe.nro, importe: r2(total), moneda: 'PES', ctz: 1,
    tipoDocRec: fe.receptor.docTipo, nroDocRec: +fe.receptor.docNro || 0, tipoCodAut: 'E', codAut: +fe.cae };
  return QR_URL + Buffer.from(JSON.stringify(j)).toString('base64');
}
function qrSvg(url) {
  const qr = require('qrcode-generator')(0, 'M'); qr.addData(String(url)); qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}
function receptorOk(r) {
  r = r || {};
  const docTipo = r.docTipo == null ? 99 : +r.docTipo, condIva = r.condIva == null ? 5 : +r.condIva, docNro = docTipo === 99 ? '0' : String(r.docNro || '').replace(/\D/g, '');
  if (!DOC_TIPOS.includes(docTipo)) return { err: 'Tipo de documento inválido' };
  if (!COND_RECEPTOR.includes(condIva)) return { err: 'Condición frente al IVA del cliente inválida' };
  if (docTipo === 80 && !cuitValido(docNro)) return { err: 'El CUIT del cliente no es válido' };
  if (docTipo === 96 && !/^\d{7,8}$/.test(docNro)) return { err: 'El DNI del cliente no es válido' };
  if (docTipo === 86 && !/^\d{11}$/.test(docNro)) return { err: 'El CUIL del cliente no es válido' };
  return { r: { docTipo, docNro, condIva } };
}

module.exports = function ({ archivo, proteger, desproteger, post, ahora = () => Date.now() }) {
  const api = ws({ post, ahora });
  const leer = () => { try { return JSON.parse(fs.readFileSync(archivo, 'utf8')) } catch (e) { return {} } };
  const escribir = d => { fs.mkdirSync(path.dirname(archivo), { recursive: true }); const t = archivo + '.tmp'; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, archivo); };
  const cfgDe = d => ({ ambiente: 'homologacion', modo: 'manual', alicuota: 21, ...(d.cfg || {}) });
  const crtDe = (d, amb) => (d.crts || {})[amb], hayCert = d => Object.keys(d.crts || {}).length > 0;   // un certificado por ambiente (el de homologación y el de producción son distintos; la clave es la misma)
  const listoDe = d => !!(d.key && crtDe(d, cfgDe(d).ambiente) && d.cfg && d.cfg.cuit && d.cfg.ptoVta);
  let cola = Promise.resolve();
  const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };   // una emisión a la vez: nunca dos números iguales

  function infoCert(d) {
    const crt = crtDe(d, cfgDe(d).ambiente); if (!crt) return {};
    try { const c = forge.pki.certificateFromPem(crt), v = c.validity.notAfter.getTime(); return { vence: v, vencido: v < ahora() }; } catch (e) { return {}; }
  }
  function estado() {
    const d = leer(), c = cfgDe(d), ic = infoCert(d);
    return { cfg: c, configurado: !!(d.cfg && d.cfg.cuit), tieneClave: !!d.key, tieneCert: !!crtDe(d, c.ambiente), certs: { homologacion: !!crtDe(d, 'homologacion'), produccion: !!crtDe(d, 'produccion') }, ...ic, listo: listoDe(d) && !ic.vencido };
  }

  function guardarConfig(p) {
    p = p || {}; const d = leer(), c = { ...cfgDe(d) };
    const set = (k, v) => { if (v !== undefined) c[k] = v; };
    for (const k of ['cuit', 'razon', 'domicilio', 'inicio']) if (p[k] !== undefined) set(k, String(p[k]).trim().slice(0, 120));
    for (const k of ['condIva', 'modo', 'ambiente']) set(k, p[k]);
    if (p.ptoVta !== undefined) set('ptoVta', +p.ptoVta);
    if (p.alicuota !== undefined) set('alicuota', +p.alicuota);
    if (!cuitValido(c.cuit)) return { ok: false, err: 'El CUIT no es válido (11 números, sin guiones)' };
    if (!c.razon) return { ok: false, err: 'Falta la razón social o el nombre' };
    if (!CONDICIONES.includes(c.condIva)) return { ok: false, err: 'Elegí tu condición frente al IVA (monotributo o responsable inscripto)' };
    if (!MODOS.includes(c.modo)) return { ok: false, err: 'Modo de facturación inválido' };
    if (!['homologacion', 'produccion'].includes(c.ambiente)) return { ok: false, err: 'Ambiente inválido' };
    if (c.ptoVta != null && !(Number.isInteger(c.ptoVta) && c.ptoVta >= 1 && c.ptoVta <= 99999)) return { ok: false, err: 'El punto de venta es un número entre 1 y 99999' };
    if (!(c.alicuota in ALICUOTAS)) return { ok: false, err: 'Alícuota de IVA inválida' };
    if (c.ambiente === 'produccion' && !crtDe(d, 'produccion')) return { ok: false, err: 'Para facturar en producción primero cargá el certificado' };
    if (d.cfg && d.cfg.cuit && d.cfg.cuit !== c.cuit && hayCert(d)) return { ok: false, err: 'El CUIT no coincide con el del certificado cargado. Generá un certificado nuevo para el otro CUIT.' };
    escribir({ ...d, cfg: c }); return { ok: true };
  }

  // Genera la clave privada (queda protegida en este equipo) y el pedido de certificado (CSR) para subir a ARCA.
  function generarCsr({ regenerar } = {}) {
    const d = leer(), c = cfgDe(d);
    if (!d.cfg || !cuitValido(c.cuit) || !c.razon) return { ok: false, err: 'Primero completá el CUIT y la razón social' };
    if (hayCert(d) && !regenerar) return { ok: false, err: 'Ya hay un certificado cargado. Si generás un pedido nuevo, el certificado actual deja de servir.', confirmar: true };
    let keyPem = d.key ? desproteger(d.key) : null; let nuevo = {};
    if (!keyPem || hayCert(d) || regenerar) {
      keyPem = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
      nuevo = { key: proteger(keyPem), crts: undefined, ta: undefined };   // cifra ANTES de escribir: si no se puede proteger, no se guarda nada
    }
    const priv = forge.pki.privateKeyFromPem(keyPem), csr = forge.pki.createCertificationRequest();
    csr.publicKey = forge.pki.setRsaPublicKey(priv.n, priv.e);
    csr.setSubject([{ name: 'countryName', value: 'AR' }, { name: 'organizationName', value: c.razon }, { name: 'commonName', value: 'stockproject' }, { name: 'serialNumber', value: 'CUIT ' + c.cuit }]);
    csr.sign(priv, forge.md.sha256.create());
    const pem = forge.pki.certificationRequestToPem(csr);
    escribir({ ...d, ...nuevo, csr: pem }); return { ok: true, csr: pem };
  }

  function cargarCertificado(texto, amb) {
    const d0 = leer(); amb = amb || cfgDe(d0).ambiente; if (!['homologacion', 'produccion'].includes(amb)) return { ok: false, err: 'Ambiente inválido' };
    const d = leer(); if (!d.key) return { ok: false, err: 'Primero generá el pedido de certificado (paso 2)' };
    const m = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(String(texto || ''));
    if (!m) return { ok: false, err: 'Ese archivo no parece un certificado (.crt). Tiene que empezar con -----BEGIN CERTIFICATE-----' };
    let cert; try { cert = forge.pki.certificateFromPem(m[0]); } catch (e) { return { ok: false, err: 'No se pudo leer el certificado' }; }
    const priv = forge.pki.privateKeyFromPem(desproteger(d.key));
    if (cert.publicKey.n.compareTo(priv.n) !== 0) return { ok: false, err: 'Este certificado no corresponde al pedido generado en este equipo. Si generaste un pedido nuevo, usá el certificado que te dio ARCA para ese.' };
    const vence = cert.validity.notAfter.getTime();
    if (vence < ahora()) return { ok: false, err: 'El certificado ya venció. Generá un pedido nuevo.' };
    const sn = cert.subject.attributes.find(a => a.name === 'serialNumber'); if (sn && d.cfg && d.cfg.cuit && !String(sn.value).includes(d.cfg.cuit)) return { ok: false, err: 'El certificado es de otro CUIT' };
    escribir({ ...d, crts: { ...(d.crts || {}), [amb]: m[0] }, ta: undefined }); return { ok: true, vence, ambiente: amb };
  }

  // Credencial de acceso (token y firma): se reutiliza hasta que vence, así no se pide una nueva en cada factura.
  async function credencial(d, amb) {
    const cache = d.ta && d.ta[amb] ? JSON.parse(desproteger(d.ta[amb])) : null;
    if (cache && cache.exp - ahora() > 10 * 6e4) return cache;
    const ta = await api.login(amb, crtDe(d, amb), desproteger(d.key));
    const n = leer(); escribir({ ...n, ta: { ...(n.ta || {}), [amb]: proteger(JSON.stringify(ta)) } });
    return ta;
  }
  const falla = e => ({ ok: false, err: e.sinConexion ? e.message : (e.message || String(e)), ...(e.sinConexion ? { pendiente: true } : {}) });

  // Verifica certificado, acceso y punto de venta sin emitir nada.
  const probar = () => enCola(async () => {
    const d = leer(), c = cfgDe(d);
    if (!listoDe(d)) return { ok: false, err: 'Falta completar la configuración o cargar el certificado' };
    try {
      const ta = await credencial(d, c.ambiente), ptos = await api.puntosVenta(c.ambiente, ta, c.cuit);
      const mio = ptos.find(p => p.nro === c.ptoVta);
      return { ok: true, ptos, ptoVtaOk: !!mio && !mio.bloqueado && !mio.baja, ptoVtaMsg: !mio ? 'El punto de venta ' + c.ptoVta + ' no existe en ARCA para este CUIT (tiene que ser de tipo "Web Services").' : mio.bloqueado || mio.baja ? 'El punto de venta está bloqueado o dado de baja.' : '', ambiente: c.ambiente };
    } catch (e) { return falla(e); }
  });
  const tipos = () => enCola(async () => {
    const d = leer(), c = cfgDe(d); if (!listoDe(d)) return { ok: false, err: 'Falta configurar ARCA' };
    try { return { ok: true, tipos: await api.tiposComprobante(c.ambiente, await credencial(d, c.ambiente), c.cuit) }; } catch (e) { return falla(e); }
  });

  // v: { id, date (ISO), total, receptor }. Devuelve { ok, fe } | { ok:false, pendiente } | { ok:false, rechazo, err }.
  const facturar = v => enCola(async () => {
    const d0 = leer(), c = cfgDe(d0), ic = infoCert(d0);
    if (!listoDe(d0)) return { ok: false, err: 'ARCA todavía no está conectado (Configuración > Facturación electrónica)' };
    if (ic.vencido) return { ok: false, err: 'El certificado venció. Generá uno nuevo en Configuración > Facturación electrónica.' };
    const rr = receptorOk(v.receptor); if (rr.err) return { ok: false, err: rr.err };
    const total = r2(v.total); if (!(total > 0)) return { ok: false, err: 'La venta no tiene importe para facturar' };
    const amb = c.ambiente, k = amb + ':' + v.id, previo = (d0.jr || {})[k];
    if (previo && previo.estado === 'ok') return { ok: true, fe: previo.fe, repetido: true };   // ya se facturó: nunca otro número
    const r = rr.r, tipo = tipoDe(c, r), imp = importes(c, total, tipo);
    if (tipo === 1 && r.docTipo !== 80) return { ok: false, err: 'La factura A necesita el CUIT del cliente' };
    const guardarJr = x => { const n = leer(), jr = { ...(n.jr || {}) }; if (x) jr[k] = x; else delete jr[k]; escribir({ ...n, jr }); };
    try {
      const ta = await credencial(d0, amb);
      const ultimo = await api.ultimoAutorizado(amb, ta, c.cuit, c.ptoVta, tipo);
      const f = new Date(v.date), hoy = new Date(ahora()), usada = Math.abs(hoy - f) <= DIAS_FECHA * 864e5 ? f : hoy;
      let nro = ultimo + 1, adoptado = null;
      // Un intento anterior pudo llegar a ARCA aunque no recibimos la respuesta: se consulta antes de pedir otro número.
      if (previo && previo.estado === 'intento' && previo.tipo === tipo && previo.pto === c.ptoVta && previo.nro <= ultimo) {
        const ya = await api.consultar(amb, ta, c.cuit, c.ptoVta, tipo, previo.nro);
        if (ya && Math.abs(ya.total - total) < 0.005 && String(ya.docNro) === String(r.docNro)) adoptado = { ok: true, cae: ya.cae, vto: ya.vto, nro: previo.nro, observaciones: [] };
      }
      let res = adoptado;
      if (!res) {
        guardarJr({ estado: 'intento', tipo, pto: c.ptoVta, nro, total, docNro: r.docNro });
        res = await api.solicitarCae(amb, ta, c.cuit, { ptoVta: c.ptoVta, tipo, nro, fecha: ymd(usada).replace(/-/g, ''), total: imp.total, neto: imp.neto, iva: imp.iva, alicuotaId: imp.alicuotaId, docTipo: r.docTipo, docNro: r.docNro, condIvaReceptor: r.condIva });
      }
      if (!res.ok) { guardarJr(null); return res; }
      const aaaammdd = s => s && /^\d{8}$/.test(s) ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6) : s;
      const fe = { estado: 'ok', amb, tipo, letra: LETRA[tipo], ptoVta: c.ptoVta, nro: res.nro, fecha: ymd(usada), cae: res.cae, vto: aaaammdd(res.vto), receptor: r, obs: res.observaciones || [], iva: imp.iva, neto: imp.neto,
        emisor: { cuit: c.cuit, razon: c.razon, condIva: c.condIva, domicilio: c.domicilio || '', inicio: c.inicio || '' } };
      fe.qr = armarQr(fe, total);
      guardarJr({ estado: 'ok', fe });
      return { ok: true, fe };
    } catch (e) { return e.fault || e.errores ? (guardarJr(null), falla(e)) : falla(e); }   // sin conexión: el intento queda anotado para consultar antes de reintentar
  });

  return { estado, guardarConfig, generarCsr, cargarCertificado, probar, tipos, facturar, qrSvg };
};
Object.assign(module.exports, { cuitValido, tipoDe, importes, armarQr, qrSvg, receptorOk, QR_URL });
