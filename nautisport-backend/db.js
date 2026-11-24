const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('Conexión exitosa a la base de datos PostgreSQL (nautisport_db)');
});

pool.on('error', (err) => {
  console.error('Error inesperado en la conexión de PostgreSQL:', err);
  process.exit(-1);
});

module.exports = pool;