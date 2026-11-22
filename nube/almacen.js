// Dónde guarda sus datos el servidor del panel. Dos opciones con la misma forma:
//   archivos(dataDir)  → carpeta local (VPS con Docker, pruebas).
//   redis({url,token}) → base Redis por HTTPS (Upstash, la que ofrece Vercel sin tarjeta). Sirve para funciones sin disco.
// Forma:
//   leer(clave) → texto|null · leerVarios([claves]) → [texto|null] · borrar(clave)
//   escribir(clave, texto, ms?)   → guarda (con ms, la clave vence sola a los ms milisegundos)
//   crearSiNo(clave, texto, ms?)  → true si la creó, false si ya existía (atómico: sirve para reservar nombres)
//   sumar(clave, ms?)             → suma 1 de forma atómica y devuelve el total (con ms, el contador vence solo)
'use strict';
const fs = require('fs'), path = require('path');

const TOPE_CONTADORES = 200000;   // contadores en memoria del modo archivos: por encima se descartan los más viejos

function archivos(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const ruta = k => path.join(dataDir, ...String(k).split(':').map(p => p.replace(/[^a-zA-Z0-9_.-]/g, '_'))) + '.json';
  // Contadores con vencimiento (límites de intentos): en memoria. Node atiende un pedido por vez entre "await",
  // así que leer y sumar acá no se pisa. Al reiniciar se pierden, como antes.
  const contadores = new Map();
  const vivo = k => { const x = contadores.get(k); if (x && x.vence <= Date.now()) { contadores.delete(k); return null; } return x || null; };
  function podar() {
    const t = Date.now();
    for (const [k, x] of contadores) if (x.vence <= t) contadores.delete(k);
    for (const k of contadores.keys()) { if (contadores.size < TOPE_CONTADORES) break; contadores.delete(k); }   // los más viejos primero
  }
  const leer = async k => {
    const x = vivo(k); if (x) return String(x.n);
    try { return fs.readFileSync(ruta(k), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  };
  function escribirYa(k, texto) {
    const r = ruta(k), tmp = r + '.tmp'; fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(tmp, texto);
    for (let i = 0; ; i++) { try { fs.renameSync(tmp, r); return; } catch (e) { if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; } }   // antivirus en Windows
  }
  return {
    leer, leerVarios: ks => Promise.all(ks.map(leer)),
    // En archivos el vencimiento no se aplica solo: quien lee revisa la fecha (las sesiones guardan "vence").
    async escribir(k, texto) { escribirYa(k, texto); },
    async crearSiNo(k, texto) {
      const r = ruta(k); fs.mkdirSync(path.dirname(r), { recursive: true });
      try { fs.writeFileSync(r, texto, { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
    },
    async sumar(k, ms) {
      if (ms) {
        const x = vivo(k);
        if (x) { x.n++; return x.n; }
        if (contadores.size >= TOPE_CONTADORES) podar();
        contadores.set(k, { n: 1, vence: Date.now() + ms }); return 1;
      }
      let n = 0; try { n = Number(fs.readFileSync(ruta(k), 'utf8')) || 0; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      escribirYa(k, String(n + 1)); return n + 1;   // sin await en el medio: ningún otro pedido se mete
    },
    async borrar(k) { contadores.delete(k); try { fs.unlinkSync(ruta(k)); } catch (e) { if (e.code !== 'ENOENT') throw e; } },
    // Varias escrituras juntas: [clave, texto|null, ms?]; null borra. En archivos es un bucle; en Redis, un solo pedido HTTP.
    async escribirVarios(ops) { for (const [k, t] of ops) { if (t === null) await this.borrar(k); else escribirYa(k, t); } }
  };
}

const UMBRALES_USO = [70, 80, 90, 100];
const mesUtc = t => new Date(t).toISOString().slice(0, 7);

// API REST de Upstash: POST <url> con el comando como lista JSON y el token como Bearer. prefijo separa ambientes.
// Cuenta de comandos del mes (Upstash Free = 500.000): cada instancia suma lo suyo y lo vuelca a la base con un INCRBY
// cada FLUSH_N comandos o 60 s (≈ +4 % de comandos). uso() da el total conocido; avisar() se llama al cruzar 70/80/90/100 %.
// shortcut: una instancia que se congela antes de volcar pierde su cuenta pendiente (subestima un poco); alcanza como alerta.
function redis({ url, token, prefijo = 'sp:', pedir = (u, o) => fetch(u, o), limite = 500000, avisar = m => console.warn(m), ahora = () => Date.now() }) {
  if (!url || !token) throw new Error('Faltan la dirección y el token de la base de datos');
  url = String(url).replace(/\/+$/, '');
  const FLUSH_N = 25, FLUSH_MS = 60000; let pend = 0, ultFlush = 0, visto = 0, mesVisto = '', nivel = 0;
  const http = async (ruta, cuerpo) => {
    const r = await pedir(url + ruta, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    if (!r.ok) throw new Error('La base de datos respondió ' + r.status);
    return r.json();
  };
  async function contar(n) {
    pend += n; const t = ahora();
    if (pend < FLUSH_N && (!pend || t - ultFlush < FLUSH_MS)) return;
    const x = pend, mes = mesUtc(t); pend = 0; ultFlush = t;
    try {
      const j = await http('', ['INCRBY', prefijo + 'uso:' + mes, x]); if (j.error) return;
      if (mes !== mesVisto) { mesVisto = mes; nivel = 0; }
      visto = Number(j.result) || 0;
      const pct = visto * 100 / limite, n2 = UMBRALES_USO.filter(u => pct >= u).length;
      if (n2 > nivel) { nivel = n2; avisar(`[uso] La base de datos lleva ${visto} de ${limite} comandos este mes (${Math.floor(pct)} %). Al llegar al 100 % el plan gratuito frena (no cobra).`); }
    } catch (e) { pend += x; }   // si falla el volcado, se suma en el próximo
  }
  const cmd = async c => {
    const j = await http('', c); await contar(1); if (j.error) throw new Error('La base de datos rechazó el pedido'); return j.result;
  };
  // Pipeline de Upstash: un solo pedido HTTP, aunque Upstash igual cuenta cada comando.
  const lote = async cs => {
    const js = await http('/pipeline', cs); await contar(cs.length);
    return js.map(j => { if (j.error) throw new Error('La base de datos rechazó el pedido'); return j.result; });
  };
  const ms = x => Math.max(1, Math.ceil(Number(x)));
  return {
    uso: () => ({ mes: mesVisto || mesUtc(ahora()), comandos: visto + pend, limite, pct: Math.round((visto + pend) * 1000 / limite) / 10 }),
    escribirVarios: ops => ops.length ? lote(ops.map(([k, t, v]) => t === null ? ['DEL', prefijo + k] : v ? ['SET', prefijo + k, t, 'PX', ms(v)] : ['SET', prefijo + k, t])).then(() => {}) : Promise.resolve(),
    leer: k => cmd(['GET', prefijo + k]),
    leerVarios: ks => ks.length ? cmd(['MGET', ...ks.map(k => prefijo + k)]) : Promise.resolve([]),
    escribir: (k, texto, vence) => cmd(vence ? ['SET', prefijo + k, texto, 'PX', ms(vence)] : ['SET', prefijo + k, texto]),
    crearSiNo: async (k, texto, vence) => (await cmd(vence ? ['SET', prefijo + k, texto, 'NX', 'PX', ms(vence)] : ['SET', prefijo + k, texto, 'NX'])) === 'OK',
    // INCR es atómico en Redis: dos pedidos a la vez nunca leen el mismo total. El vencimiento se pone al crearlo;
    // las claves de los límites llevan la ventana en el nombre, así que si ese PEXPIRE fallara no queda un bloqueo eterno.
    async sumar(k, vence) {
      const n = Number(await cmd(['INCR', prefijo + k]));
      if (vence && n === 1) await cmd(['PEXPIRE', prefijo + k, ms(vence)]);
      return n;
    },
    borrar: k => cmd(['DEL', prefijo + k])
  };
}
module.exports = { archivos, redis };
