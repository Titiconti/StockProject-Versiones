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
    async borrar(k) { contadores.delete(k); try { fs.unlinkSync(ruta(k)); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  };
}

// API REST de Upstash: POST <url> con el comando como lista JSON y el token como Bearer. prefijo separa ambientes.
function redis({ url, token, prefijo = 'sp:', pedir = (u, o) => fetch(u, o) }) {
  if (!url || !token) throw new Error('Faltan la dirección y el token de la base de datos');
  url = String(url).replace(/\/+$/, '');
  const cmd = async c => {
    const r = await pedir(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
    if (!r.ok) throw new Error('La base de datos respondió ' + r.status);
    const j = await r.json(); if (j.error) throw new Error('La base de datos rechazó el pedido'); return j.result;
  };
  const ms = x => Math.max(1, Math.ceil(Number(x)));
  return {
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
