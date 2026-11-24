#!/usr/bin/env node
/**
 * Crea/actualiza los usuarios demo en Supabase Auth y los enlaza con
 * la tabla public.usuario (que guarda el rol de NautiSport).
 *
 * Uso (desde nautisport-backend):
 *   1. Copia .env.supabase.example a .env.supabase
 *   2. Pega SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *      y DATABASE_URL_SUPABASE.
 *   3. npm run seed:auth
 *
 * La service_role key es SECRETA: no la subas a Git ni la pongas en Vercel.
 */
const path = require('path');
const { Client } = require('pg');

const RAIZ = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(RAIZ, '.env') });
require('dotenv').config({ path: path.join(RAIZ, '.env.supabase') });

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  leerClavePlural('SUPABASE_SECRET_KEYS');
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  leerClavePlural('SUPABASE_PUBLISHABLE_KEYS');
const DATABASE_URL =
  process.env.DATABASE_URL_SUPABASE ||
  process.env.SUPABASE_DB_URL;

const PASSWORD_DEMO = 'nautisport123';

const USUARIOS = [
  { nombre: 'Administrador NautiSport', email: 'admin@nautisport.cl', rol: 'Administrador' },
  { nombre: 'Recepción NautiSport', email: 'recepcion@nautisport.cl', rol: 'Recepcion' },
  { nombre: 'Técnico NautiSport', email: 'tecnico@nautisport.cl', rol: 'Tecnico' },
];

function leerClavePlural(nombre) {
  try {
    const claves = JSON.parse(process.env[nombre] || '{}');
    return claves.default || '';
  } catch {
    return '';
  }
}

function faltante(nombre, valor) {
  if (!valor) {
    console.error(`❌ Falta ${nombre} en nautisport-backend/.env.supabase`);
    return true;
  }
  return false;
}

async function adminApi(ruta, opciones = {}) {
  const respuesta = await fetch(`${SUPABASE_URL}/auth/v1/admin${ruta}`, {
    ...opciones,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  });

  const textoRespuesta = await respuesta.text();
  let datos = null;
  try {
    datos = textoRespuesta ? JSON.parse(textoRespuesta) : null;
  } catch {
    datos = textoRespuesta;
  }

  if (!respuesta.ok) {
    const mensaje = datos?.message || datos?.error_description || datos?.error || respuesta.statusText;
    throw new Error(`Admin API ${respuesta.status}: ${mensaje}`);
  }
  return datos;
}

async function listarUsuarios() {
  const datos = await adminApi('/users?page=1&per_page=1000');
  if (Array.isArray(datos)) return datos;
  return datos?.users || [];
}

async function crearOActualizarAuth(usuario, existentes) {
  const previo = existentes.find(
    (u) => (u.email || '').toLowerCase() === usuario.email.toLowerCase()
  );

  const cuerpo = {
    email: usuario.email,
    password: PASSWORD_DEMO,
    email_confirm: true,
    app_metadata: {
      ...(previo?.app_metadata || {}),
      rol: usuario.rol,
      nombre: usuario.nombre,
    },
    user_metadata: {
      ...(previo?.user_metadata || {}),
      nombre: usuario.nombre,
      rol: usuario.rol,
    },
  };

  if (previo) {
    const actualizado = await adminApi(`/users/${previo.id}`, {
      method: 'PUT',
      body: JSON.stringify(cuerpo),
    });
    console.log(`↻ Auth actualizado: ${usuario.email}`);
    return actualizado?.id || previo.id;
  }

  const creado = await adminApi('/users', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });
  console.log(`✔ Auth creado: ${usuario.email}`);
  return creado?.id;
}

async function enlazarPerfil(db, usuario, authId) {
  await db.query(
    `
    INSERT INTO public.usuario (nombre, email, rol, activo, auth_id, password_hash)
    VALUES ($1, $2, $3::public.rol_usuario, TRUE, $4, NULL)
    ON CONFLICT (email) DO UPDATE
      SET nombre = EXCLUDED.nombre,
          rol = EXCLUDED.rol,
          activo = TRUE,
          auth_id = EXCLUDED.auth_id,
          password_hash = NULL;
    `,
    [usuario.nombre, usuario.email, usuario.rol, authId]
  );
}

async function verificarLogin(usuario) {
  if (!ANON_KEY) return null;
  const respuesta = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usuario.email, password: PASSWORD_DEMO }),
  });
  return respuesta.ok;
}

(async () => {
  console.log('NautiSport · usuarios demo en Supabase Auth\n');

  if (
    faltante('SUPABASE_URL', SUPABASE_URL) ||
    faltante('SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY) ||
    faltante('DATABASE_URL_SUPABASE', DATABASE_URL)
  ) {
    console.error('\nRevisa nautisport-backend/.env.supabase (puedes basarte en .env.supabase.example).');
    process.exit(1);
  }

  // Quita sslmode para que pg no exija verify-full (antivirus/proxies en Windows).
  const sinSslMode = (() => {
    try {
      const u = new URL(DATABASE_URL);
      u.searchParams.delete('sslmode');
      return u.toString();
    } catch {
      return DATABASE_URL;
    }
  })();

  const db = new Client({
    connectionString: sinSslMode,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  try {
    const columnas = await db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'auth_id'`
    );
    if (columnas.rowCount === 0) {
      throw new Error(
        'La tabla public.usuario no tiene la columna auth_id. Ejecuta primero supabase/migrations/20261123000000_nautisport_supabase.sql en el SQL Editor de Supabase.'
      );
    }

    const existentes = await listarUsuarios();

    for (const usuario of USUARIOS) {
      const authId = await crearOActualizarAuth(usuario, existentes);
      if (!authId) throw new Error(`Supabase Auth no devolvió el id de ${usuario.email}`);
      await enlazarPerfil(db, usuario, authId);
      const loginOk = await verificarLogin(usuario);
      console.log(
        `   ${usuario.rol.padEnd(14)} ${usuario.email}  ${loginOk === true ? 'login OK' : loginOk === false ? 'login FALLÓ' : ''}`
      );
    }

    console.log('\n✅ Usuarios demo listos.');
    console.log(`   Contraseña para todos: ${PASSWORD_DEMO}`);
    console.log('   Cámbiala antes de usar el sistema fuera de la demo.\n');
  } finally {
    await db.end();
  }
})().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
