const express = require('express');
const router = express.Router();
const pool = require('../db');
const { autenticar, requireRole } = require('../middleware/auth');

// RF-02: Generar una nueva Orden de Trabajo (OT) completa (Recepción o Administrador)
router.post('/', autenticar, requireRole('Recepcion', 'Administrador'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { 
      id_cliente, 
      id_equipo: id_equipo_existente, // Opcional: reutilizar un equipo ya registrado
      equipo, // { tipo, marca_modelo, peso, fijaciones, zapatos } (obligatorio si no hay id_equipo)
      fecha_entrega_estimada, 
      servicios, // Array de IDs de servicios: [1, 4]
      observaciones
    } = req.body;

    await client.query('BEGIN'); // Inicio de transacción ACID

    // 1. Usar el equipo existente o insertar uno nuevo
    let id_equipo = id_equipo_existente || null;
    if (id_equipo) {
      // Verificar que el equipo pertenezca al cliente de la orden
      const valida = await client.query(
        'SELECT 1 FROM equipo WHERE id_equipo = $1 AND id_cliente = $2',
        [id_equipo, id_cliente]
      );
      if (valida.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'El equipo indicado no pertenece a este cliente' });
      }
    } else {
      const equipoQuery = `
        INSERT INTO equipo (id_cliente, tipo, marca_modelo, peso, fijaciones, zapatos)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id_equipo;
      `;
      const equipoValues = [
        id_cliente, 
        equipo.tipo, 
        equipo.marca_modelo, 
        equipo.peso || null, 
        equipo.fijaciones || null, 
        equipo.zapatos || null
      ];
      const equipoRes = await client.query(equipoQuery, equipoValues);
      id_equipo = equipoRes.rows[0].id_equipo;
    }

    // 2. Crear la Orden de Trabajo (estado inicial 'Pendiente').
    // El folio físico lo asigna automáticamente la secuencia folio_fisico_seq (000001, 000002, ...).
    const otQuery = `
      INSERT INTO orden_trabajo (id_cliente, id_equipo, fecha_entrega_estimada, observaciones)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const otValues = [id_cliente, id_equipo, fecha_entrega_estimada, observaciones || null];
    const otRes = await client.query(otQuery, otValues);
    const nuevaOT = otRes.rows[0];

    // 3. Asociar Servicios Base seleccionados
    if (servicios && servicios.length > 0) {
      for (const id_serv of servicios) {
        // Obtener el precio base del catálogo
        const servRes = await client.query('SELECT precio_base FROM servicio WHERE id_servicio = $1', [id_serv]);
        const precio = servRes.rows[0]?.precio_base || 0;

        await client.query(`
          INSERT INTO ot_detalle_servicio (id_orden, id_servicio, precio_aplicado, es_sobrecosto)
          VALUES ($1, $2, $3, FALSE)
        `, [nuevaOT.id_orden, id_serv, precio]);
      }
    }

    await client.query('COMMIT'); // Confirmar transacción (los triggers recalcularán totales)
    res.status(201).json({
      mensaje: 'Orden de trabajo creada con éxito',
      id_orden: nuevaOT.id_orden,
      folio_fisico: nuevaOT.folio_fisico,
    });

  } catch (error) {
    await client.query('ROLLBACK'); // Cancelar si algo falla
    console.error('Error al crear la orden:', error);
    res.status(500).json({ error: 'Error al registrar la orden de trabajo' });
  } finally {
    client.release();
  }
});

// RF-03 / RF-04: Consultar órdenes activas o por ID (usuarios autenticados)
router.get('/', autenticar, async (req, res) => {
  try {
    const query = `
      SELECT 
        ot.id_orden, ot.folio_fisico, ot.estado, ot.monto_inicial, ot.monto_total, 
        ot.fecha_recepcion, ot.fecha_entrega_estimada, ot.fecha_entrega_real,
        c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
        eq.tipo AS equipo_tipo, eq.marca_modelo AS equipo_modelo,
        u.nombre AS tecnico_nombre
      FROM orden_trabajo ot
      JOIN cliente c ON ot.id_cliente = c.id_cliente
      JOIN equipo eq ON ot.id_equipo = eq.id_equipo
      LEFT JOIN usuario u ON ot.id_tecnico_asignado = u.id_usuario
      ORDER BY ot.id_orden DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al consultar órdenes:', error);
    res.status(500).json({ error: 'Error al obtener la lista de órdenes' });
  }
});

