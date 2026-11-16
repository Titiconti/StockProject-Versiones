// Entrada para Vercel (plan gratuito, sin tarjeta): la misma lógica de servidor.js corriendo como función.
// Como una función no tiene disco ni memoria entre pedidos, los datos van a la base Redis que Vercel ofrece
// desde su panel (Storage > Upstash for Redis) y se releen en cada pedido.
// Variables de entorno: ADMIN_TOKEN (obligatoria, larga y secreta) y las que crea la integración de Redis
// (KV_REST_API_URL y KV_REST_API_TOKEN, o UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN).
// Cada comercio entra por https://<proyecto>.vercel.app/c/<comercio> (no hace falta dominio propio).
'use strict';
const { crear } = require('../servidor'), { redis } = require('../almacen');
let servidor = null, error = '';
function iniciar() {
  const e = process.env, adminToken = (e.ADMIN_TOKEN || '').trim(), url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL, token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN;
  if (!adminToken || adminToken.length < 24) { error = 'Falta la variable ADMIN_TOKEN (24 caracteres o más).'; return; }
  if (!url || !token) { error = 'Falta conectar la base de datos (Storage > Upstash for Redis en el panel de Vercel).'; return; }
  // Las vistas previas usan la misma base que producción: van a otro espacio de claves para no tocar (ni mudar) los datos reales.
  const prefijo = e.VERCEL_ENV === 'production' ? 'sp:' : 'sp-preview:';
  servidor = crear({ almacen: redis({ url, token, prefijo }), recargar: true, adminToken, dominioBase: (e.DOMAIN_BASE || '').trim(), confiarProxy: true, frescuraMs: (Number(e.FRESCURA_SEG) || 420) * 1000 });
}
module.exports = (req, res) => {
  if (!servidor && !error) iniciar();
  if (!servidor) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify({ error })); }
  // vercel.json reenvía todo a esta función y pasa la dirección original en __ruta.
  try { const u = new URL(req.url, 'http://x'), r = u.searchParams.get('__ruta'); if (r !== null) { u.searchParams.delete('__ruta'); const q = u.searchParams.toString(); req.url = (r.startsWith('/') ? r : '/' + r) + (q ? '?' + q : ''); } } catch (e) {}
  return servidor.manejar(req, res);
};
