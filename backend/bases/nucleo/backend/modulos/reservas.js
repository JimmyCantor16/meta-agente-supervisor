const express = require('express');

const dominio = require('../dominio');
const { run, all } = require('../db');
const { autenticar, soloAdmin } = require('../auth');

const routerReservas = express.Router();
const config = (dominio.modulos && dominio.modulos.reservas) || {};
const RECURSOS = config.recursos || ['Turno único'];
const HORARIOS = config.horarios || ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

routerReservas.get('/reservas/disponibilidad', async (req, res) => {
  const fecha = req.query.fecha;
  if (!fecha) return res.status(400).json({ error: 'Falta la fecha (AAAA-MM-DD).' });
  const ocupadas = await all('SELECT recurso, hora FROM reservas WHERE fecha = ?', [fecha]);
  const llaves = new Set(ocupadas.map((o) => `${o.recurso}|${o.hora}`));
  const disponibilidad = RECURSOS.map((recurso) => ({
    recurso,
    horas: HORARIOS.map((hora) => ({ hora, libre: !llaves.has(`${recurso}|${hora}`) })),
  }));
  res.json({ fecha, disponibilidad });
});

routerReservas.post('/reservas', autenticar, async (req, res) => {
  try {
    const { recurso, fecha, hora } = req.body || {};
    if (!RECURSOS.includes(recurso)) return res.status(400).json({ error: 'Ese recurso no existe.' });
    if (!HORARIOS.includes(hora)) return res.status(400).json({ error: 'Ese horario no existe.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) {
      return res.status(400).json({ error: 'La fecha debe ser AAAA-MM-DD.' });
    }
    const r = await run(
      'INSERT INTO reservas (usuario_id, recurso, fecha, hora) VALUES (?, ?, ?, ?)',
      [req.usuario.id, recurso, fecha, hora]
    );
    res.status(201).json({ id: r.id, recurso, fecha, hora });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ese horario acaba de ocuparse. Elige otro.' });
    }
    console.error('[crear reserva]', e.message);
    res.status(500).json({ error: 'No se pudo crear la reserva.' });
  }
});

routerReservas.get('/reservas', autenticar, async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const filas = esAdmin
    ? await all(`SELECT r.*, u.nombre AS cliente FROM reservas r
                 JOIN usuarios u ON u.id = r.usuario_id ORDER BY fecha, hora`)
    : await all('SELECT * FROM reservas WHERE usuario_id = ? ORDER BY fecha, hora', [req.usuario.id]);
  res.json(filas);
});

routerReservas.delete('/reservas/:id', autenticar, async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const r = esAdmin
    ? await run('DELETE FROM reservas WHERE id = ?', [req.params.id])
    : await run('DELETE FROM reservas WHERE id = ? AND usuario_id = ?', [req.params.id, req.usuario.id]);
  if (r.cambios === 0) return res.status(404).json({ error: 'No existe esa reserva (o no es tuya).' });
  res.json({ ok: true });
});

module.exports = { routerReservas };
