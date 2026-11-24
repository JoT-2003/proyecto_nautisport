#!/usr/bin/env node
/**
 * Migración local → Supabase (esquema + datos + triggers + credenciales demo).
 *
 * Modos de uso (desde nautisport-backend):
 *   npm run migrate:supabase                     Aplica directo usando .env.supabase
 *   npm run migrate:supabase -- --reset          Borra primero los objetos creados por este proyecto
 *   npm run migrate:supabase -- --generar-sql    Genera scripts/supabase/migracion_supabase.sql
 *   npm run migrate:supabase -- --verificar      Solo verifica el estado de la BD de Supabase
 *
 * El modo --generar-sql no necesita credenciales de Supabase: sirve para pegar el SQL
 * en el SQL Editor del dashboard. Los demás modos necesitan DATABASE_URL_SUPABASE.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const RAIZ = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(RAIZ, '.env') });
require('dotenv').config({ path: path.join(RAIZ, '.env.supabase') });

const LOCAL_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.DATABASE_URL_SUPABASE || process.env.SUPABASE_DB_URL;

const generarSQL = process.argv.includes('--generar-sql');
const verificar = process.argv.includes('--verificar');
const reset = process.argv.includes('--reset');

const ARCHIVO_SQL = path.join(__dirname, 'migracion_supabase.sql');

// Usuarios demo que deben quedar listos para la muestra
const DEMO = [
  { nombre: 'Administrador NautiSport', email: 'admin@nautisport.cl', rol: 'Administrador' },
  { nombre: 'Recepción NautiSport', email: 'recepcion@nautisport.cl', rol: 'Recepcion' },
  { nombre: 'Técnico NautiSport', email: 'tecnico@nautisport.cl', rol: 'Tecnico' },
];
const PASSWORD_DEMO = 'nautisport123';

// Orden respeta las llaves foráneas
const TABLAS = [
  { nombre: 'usuario', columnas: ['id_usuario', 'nombre', 'email', 'password_hash', 'rol', 'activo', 'fecha_creacion'] },
  { nombre: 'cliente', columnas: ['id_cliente', 'nombre', 'telefono', 'email', 'fecha_registro'] },
  { nombre: 'equipo', columnas: ['id_equipo', 'id_cliente', 'tipo', 'marca_modelo', 'peso', 'fijaciones', 'zapatos', 'fecha_creacion'] },
  { nombre: 'servicio', columnas: ['id_servicio', 'nombre', 'tipo_equipo', 'descripcion', 'precio_base', 'activo'] },
  { nombre: 'orden_trabajo', columnas: ['id_orden', 'folio_fisico', 'id_cliente', 'id_equipo', 'id_tecnico_asignado', 'fecha_recepcion', 'fecha_entrega_estimada', 'fecha_entrega_real', 'estado', 'monto_inicial', 'monto_total', 'observaciones', 'fecha_creacion'] },
  { nombre: 'ot_detalle_servicio', columnas: ['id_detalle', 'id_orden', 'id_servicio', 'descripcion_custom', 'precio_aplicado', 'es_sobrecosto', 'fecha_agregado'] },
  { nombre: 'historial_estado', columnas: ['id_historial', 'id_orden', 'estado_anterior', 'estado_nuevo', 'id_usuario', 'comentario', 'fecha_cambio'] },
];

const SQL_RESET = `
-- Limpieza de los objetos creados por NautiSport (no toca nada de Supabase)
DROP TABLE IF EXISTS historial_estado, ot_detalle_servicio, orden_trabajo, servicio, equipo, cliente, usuario CASCADE;
DROP SEQUENCE IF EXISTS folio_fisico_seq CASCADE;
DROP FUNCTION IF EXISTS fn_registrar_cambio_estado() CASCADE;
DROP FUNCTION IF EXISTS fn_actualizar_totales_ot() CASCADE;
DROP TYPE IF EXISTS estado_ot_enum, tipo_equipo_enum, rol_usuario CASCADE;
`;

function escaparSQL(valor) {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'boolean') return valor ? 'TRUE' : 'FALSE';
  if (typeof valor === 'number') return String(valor);
  if (valor instanceof Date) return `'${valor.toISOString()}'`;
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function columnasParaInsert(tabla) {
  return tabla.columnas.join(', ');
}

function placeholders(tabla) {
  return tabla.columnas.map((_, i) => `$${i + 1}`).join(', ');
}

// El DDL canónico carga el catálogo; aquí se copia desde la BD local para conservar
// los precios y estados reales (incluidos los servicios desactivados).
function obtenerDDL() {
  const contenido = fs.readFileSync(path.join(RAIZ, 'scripts/ddl triggers.sql'), 'utf8');
  const inicio = contenido.indexOf('-- Inserción del catálogo oficial');
  const fin = contenido.indexOf('CREATE OR REPLACE FUNCTION fn_actualizar_totales_ot');
  if (inicio === -1 || fin === -1) throw new Error('No se pudo separar el catálogo del DDL canónico');
  return contenido.slice(0, inicio) + contenido.slice(fin);
}

async function conectar(url, nombre) {
  if (!url) throw new Error(`Falta la cadena de conexión ${nombre}. Revisa .env / .env.supabase`);
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("SET client_encoding = 'UTF8'");
  return client;
}

async function leerDatos(local) {
  const datos = {};
  for (const tabla of TABLAS) {
    const res = await local.query(
      `SELECT ${tabla.columnas.join(', ')} FROM ${tabla.nombre} ORDER BY 1`
    );
    datos[tabla.nombre] = res.rows;
  }
  return datos;
}

function sqlDeDatos(datos) {
  const bloques = [];
  for (const tabla of TABLAS) {
    const filas = datos[tabla.nombre];
    if (filas.length === 0) continue;
    bloques.push(`\n-- Datos: ${tabla.nombre} (${filas.length} filas)`);
    for (const fila of filas) {
      const valores = tabla.columnas.map(c => escaparSQL(fila[c])).join(', ');
      bloques.push(
        `INSERT INTO ${tabla.nombre} (${columnasParaInsert(tabla)}) VALUES (${valores});`
      );
    }
  }
  return bloques.join('\n');
}

function sqlDeSeed() {
  const hash = bcrypt.hashSync(PASSWORD_DEMO, 10);
  return `
-- Credenciales demo (contraseña: ${PASSWORD_DEMO})
INSERT INTO usuario (nombre, email, password_hash, rol, activo) VALUES
${DEMO.map(u => `  ('${u.nombre}', '${u.email}', '${hash}', '${u.rol}', TRUE)`).join(',\n')}
ON CONFLICT (email) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      rol = EXCLUDED.rol,
      password_hash = EXCLUDED.password_hash,
      activo = TRUE;
`;
}

function sqlDeSecuencias() {
  const ajustes = TABLAS.map(t => {
    const [col] = t.columnas; // primera columna = SERIAL PK
    return `SELECT setval(pg_get_serial_sequence('${t.nombre}', '${col}'), ` +
      `GREATEST(COALESCE((SELECT MAX(${col}) FROM ${t.nombre}), 1), 1), ` +
      `(SELECT COUNT(*) > 0 FROM ${t.nombre}));`;
  });
  return `
-- Dejar las secuencias donde corresponden para no repetir IDs
${ajustes.join('\n')}
SELECT setval(
  'folio_fisico_seq',
  GREATEST(COALESCE((SELECT MAX(CASE WHEN folio_fisico ~ '^[0-9]+$' THEN folio_fisico::bigint END) FROM orden_trabajo), 0) + 1, 1),
  false
);
`;
}

function sqlCompleto(datos) {
  return [
    '-- Migración NautiSport → Supabase (generada automáticamente)',
    "-- Ejecutar en el SQL Editor de Supabase. Codificación UTF-8.",
    'SET client_encoding = \'UTF8\';',
    'BEGIN;',
    reset ? SQL_RESET : '',
    obtenerDDL(),
    sqlDeDatos(datos),
    sqlDeSeed(),
    sqlDeSecuencias(),
    'COMMIT;',
    '',
  ].join('\n');
}

async function aplicarDirecto(datos) {
  const destino = await conectar(SUPABASE_URL, 'DATABASE_URL_SUPABASE');
  try {
    const existe = await destino.query("SELECT to_regclass('public.usuario') AS tabla");
    if (existe.rows[0].tabla && !reset) {
      throw new Error(
        'La BD de Supabase ya tiene la tabla usuario. Usa --reset para reemplazar los objetos de NautiSport.'
      );
    }

    await destino.query('BEGIN');
    if (reset) await destino.query(SQL_RESET);
    await destino.query(obtenerDDL());

    for (const tabla of TABLAS) {
      const filas = datos[tabla.nombre];
      if (filas.length === 0) continue;
      const texto = `INSERT INTO ${tabla.nombre} (${columnasParaInsert(tabla)}) VALUES (${placeholders(tabla)})`;
      for (const fila of filas) {
        await destino.query(texto, tabla.columnas.map(c => fila[c]));
      }
      console.log(`  ${tabla.nombre}: ${filas.length} filas`);
    }

    const hash = bcrypt.hashSync(PASSWORD_DEMO, 10);
    for (const u of DEMO) {
      await destino.query(
        `INSERT INTO usuario (nombre, email, password_hash, rol, activo)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (email) DO UPDATE
           SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol,
               password_hash = EXCLUDED.password_hash, activo = TRUE`,
        [u.nombre, u.email, hash, u.rol]
      );
    }

    await destino.query(sqlDeSecuencias());
    await destino.query('COMMIT');
    console.log('\n✅ Migración aplicada correctamente en Supabase');
  } catch (error) {
    await destino.query('ROLLBACK');
    throw error;
  } finally {
    await destino.end();
  }
}

async function verificarDestino() {
  const destino = await conectar(SUPABASE_URL, 'DATABASE_URL_SUPABASE');
  try {
    const tablas = await destino.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('Tablas en public:', tablas.rows.map(r => r.table_name).join(', ') || '(ninguna)');

    for (const t of ['usuario', 'cliente', 'equipo', 'servicio', 'orden_trabajo', 'ot_detalle_servicio', 'historial_estado']) {
      const r = await destino.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
      console.log(`  ${t}: ${r.rows[0].n}`);
    }
    const trig = await destino.query(`
      SELECT COUNT(*)::int AS n FROM pg_trigger
      WHERE tgname LIKE 'trg_%' AND NOT tgisinternal
    `);
    console.log('  Triggers activos:', trig.rows[0].n);
    const seq = await destino.query('SELECT last_value, is_called FROM folio_fisico_seq');
    console.log('  Secuencia folio:', JSON.stringify(seq.rows[0]));

    const usuarios = await destino.query(
      "SELECT email, rol FROM usuario WHERE email LIKE '%@nautisport.cl' ORDER BY id_usuario"
    );
    console.log('  Usuarios demo:', JSON.stringify(usuarios.rows));
  } finally {
    await destino.end();
  }
}

(async () => {
  if (!LOCAL_URL && !verificar) {
    throw new Error('No hay DATABASE_URL local. Revisa nautisport-backend/.env');
  }

  if (verificar) {
    await verificarDestino();
    return;
  }

  const local = await conectar(LOCAL_URL, 'DATABASE_URL');
  let datos;
  try {
    console.log('Leyendo datos de la BD local...');
    datos = await leerDatos(local);
    for (const tabla of TABLAS) {
      console.log(`  ${tabla.nombre}: ${datos[tabla.nombre].length} filas`);
    }
  } finally {
    await local.end();
  }

  if (generarSQL) {
    fs.writeFileSync(ARCHIVO_SQL, sqlCompleto(datos), 'utf8');
    console.log(`\n✅ SQL generado: ${ARCHIVO_SQL}`);
    console.log('   Pégalo en el SQL Editor de Supabase y ejecútalo.');
  } else {
    await aplicarDirecto(datos);
  }
})().catch(error => {
  console.error('\n❌ Error en la migración:', error.message);
  process.exit(1);
});
