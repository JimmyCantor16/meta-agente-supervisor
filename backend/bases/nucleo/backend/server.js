const path = require('path');
const express = require('express');
const cors = require('cors');

const dominio = require('./dominio');
const { inicializarBd } = require('./db');
const { routerAuth } = require('./auth');
const { routerCrud } = require('./crud');
const { routerTienda } = require('./modulos/tienda');
const { routerReservas } = require('./modulos/reservas');
const { routerQuiz } = require('./modulos/quiz');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// El frontend consulta el esquema en runtime: mismas pantallas, cualquier dominio.
app.get('/api/_meta', (req, res) => {
  const { usuarios, ...publico } = dominio;
  res.json(publico);
});

app.use('/api/auth', routerAuth);
app.use('/api', routerCrud);
if (dominio.modulos && dominio.modulos.tienda) app.use('/api', routerTienda);
if (dominio.modulos && dominio.modulos.reservas) app.use('/api', routerReservas);
if (dominio.modulos && dominio.modulos.quiz) app.use('/api', routerQuiz);

app.get('/api/salud', (req, res) => res.json({ ok: true, nombre: dominio.nombre }));

const carpetaFrontend = path.join(__dirname, '../frontend');
app.use(express.static(carpetaFrontend));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(carpetaFrontend, 'index.html')));

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Algo salió mal en el servidor. Intenta de nuevo.' });
});

app.listen(PORT, () => console.log(`${dominio.nombre} escuchando en el puerto ${PORT}`));

inicializarBd().catch((e) => console.error('Error inicializando la base de datos:', e.message));
