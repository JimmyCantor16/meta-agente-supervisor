const express = require('express');

const dominio = require('../dominio');
const { run, all } = require('../db');
const { autenticar } = require('../auth');

const routerQuiz = express.Router();
const config = (dominio.modulos && dominio.modulos.quiz) || {};
const PREGUNTAS = config.preguntas || [];

// Las preguntas viajan SIN la respuesta correcta: el navegador no debe saberla.
routerQuiz.get('/quiz', (req, res) => {
  res.json({
    titulo: config.titulo || 'Quiz',
    preguntas: PREGUNTAS.map((p, i) => ({ n: i, pregunta: p.pregunta, opciones: p.opciones })),
  });
});

routerQuiz.post('/quiz/responder', autenticar, async (req, res) => {
  const respuestas = (req.body && req.body.respuestas) || [];
  if (!Array.isArray(respuestas) || respuestas.length !== PREGUNTAS.length) {
    return res.status(400).json({ error: 'Responde todas las preguntas antes de enviar.' });
  }
  let puntaje = 0;
  const detalle = PREGUNTAS.map((p, i) => {
    const acierto = Number(respuestas[i]) === p.correcta;
    if (acierto) puntaje += 1;
    return { n: i, acierto, correcta: p.opciones[p.correcta] };
  });
  await run('INSERT INTO progreso_quiz (usuario_id, puntaje, total) VALUES (?, ?, ?)',
    [req.usuario.id, puntaje, PREGUNTAS.length]);
  res.json({ puntaje, total: PREGUNTAS.length, detalle });
});

routerQuiz.get('/quiz/progreso', autenticar, async (req, res) => {
  res.json(await all(
    'SELECT puntaje, total, creado_en FROM progreso_quiz WHERE usuario_id = ? ORDER BY id DESC LIMIT 20',
    [req.usuario.id]
  ));
});

module.exports = { routerQuiz };
