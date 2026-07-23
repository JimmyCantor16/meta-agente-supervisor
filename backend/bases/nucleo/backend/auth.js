const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { run, get } = require('./db');

const SECRETO = process.env.JWT_SECRET || 'dev_secreto_no_produccion';
const routerAuth = express.Router();

const firmar = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol }, SECRETO, { expiresIn: '7d' });

const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });

routerAuth.post('/registro', async (req, res) => {
  try {
    const { nombre, email, password } = req.body || {};
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios.' });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'La contraseña necesita al menos 4 caracteres.' });
    }
    const existe = await get('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe) return res.status(400).json({ error: 'Ese correo ya tiene una cuenta. ¿Quieres entrar?' });

    const hash = bcrypt.hashSync(String(password), 10);
    const r = await run('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
      [nombre, email, hash, 'usuario']);
    const usuario = { id: r.id, nombre, email, rol: 'usuario' };
    res.status(201).json({ token: firmar(usuario), usuario: publico(usuario) });
  } catch (e) {
    console.error('[registro]', e.message);
    res.status(500).json({ error: 'No se pudo crear la cuenta. Intenta de nuevo.' });
  }
});

routerAuth.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const usuario = await get('SELECT * FROM usuarios WHERE email = ?', [email || '']);
    if (!usuario || !bcrypt.compareSync(String(password || ''), usuario.password)) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    res.json({ token: firmar(usuario), usuario: publico(usuario) });
  } catch (e) {
    console.error('[login]', e.message);
    res.status(500).json({ error: 'No se pudo iniciar sesión. Intenta de nuevo.' });
  }
});

// Lección grabada: tolerante a payloads planos o anidados, y user real desde BD.
function autenticar(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  jwt.verify(token, SECRETO, async (err, datos) => {
    if (err) return res.status(401).json({ error: 'Tu sesión expiró. Entra de nuevo.' });
    const id = (datos.user && datos.user.id) || datos.id;
    const usuario = await get('SELECT id, nombre, email, rol FROM usuarios WHERE id = ?', [id]);
    if (!usuario) return res.status(401).json({ error: 'Tu sesión ya no es válida.' });
    req.usuario = usuario;
    next();
  });
}

function soloAdmin(req, res, next) {
  if (req.usuario && req.usuario.rol === 'admin') return next();
  return res.status(403).json({ error: 'Esta acción es solo para administradores.' });
}

routerAuth.get('/perfil', autenticar, (req, res) => res.json({ usuario: req.usuario }));

module.exports = { routerAuth, autenticar, soloAdmin };
