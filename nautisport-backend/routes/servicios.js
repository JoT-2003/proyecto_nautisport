const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, requireRole } = require('../middleware/auth');

const TIPOS_VALIDOS = ['Ski', 'Snowboard', 'Otros'];

// GET /api/servicios — Catálogo completo (usuarios autenticados)
router.get('/', autenticar, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM servicio ORDER BY tipo_equipo NULLS FIRST, id_servicio'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Error al consultar catálogo de servicios' });
  }
});

// POST /api/servicios — Crear servicio (solo Administrador)
router.post('/', autenticar, requireRole('Administrador'), async (req, res) => {
  const { nombre, tipo_equipo, descripcion, precio_base } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del servicio es obligatorio' });
  }
  const precio = Number(precio_base);
  if (precio_base == null || Number.isNaN(precio) || precio < 0) {
    return res.status(400).json({ error: 'El precio base debe ser un número mayor o igual a 0' });
  }
  if (tipo_equipo != null && !TIPOS_VALIDOS.includes(tipo_equipo)) {
    return res.status(400).json({ error: `Tipo de equipo inválido. Valores: ${TIPOS_VALIDOS.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO servicio (nombre, tipo_equipo, descripcion, precio_base)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
      `,
      [nombre.trim(), tipo_equipo || null, descripcion || null, precio]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un servicio con ese nombre para esa disciplina' });
    }
    console.error('Error al crear servicio:', error);
    res.status(500).json({ error: 'Error al crear el servicio' });
  }
});

// PUT /api/servicios/:id — Editar servicio (solo Administrador)
router.put('/:id', autenticar, requireRole('Administrador'), async (req, res) => {
  const { id } = req.params;
  const { nombre, tipo_equipo, descripcion, precio_base, activo } = req.body;

  if (precio_base != null && (Number.isNaN(Number(precio_base)) || Number(precio_base) < 0)) {
    return res.status(400).json({ error: 'El precio base no puede ser negativo' });
  }
  if (tipo_equipo != null && !TIPOS_VALIDOS.includes(tipo_equipo)) {
    return res.status(400).json({ error: `Tipo de equipo inválido. Valores: ${TIPOS_VALIDOS.join(', ')}` });
  }

  try {
    // Se lee el registro actual y se fusionan solo los campos enviados,
    // para permitir explícitamente poner tipo_equipo en NULL ("Ambos")
    const actualRes = await pool.query('SELECT * FROM servicio WHERE id_servicio = $1', [id]);
    const actual = actualRes.rows[0];
    if (!actual) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const result = await pool.query(
      `
      UPDATE servicio
      SET nombre = $1, tipo_equipo = $2, descripcion = $3, precio_base = $4, activo = $5
      WHERE id_servicio = $6
      RETURNING *;
      `,
      [
        nombre ?? actual.nombre,
        tipo_equipo !== undefined ? (tipo_equipo || null) : actual.tipo_equipo,
        descripcion !== undefined ? (descripcion || null) : actual.descripcion,
        precio_base != null ? Number(precio_base) : actual.precio_base,
        activo != null ? activo : actual.activo,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    // Violación de UNIQUE en nombre + disciplina
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un servicio con ese nombre para esa disciplina' });
    }
    console.error('Error al actualizar servicio:', error);
    res.status(500).json({ error: 'Error al actualizar el servicio' });
  }
});

// DELETE /api/servicios/:id — Desactivación lógica (solo Administrador).
// No se borra físicamente porque ot_detalle_servicio lo referencia en el historial.
router.delete('/:id', autenticar, requireRole('Administrador'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE servicio SET activo = FALSE WHERE id_servicio = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    res.json({ mensaje: 'Servicio desactivado', servicio: result.rows[0] });
  } catch (error) {
    console.error('Error al desactivar servicio:', error);
    res.status(500).json({ error: 'Error al desactivar el servicio' });
  }
});

module.exports = router;
