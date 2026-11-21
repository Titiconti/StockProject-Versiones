// La vista previa de Vercel comparte la base con producción: tiene que usar otro espacio de claves (sp-preview:).
// Cada ambiente corre en un proceso aparte con un Redis simulado que anota las claves que se piden.
const assert = require('assert'), path = require('path'), { execFileSync } = require('child_process');
const HIJO = `
const vistas = [];
global.fetch = async (u, o) => { const c = JSON.parse(o.body); vistas.push(...c.slice(1).filter(x => typeof x === 'string' && x.startsWith('sp')));
  return { ok: true, json: async () => ({ result: c[0] === 'MGET' ? c.slice(1).map(() => null) : null }) }; };
const h = require(process.argv[1]);
const req = require('stream').Readable.from([]); Object.assign(req, { method: 'GET', url: '/c/x/?__ruta=/c/x/', headers: { host: 'x.vercel.app' }, socket: { remoteAddress: '127.0.0.1' } });
const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k] = v }, getHeader(k) { return this.h[k] }, writeHead(s) { this.statusCode = s; return this }, write() {}, end() { setTimeout(() => { console.log(JSON.stringify(vistas)); process.exit(0) }, 50) } };
h(req, res);
setTimeout(() => { console.log(JSON.stringify(vistas)); process.exit(0) }, 3000);`;
const correr = entorno => JSON.parse(execFileSync(process.execPath, ['-e', HIJO, path.join(__dirname, '..', 'nube', 'api', 'index.js')], {
  env: { ...process.env, ADMIN_TOKEN: 'a'.repeat(40), KV_REST_API_URL: 'https://redis.prueba', KV_REST_API_TOKEN: 't', VERCEL_ENV: entorno }, encoding: 'utf8' }).trim().split('\n').pop());
const prev = correr('preview'); assert(prev.length, 'la vista previa consulta la base'); assert(prev.every(k => k.startsWith('sp-preview:')), 'la vista previa no toca claves de producción: ' + prev.join(','));
const prod = correr('production'); assert(prod.length && prod.every(k => k.startsWith('sp:')), 'producción sigue con sp: ' + prod.join(','));
const nada = correr(''); assert(nada.every(k => k.startsWith('sp-preview:')), 'sin ambiente definido, por las dudas tampoco toca producción');
console.log('NUBE_PREFIJO_OK');
