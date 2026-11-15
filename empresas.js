// Varias empresas en una misma instalación: cada una con su propio archivo de datos, configuración y respaldos.
// Los usuarios son compartidos. La empresa "principal" usa los archivos de siempre, así que quien actualiza no migra nada.
const fs = require('fs'), path = require('path');
const { convertir } = require('./monedas');
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'empresa';

module.exports = function ({ dir, principal, crearStore, opcionesComunes, alCrear }) {
  const reg = path.join(dir, 'empresas.json'), carpeta = path.join(dir, 'empresas');
  const rd = () => { try { const d = JSON.parse(fs.readFileSync(reg, 'utf8')); if (Array.isArray(d.lista) && d.lista.length) return d; } catch (e) {} return { activa: 'principal', lista: [{ id: 'principal', nombre: 'Mi negocio' }] }; };
  const wr = d => { fs.mkdirSync(dir, { recursive: true }); const t = reg + '.tmp'; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, reg); };
  const stores = new Map([['principal', principal]]); let clave = null;
  function store(id) {
    id = id || rd().activa; if (stores.has(id)) return stores.get(id);
    if (!rd().lista.some(e => e.id === id)) throw new Error('Empresa inexistente');
    const base = path.join(carpeta, id);
    const s = crearStore({ ...opcionesComunes, dataFile: path.join(base, 'stockproject-data.json'), configFile: path.join(base, 'config.json'), defaults: { ...(opcionesComunes.defaults || {}), backupDir: path.join(base, 'respaldos') } });
    if (clave) s.setKey(clave); if (alCrear) alCrear(s); stores.set(id, s); return s;
  }
  function crear(nombre) {
    nombre = String(nombre || '').trim().slice(0, 60); if (nombre.length < 2) return { ok: false, err: 'Escribí el nombre de la empresa' };
    const d = rd(); if (d.lista.some(e => e.nombre.toLowerCase() === nombre.toLowerCase())) return { ok: false, err: 'Ya tenés una empresa con ese nombre' };
    let id = slug(nombre), n = 2; while (d.lista.some(e => e.id === id) || id === 'principal') id = slug(nombre) + '-' + n++;
    d.lista.push({ id, nombre }); wr(d); return { ok: true, id };
  }
  function renombrar(id, nombre) { nombre = String(nombre || '').trim().slice(0, 60); const d = rd(), e = d.lista.find(x => x.id === id); if (!e || nombre.length < 2) return { ok: false, err: 'Nombre inválido' }; e.nombre = nombre; wr(d); return { ok: true }; }
  function cambiar(id) { const d = rd(); if (!d.lista.some(e => e.id === id)) return { ok: false, err: 'Empresa inexistente' }; d.activa = id; wr(d); store(id); return { ok: true }; }
  const listar = () => { const d = rd(); return { activa: d.activa, lista: d.lista }; };
  function setKey(k) { clave = k ? Buffer.from(k) : null; stores.forEach(s => s.setKey(clave)); }
  const deuda = (db, c) => Math.round(((db.sales || []).filter(s => s.cid === c.id && !s.void && s.pay === 'Cuenta corriente').reduce((a, s) => a + s.total, 0) + (db.cargos || []).filter(x => x.cid === c.id).reduce((a, x) => a + x.amount, 0) - (db.pays || []).filter(p => p.cid === c.id).reduce((a, p) => a + p.amount, 0)) * 100) / 100;
  // Reporte consolidado: cada empresa en su moneda y convertido a la moneda elegida.
  function consolidado({ desde, hasta, base, estado }) {
    const filas = rd().lista.map(e => {
      let db = null; try { db = JSON.parse(store(e.id).snapshot() || 'null'); } catch (x) {}
      if (!db || !db.prods) return { id: e.id, nombre: e.nombre, moneda: base, vacia: true, ventas: 0, ganancia: 0, tickets: 0, porCobrar: 0, inventario: 0 };
      const mon = (db.cfg && (db.cfg.moneda || (db.cfg.encuesta && db.cfg.encuesta.mon))) || 'ARS';
      const dia = iso => new Date(iso).toLocaleDateString('sv-SE');   // día local de la venta (las fechas se guardan en UTC: una venta de las 22 h no es del día siguiente)
      const v = (db.sales || []).filter(s => !s.void && dia(s.date) >= desde && dia(s.date) <= hasta);
      const ventas = v.reduce((a, s) => a + s.total, 0), costo = v.reduce((a, s) => a + s.items.reduce((x, i) => x + i.qty * (i.cost || 0), 0), 0);
      const porCobrar = (db.clients || []).reduce((a, c) => a + Math.max(0, deuda(db, c)), 0), inventario = (db.prods || []).reduce((a, p) => a + (p.lots || []).reduce((x, l) => x + l.qty, 0) * (p.cost || 0), 0);
      const k = x => convertir(estado, x, mon, base), vc = k(ventas);
      return { id: e.id, nombre: e.nombre, moneda: mon, ventasOrig: ventas, ventas: vc, ganancia: vc == null ? null : k(ventas - costo), tickets: v.length, porCobrar: vc == null ? null : k(porCobrar), inventario: vc == null ? null : k(inventario), sinTasa: vc == null };
    });
    const sum = k => filas.reduce((a, f) => a + (f[k] || 0), 0);
    return { base, filas, total: { ventas: sum('ventas'), ganancia: sum('ganancia'), tickets: sum('tickets'), porCobrar: sum('porCobrar'), inventario: sum('inventario') }, incompleto: filas.some(f => f.sinTasa) };
  }
  return { listar, crear, renombrar, cambiar, store, activa: () => store(), principal: () => principal, setKey, consolidado };
};
