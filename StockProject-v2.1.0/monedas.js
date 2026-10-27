// Tipos de cambio. Funciones puras (sin estado propio): el estado { base, tasas, fecha, manual } se guarda con los datos de la empresa.
// Las tasas automáticas vienen de un servicio público gratuito; sin conexión se usan las últimas guardadas o las que cargue la persona.
const FUENTE = base => `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
async function actualizar(fetchFn, base = 'USD') {
  if (!/^[A-Z]{3}$/.test(base)) return { ok: false, err: 'Moneda inválida' };
  let r; try { r = await fetchFn(FUENTE(base), { signal: AbortSignal.timeout(8000) }); } catch (e) { return { ok: false, err: 'No hay conexión para consultar los tipos de cambio.' }; }
  if (!r || r.status !== 200) return { ok: false, err: 'El servicio de cotizaciones no respondió (' + (r && r.status) + ').' };
  let j; try { j = await r.json(); } catch (e) { return { ok: false, err: 'Respuesta ilegible del servicio de cotizaciones.' }; }
  if (j.result !== 'success' || !j.rates || typeof j.rates !== 'object') return { ok: false, err: 'El servicio de cotizaciones devolvió un error.' };
  const tasas = {}; Object.entries(j.rates).forEach(([k, v]) => { if (/^[A-Z]{3}$/.test(k) && Number.isFinite(v) && v > 0) tasas[k] = v; });
  return { ok: true, estado: { base, tasas, fecha: new Date(j.time_last_update_unix ? j.time_last_update_unix * 1000 : Date.now()).toISOString() } };
}
// 1 unidad de "de" = ? unidades de "a". Una tasa manual "USD/ARS" = 1200 tiene prioridad (sirve para dólar MEP, blue, etc.).
function tasa(est, de, a) {
  if (de === a) return 1; const m = (est && est.manual) || {};
  if (m[de + '/' + a] > 0) return m[de + '/' + a]; if (m[a + '/' + de] > 0) return 1 / m[a + '/' + de];
  const t = (est && est.tasas) || {}; if (!(t[de] > 0) || !(t[a] > 0)) return null; return t[a] / t[de];
}
const convertir = (est, monto, de, a) => { const t = tasa(est, de, a); return t == null ? null : Math.round(monto * t * 100) / 100; };
module.exports = { actualizar, tasa, convertir, FUENTE };
