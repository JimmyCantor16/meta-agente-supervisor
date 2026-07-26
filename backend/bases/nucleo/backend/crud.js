const express = require('express');

const dominio = require('./dominio');
const { run, get, all } = require('./db');
const { autenticar, soloAdmin } = require('./auth');

const routerCrud = express.Router();

const NUMERICOS = new Set(['numero', 'precio']);

function validar(entidad, cuerpo) {
  const errores = [];
  const valores = {};
  for (const campo of entidad.campos) {
    let valor = cuerpo[campo.nombre];
    if (valor === '' || valor === undefined || valor === null) {
      if (campo.requerido) errores.push(`«${campo.etiqueta}» es obligatorio.`);
      valores[campo.nombre] = null;
      continue;
    }
    if (NUMERICOS.has(campo.tipo)) {
      valor = Number(valor);
      if (Number.isNaN(valor)) errores.push(`«${campo.etiqueta}» debe ser un número.`);
    }
    if (campo.tipo === 'booleano') valor = valor ? 1 : 0;
    if (campo.tipo === 'opcion' && campo.opciones && !campo.opciones.includes(valor)) {
      errores.push(`«${campo.etiqueta}» debe ser una de: ${campo.opciones.join(', ')}.`);
    }
    valores[campo.nombre] = valor;
  }
  return { errores, valores };
}

for (const entidad of dominio.entidades) {
  const tabla = entidad.plural;
  const lectura = entidad.publico ? [] : [autenticar];
  // Escribir siempre exige sesión; en entidades no públicas además ser admin.
  const escritura = entidad.publico ? [autenticar, soloAdmin] : [autenticar, soloAdmin];

  routerCrud.get(`/${tabla}`, ...lectura, async (req, res) => {
    try {
      res.json(await all(`SELECT * FROM ${tabla} ORDER BY id DESC`));
    } catch (e) {
      console.error(`[listar ${tabla}]`, e.message);
      res.status(500).json({ error: 'No se pudo cargar la lista.' });
    }
  });

  routerCrud.get(`/${tabla}/:id`, ...lectura, async (req, res) => {
    const fila = await get(`SELECT * FROM ${tabla} WHERE id = ?`, [req.params.id]);
    if (!fila) return res.status(404).json({ error: 'No existe ese registro.' });
    res.json(fila);
  });

  routerCrud.post(`/${tabla}`, ...escritura, async (req, res) => {
    const { errores, valores } = validar(entidad, req.body || {});
    if (errores.length) return res.status(400).json({ error: errores.join(' ') });
    const nombres = Object.keys(valores);
    const r = await run(
      `INSERT INTO ${tabla} (${nombres.join(', ')}) VALUES (${nombres.map(() => '?').join(', ')})`,
      nombres.map((n) => valores[n])
    );
    res.status(201).json({ id: r.id, ...valores });
  });

  routerCrud.put(`/${tabla}/:id`, ...escritura, async (req, res) => {
    const { errores, valores } = validar(entidad, req.body || {});
    if (errores.length) return res.status(400).json({ error: errores.join(' ') });
    const nombres = Object.keys(valores);
    const r = await run(
      `UPDATE ${tabla} SET ${nombres.map((n) => `${n} = ?`).join(', ')} WHERE id = ?`,
      [...nombres.map((n) => valores[n]), req.params.id]
    );
    if (r.cambios === 0) return res.status(404).json({ error: 'No existe ese registro.' });
    res.json({ id: Number(req.params.id), ...valores });
  });

  routerCrud.delete(`/${tabla}/:id`, ...escritura, async (req, res) => {
    const r = await run(`DELETE FROM ${tabla} WHERE id = ?`, [req.params.id]);
    if (r.cambios === 0) return res.status(404).json({ error: 'No existe ese registro.' });
    res.json({ ok: true });
  });
}

module.exports = { routerCrud };
