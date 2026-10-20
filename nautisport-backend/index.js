const express = require('express');
const cors = require('cors');
const pool = require('./db');

//importar rutas
const clientesRouter = require('./routes/clientes');
const ordenesRouter = require('./routes/ordenes');

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors());
app.use(express.json());
//Conecta rutas de las API
app.use('/api/clientes', clientesRouter);
app.use('/api/ordenes', ordenesRouter);

// Endpoint de prueba: Consulta el catálogo de servicios cargado en PostgreSQL
app.get('/api/servicios', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM servicio');
    res.json(result.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Error al consultar catálogo de servicios' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});