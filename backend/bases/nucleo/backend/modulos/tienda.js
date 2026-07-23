const express = require('express');

const dominio = require('../dominio');
const { run, get, all } = require('../db');
const { autenticar, soloAdmin } = require('../auth');

const routerTienda = express.Router();

// La entidad vendible la declara el dominio: {"tienda": {"entidad": "producto"}}
const config = (dominio.modulos && dominio.modulos.tienda) || {};
const entidadVendible = dominio.entidades.find((e) => e.nombre === config.entidad)
  || dominio.entidades[0];
const tabla = entidadVendible.plural;
const campoPrecio = (entidadVendible.campos.find((c) => c.tipo === 'precio') || {}).nombre || 'precio';
const campoStock = (entidadVendible.campos.find((c) => c.nombre === 'stock') || {}).nombre;

// Los precios se calculan SIEMPRE desde la base de datos, nunca del cliente.
routerTienda.post('/pedidos', autenticar, async (req, res) => {
  try {
    const items = (req.body && req.body.items) || [];
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Tu pedido está vacío.' });
    }
    let total = 0;
    const detalle = [];
    for (const item of items) {
      const fila = await get(`SELECT * FROM ${tabla} WHERE id = ?`, [item.id]);
      if (!fila) return res.status(400).json({ error: 'Uno de los productos ya no existe.' });
      const cantidad = Math.max(1, Number(item.cantidad) || 1);
      if (campoStock && fila[campoStock] !== null && fila[campoStock] < cantidad) {
        return res.status(400).json({ error: `No hay suficiente stock de «${fila.nombre || fila.id}».` });
      }
      const precio = Number(fila[campoPrecio]) || 0;
      total += precio * cantidad;
      detalle.push({ fila, cantidad, precio });
    }

    const pedido = await run(
      'INSERT INTO pedidos (usuario_id, total) VALUES (?, ?)',
      [req.usuario.id, Math.round(total * 100) / 100]
    );
    for (const d of detalle) {
      await run(
        'INSERT INTO pedido_items (pedido_id, item_id, nombre, precio, cantidad) VALUES (?, ?, ?, ?, ?)',
        [pedido.id, d.fila.id, d.fila.nombre || `#${d.fila.id}`, d.precio, d.cantidad]
      );
      if (campoStock && d.fila[campoStock] !== null) {
        await run(`UPDATE ${tabla} SET ${campoStock} = ${campoStock} - ? WHERE id = ?`,
          [d.cantidad, d.fila.id]);
      }
    }
    res.status(201).json({ id: pedido.id, total: Math.round(total * 100) / 100 });
  } catch (e) {
    console.error('[crear pedido]', e.message);
    res.status(500).json({ error: 'No se pudo crear el pedido. Intenta de nuevo.' });
  }
});

// El admin ve todos los pedidos; cada cliente solo los suyos.
routerTienda.get('/pedidos', autenticar, async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const pedidos = esAdmin
    ? await all(`SELECT p.*, u.nombre AS cliente FROM pedidos p
                 JOIN usuarios u ON u.id = p.usuario_id ORDER BY p.id DESC`)
    : await all('SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY id DESC', [req.usuario.id]);
  for (const p of pedidos) {
    p.items = await all('SELECT nombre, precio, cantidad FROM pedido_items WHERE pedido_id = ?', [p.id]);
  }
  res.json(pedidos);
});

routerTienda.put('/pedidos/:id/estado', autenticar, soloAdmin, async (req, res) => {
  const estado = (req.body && req.body.estado) || '';
  const validos = ['pendiente', 'preparando', 'entregado', 'cancelado'];
  if (!validos.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Usa: ${validos.join(', ')}.` });
  }
  const r = await run('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, req.params.id]);
  if (r.cambios === 0) return res.status(404).json({ error: 'No existe ese pedido.' });
  res.json({ ok: true });
});

module.exports = { routerTienda };
