const express = require('express');
const cors = require('cors');
const pool = require('./db');

//importar rutas
const clientesRouter = require('./routes/clientes');
const ordenesRouter = require('./routes/ordenes');
const serviciosRouter = require('./routes/servicios');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors());
app.use(express.json());
//Conecta rutas de las API
app.use('/api/clientes', clientesRouter);
app.use('/api/ordenes', ordenesRouter);
app.use('/api/servicios', serviciosRouter);
app.use('/api/auth', authRouter);

// Endpoint de salud: útil para verificar que el servidor y la BD responden
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', base_datos: 'conectada' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ estado: 'ok', base_datos: 'sin conexión' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
