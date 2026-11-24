const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

// POST /api/auth — Iniciar sesión (RF: Autenticación y RBAC)
router.post('/', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM usuario WHERE email = $1 AND activo = TRUE',
      [email.trim().toLowerCase()]
    );
    const usuario = result.rows[0];

    // Mensaje genérico para no revelar si el email existe
    if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id_usuario: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
});

// GET /api/auth/me — Datos del usuario autenticado (verificación de sesión)
router.get('/me', autenticar, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id_usuario, nombre, email, rol, activo FROM usuario WHERE id_usuario = $1 AND activo = TRUE',
      [req.usuario.id_usuario]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario ya no existe o está inactivo' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al verificar sesión:', error);
    res.status(500).json({ error: 'Error al verificar la sesión' });
  }
});

module.exports = router;
