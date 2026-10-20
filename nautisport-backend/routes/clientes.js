const express = require('express');
const router = express.Router();
const pool = require('../db');

// RF-01: Registrar un nuevo cliente
router.post('/', async (req, res) => {
  const { nombre, telefono, email } = req.body;

  // Validación básica del formato telefónico de Chile (+569)
  const regexTelefono = /^\+569\d{8}$/;
  if (!regexTelefono.test(telefono)) {
    return res.status(400).json({ 
      error: 'El teléfono debe tener el formato chileno válido (+569XXXXXXXX)' 
    });
  }

  try {
    const query = `
      INSERT INTO cliente (nombre, telefono, email) 
      VALUES ($1, $2, $3) 
      RETURNING *;
    `;
    const values = [nombre, telefono, email];
    const result = await pool.query(query, values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al registrar cliente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Consultar o buscar clientes por teléfono
router.get('/', async (req, res) => {
  const { telefono } = req.query;
  try {
    let result;
    if (telefono) {
      result = await pool.query('SELECT * FROM cliente WHERE telefono = $1', [telefono]);
    } else {
      result = await pool.query('SELECT * FROM cliente ORDER BY id_cliente DESC');
    }
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ error: 'Error al consultar clientes' });
  }
});

module.exports = router;