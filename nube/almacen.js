// Dónde guarda sus datos el servidor del panel. Dos opciones con la misma forma:
//   archivos(dataDir)  → carpeta local (VPS con Docker, pruebas).
//   redis({url,token}) → base Redis por HTTPS (Upstash, la que ofrece Vercel sin tarjeta). Sirve para funciones sin disco.
// Forma: leer(clave) → texto|null · leerVarios([claves]) → [texto|null] · escribir(clave, texto) · borrar(clave)
'use strict';
const fs = require('fs'), path = require('path');

function archivos(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const ruta = k => path.join(dataDir, ...String(k).split(':').map(p => p.replace(/[^a-zA-Z0-9_.-]/g, '_'))) + '.json';
  const leer = async k => { try { return fs.readFileSync(ruta(k), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  return {
    leer, leerVarios: ks => Promise.all(ks.map(leer)),
    async escribir(k, texto) {
      const r = ruta(k), tmp = r + '.tmp'; fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(tmp, texto);
      for (let i = 0; ; i++) { try { fs.renameSync(tmp, r); return; } catch (e) { if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; } }   // antivirus en Windows
    },
    async borrar(k) { try { fs.unlinkSync(ruta(k)); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
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
  return {
    leer: k => cmd(['GET', prefijo + k]),
    leerVarios: ks => ks.length ? cmd(['MGET', ...ks.map(k => prefijo + k)]) : Promise.resolve([]),
    escribir: (k, texto) => cmd(['SET', prefijo + k, texto]),
    borrar: k => cmd(['DEL', prefijo + k])
  };
}
module.exports = { archivos, redis };