// GET /api/ordenes/:id — Detalle completo de la OT: cliente, equipo, servicios e historial
router.get('/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const idOrden = Number(id);
  if (!Number.isInteger(idOrden)) {
    return res.status(400).json({ error: 'ID de orden inválido' });
  }

  try {
    // 1. Orden + datos del cliente y del equipo
    const ordenRes = await pool.query(
      `
      SELECT
        ot.*,
        c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.email AS cliente_email,
        eq.tipo AS equipo_tipo, eq.marca_modelo AS equipo_marca_modelo,
        eq.peso AS equipo_peso, eq.fijaciones AS equipo_fijaciones, eq.zapatos AS equipo_zapatos,
        u.nombre AS tecnico_nombre
      FROM orden_trabajo ot
      JOIN cliente c ON ot.id_cliente = c.id_cliente
      JOIN equipo eq ON ot.id_equipo = eq.id_equipo
      LEFT JOIN usuario u ON ot.id_tecnico_asignado = u.id_usuario
      WHERE ot.id_orden = $1;
      `,
      [idOrden]
    );
    const orden = ordenRes.rows[0];
    if (!orden) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada' });
    }

    // 2. Detalle de servicios aplicados (catálogo + personalizados)
    const detallesRes = await pool.query(
      `
      SELECT d.id_detalle, d.id_servicio, d.descripcion_custom, d.precio_aplicado,
             d.es_sobrecosto, d.fecha_agregado, s.nombre AS servicio_nombre
      FROM ot_detalle_servicio d
      LEFT JOIN servicio s ON d.id_servicio = s.id_servicio
      WHERE d.id_orden = $1
      ORDER BY d.id_detalle;
      `,
      [idOrden]
    );

    // 3. Historial de estados (trazabilidad)
    const historialRes = await pool.query(
      `
      SELECT h.id_historial, h.estado_anterior, h.estado_nuevo, h.comentario, h.fecha_cambio,
             u.nombre AS usuario_nombre
      FROM historial_estado h
      LEFT JOIN usuario u ON h.id_usuario = u.id_usuario
      WHERE h.id_orden = $1
      ORDER BY h.fecha_cambio ASC, h.id_historial ASC;
      `,
      [idOrden]
    );

    res.json({
      ...orden,
      servicios: detallesRes.rows,
      historial: historialRes.rows,
    });
  } catch (error) {
    console.error('Error al consultar la orden:', error);
    res.status(500).json({ error: 'Error al consultar el detalle de la orden' });
  }
});

