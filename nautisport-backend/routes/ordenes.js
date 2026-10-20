const express = require('express');
const router = express.Router();
const pool = require('../db');

// RF-02: Generar una nueva Orden de Trabajo (OT) completa
router.post('/', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { 
      id_cliente, 
      equipo, // { tipo, marca_modelo, peso, fijaciones, zapatos }
      fecha_entrega_estimada, 
      servicios, // Array de IDs de servicios: [1, 4]
      observaciones,
      folio_fisico
    } = req.body;

    await client.query('BEGIN'); // Inicio de transacción ACID

    // 1. Insertar Equipo del cliente
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
    const id_equipo = equipoRes.rows[0].id_equipo;

    // 2. Crear la Orden de Trabajo (estado inicial 'Pendiente')
    const otQuery = `
      INSERT INTO orden_trabajo (folio_fisico, id_cliente, id_equipo, fecha_entrega_estimada, observaciones)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const otValues = [folio_fisico || null, id_cliente, id_equipo, fecha_entrega_estimada, observaciones || null];
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
    res.status(201).json({ mensaje: 'Orden de trabajo creada con éxito', id_orden: nuevaOT.id_orden });

  } catch (error) {
    await client.query('ROLLBACK'); // Cancelar si algo falla
    console.error('Error al crear la orden:', error);
    res.status(500).json({ error: 'Error al registrar la orden de trabajo' });
  } finally {
    client.release();
  }
});

// RF-03 / RF-04: Consultar órdenes activas o por ID
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        ot.id_orden, ot.folio_fisico, ot.estado, ot.monto_total, ot.fecha_recepcion,
        c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
        eq.tipo AS equipo_tipo, eq.marca_modelo AS equipo_modelo
      FROM orden_trabajo ot
      JOIN cliente c ON ot.id_cliente = c.id_cliente
      JOIN equipo eq ON ot.id_equipo = eq.id_equipo
      ORDER BY ot.id_orden DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al consultar órdenes:', error);
    res.status(500).json({ error: 'Error al obtener la lista de órdenes' });
  }
});

module.exports = router;