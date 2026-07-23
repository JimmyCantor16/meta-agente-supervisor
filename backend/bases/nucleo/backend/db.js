const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dominio = require('./dominio');

const db = new sqlite3.Database(path.join(__dirname, 'datos.sqlite'));

// Promesas sobre sqlite3: el resto del sistema no usa callbacks.
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, cambios: this.changes });
    });
  });
const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, fila) => (err ? reject(err) : resolve(fila)));
  });
const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, filas) => (err ? reject(err) : resolve(filas)));
  });

const TIPO_SQL = {
  texto: 'TEXT', textolargo: 'TEXT', email: 'TEXT', url: 'TEXT',
  opcion: 'TEXT', fecha: 'TEXT', imagen: 'TEXT',
  numero: 'INTEGER', precio: 'REAL', booleano: 'INTEGER',
};

async function inicializarBd() {
  await run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'usuario'
  )`);

  for (const entidad of dominio.entidades) {
    const columnas = entidad.campos
      .map((c) => `${c.nombre} ${TIPO_SQL[c.tipo] || 'TEXT'}`)
      .join(', ');
    await run(`CREATE TABLE IF NOT EXISTS ${entidad.plural} (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ${columnas},
      creado_en TEXT DEFAULT (datetime('now'))
    )`);
  }

  if (dominio.modulos && dominio.modulos.tienda) {
    await run(`CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      total REAL NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      creado_en TEXT DEFAULT (datetime('now'))
    )`);
    await run(`CREATE TABLE IF NOT EXISTS pedido_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      cantidad INTEGER NOT NULL
    )`);
  }

  if (dominio.modulos && dominio.modulos.reservas) {
    await run(`CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      recurso TEXT NOT NULL,
      fecha TEXT NOT NULL,
      hora TEXT NOT NULL,
      creado_en TEXT DEFAULT (datetime('now')),
      UNIQUE(recurso, fecha, hora)
    )`);
  }

  if (dominio.modulos && dominio.modulos.quiz) {
    await run(`CREATE TABLE IF NOT EXISTS progreso_quiz (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      puntaje INTEGER NOT NULL,
      total INTEGER NOT NULL,
      creado_en TEXT DEFAULT (datetime('now'))
    )`);
  }

  await sembrar();
}

async function sembrar() {
  const hayUsuarios = await get('SELECT COUNT(*) AS n FROM usuarios');
  if (hayUsuarios.n === 0) {
    for (const u of dominio.usuarios || []) {
      const hash = bcrypt.hashSync(u.password, 10);
      await run('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
        [u.nombre, u.email, hash, u.rol || 'usuario']);
    }
    console.log(`Semillas: ${(dominio.usuarios || []).length} usuario(s) de prueba.`);
  }

  for (const entidad of dominio.entidades) {
    const hay = await get(`SELECT COUNT(*) AS n FROM ${entidad.plural}`);
    if (hay.n > 0 || !entidad.semillas || entidad.semillas.length === 0) continue;
    const nombres = entidad.campos.map((c) => c.nombre);
    for (const semilla of entidad.semillas) {
      const valores = nombres.map((n) => (semilla[n] === undefined ? null : semilla[n]));
      await run(
        `INSERT INTO ${entidad.plural} (${nombres.join(', ')}) VALUES (${nombres.map(() => '?').join(', ')})`,
        valores
      );
    }
    console.log(`Semillas: ${entidad.semillas.length} ${entidad.etiquetaPlural.toLowerCase()}.`);
  }
}

module.exports = { db, run, get, all, inicializarBd };