// DELETE /api/ordenes/:id — Eliminar una OT (solo Administrador).
// El detalle de servicios y el historial se eliminan en cascada (ON DELETE CASCADE).
router.delete('/:id', autenticar, requireRole('Administrador'), async (req, res) => {
  const idOrden = Number(req.params.id);
  if (!Number.isInteger(idOrden)) {
    return res.status(400).json({ error: 'ID de orden inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existeRes = await client.query(
      'SELECT folio_fisico FROM orden_trabajo WHERE id_orden = $1 FOR UPDATE',
      [idOrden]
    );
    if (existeRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Orden de trabajo no encontrada' });
    }

    await client.query('DELETE FROM orden_trabajo WHERE id_orden = $1', [idOrden]);
    await client.query('COMMIT');

    res.json({
      mensaje: `Orden N° ${idOrden} eliminada correctamente`,
      id_orden: idOrden,
      folio_fisico: existeRes.rows[0].folio_fisico,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar la orden:', error);
    res.status(500).json({ error: 'Error al eliminar la orden de trabajo' });
  } finally {
    client.release();
  }
});

// Transiciones válidas del estado de la OT (estado_ot_enum)
const TRANSICIONES_VALIDAS = {
  'Pendiente': ['En Mantención', 'Requiere Autorización', 'Finalizado'],
  'En Mantención': ['Requiere Autorización', 'Finalizado', 'Pendiente'],
  'Requiere Autorización': ['En Mantención', 'Finalizado', 'Pendiente'],
  'Finalizado': ['Entregado'],
  'Entregado': [],
};

const ESTADOS_VALIDOS = Object.keys(TRANSICIONES_VALIDAS);

// PATCH /api/ordenes/:id/estado — Cambiar estado de la OT y/o asignar técnico (Taller o Admin)
router.patch('/:id/estado', autenticar, requireRole('Tecnico', 'Recepcion', 'Administrador'), async (req, res) => {
  const { id } = req.params;
  const idOrden = Number(id);
  const { estado, id_tecnico_asignado, comentario } = req.body;

  if (!Number.isInteger(idOrden)) {
    return res.status(400).json({ error: 'ID de orden inválido' });
  }
  if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ordenRes = await client.query(
      'SELECT id_orden, estado, id_tecnico_asignado FROM orden_trabajo WHERE id_orden = $1 FOR UPDATE',
      [idOrden]
    );
    const orden = ordenRes.rows[0];
    if (!orden) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Orden de trabajo no encontrada' });
    }

    if (!TRANSICIONES_VALIDAS[orden.estado].includes(estado)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Transición no permitida: '${orden.estado}' → '${estado}'`,
      });
    }

    // Si se asigna técnico, validar que exista y tenga el rol correcto
    if (id_tecnico_asignado) {
      const tecnicoRes = await client.query(
        "SELECT 1 FROM usuario WHERE id_usuario = $1 AND rol = 'Tecnico' AND activo = TRUE",
        [id_tecnico_asignado]
      );
      if (tecnicoRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'El técnico indicado no existe o no tiene el rol de Técnico' });
      }
    }

    // Al entregar se registra la fecha real; el trigger trg_registrar_cambio_estado guarda el historial.
    // La fecha se calcula en JS para evitar reutilizar $1 en dos tipos distintos
    // (enum en "estado" y text en la comparación), lo que provoca el error 42P08 de PostgreSQL.
    const fechaEntregaReal = estado === 'Entregado' ? new Date() : null;

    await client.query(
      `
      UPDATE orden_trabajo
      SET
        estado = $1,
        id_tecnico_asignado = COALESCE($2, id_tecnico_asignado),
        fecha_entrega_real = COALESCE($4, fecha_entrega_real)
      WHERE id_orden = $3;
      `,
      [estado, id_tecnico_asignado || null, idOrden, fechaEntregaReal]
    );

    // Adjuntar el comentario al registro de historial creado por el trigger
    if (comentario) {
      await client.query(
        `
        UPDATE historial_estado
        SET comentario = $1
        WHERE id_historial = (
          SELECT MAX(id_historial) FROM historial_estado WHERE id_orden = $2
        );
        `,
        [comentario, idOrden]
      );
    }

    await client.query('COMMIT');
    const actualizada = await pool.query('SELECT * FROM orden_trabajo WHERE id_orden = $1', [idOrden]);
    res.json({ mensaje: 'Estado actualizado', orden: actualizada.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al cambiar estado:', error);
    res.status(500).json({ error: 'Error al actualizar el estado de la orden' });
  } finally {
    client.release();
  }
});

// POST /api/ordenes/:id/servicios — Agregar servicio a la OT (incluye arreglos custom con sobrecosto)
router.post('/:id/servicios', autenticar, requireRole('Tecnico', 'Recepcion', 'Administrador'), async (req, res) => {
  const { id } = req.params;
  const idOrden = Number(id);
  const { id_servicio, descripcion_custom, precio_aplicado, es_sobrecosto } = req.body;

  if (!Number.isInteger(idOrden)) {
    return res.status(400).json({ error: 'ID de orden inválido' });
  }
  if (!id_servicio && !descripcion_custom) {
    return res.status(400).json({ error: 'Indique un servicio del catálogo o una descripción personalizada' });
  }
  const precio = Number(precio_aplicado);
  if (precio_aplicado != null && (Number.isNaN(precio) || precio < 0)) {
    return res.status(400).json({ error: 'El precio aplicado no puede ser negativo' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // La orden debe existir y estar en un estado que acepte nuevos servicios
    const ordenRes = await client.query(
      "SELECT id_orden, estado FROM orden_trabajo WHERE id_orden = $1 FOR UPDATE",
      [idOrden]
    );
    const orden = ordenRes.rows[0];
    if (!orden) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Orden de trabajo no encontrada' });
    }
    if (['Finalizado', 'Entregado'].includes(orden.estado)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `No se pueden agregar servicios a una orden '${orden.estado}'` });
    }

    // Servicio del catálogo: usar precio_base si no se indica uno. Custom: es sobrecosto por defecto
    let precioFinal = precio_aplicado != null ? precio : null;
    let esSobrecosto = es_sobrecosto;
    if (id_servicio) {
      const servRes = await client.query('SELECT precio_base FROM servicio WHERE id_servicio = $1', [id_servicio]);
      if (servRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Servicio del catálogo no encontrado' });
      }
      if (precioFinal == null) precioFinal = servRes.rows[0].precio_base;
      if (esSobrecosto == null) esSobrecosto = precioFinal > servRes.rows[0].precio_base;
    } else if (esSobrecosto == null) {
      esSobrecosto = true;
    }

    await client.query(
      `
      INSERT INTO ot_detalle_servicio (id_orden, id_servicio, descripcion_custom, precio_aplicado, es_sobrecosto)
      VALUES ($1, $2, $3, $4, $5);
      `,
      [idOrden, id_servicio || null, descripcion_custom || null, precioFinal, esSobrecosto]
    );

    // Un sobrecosto requiere aprobación del cliente: la orden pasa a 'Requiere Autorización'
    if (esSobrecosto && orden.estado !== 'Requiere Autorización') {
      await client.query("UPDATE orden_trabajo SET estado = 'Requiere Autorización' WHERE id_orden = $1", [idOrden]);
    }

    await client.query('COMMIT'); // El trigger recalcula monto_inicial y monto_total

    const totals = await pool.query(
      'SELECT monto_inicial, monto_total, estado FROM orden_trabajo WHERE id_orden = $1',
      [idOrden]
    );
    res.status(201).json({ mensaje: 'Servicio agregado', ...totals.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al agregar servicio:', error);
    res.status(500).json({ error: 'Error al agregar el servicio a la orden' });
  } finally {
    client.release();
  }
});

module.exports = router;