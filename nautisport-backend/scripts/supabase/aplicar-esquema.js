#!/usr/bin/env node
/**
 * Aplica el esquema definitivo de NautiSport a Supabase usando la
 * connection string de .env.supabase. Evita copiar/pegar el SQL.
 *
 * Uso (desde nautisport-backend):
 *   npm run db:supabase
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const RAIZ = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(RAIZ, 'nautisport-backend/.env') });
require('dotenv').config({ path: path.join(RAIZ, 'nautisport-backend/.env.supabase') });

const DATABASE_URL = process.env.DATABASE_URL_SUPABASE || process.env.SUPABASE_DB_URL;
const ARCHIVO = path.join(RAIZ, 'supabase/migrations/20261123000000_nautisport_supabase.sql');

(async () => {
  if (!DATABASE_URL) {
    console.error('❌ Falta DATABASE_URL_SUPABASE en nautisport-backend/.env.supabase');
    process.exit(1);
  }
  if (!fs.existsSync(ARCHIVO)) {
    console.error(`❌ No se encontró ${ARCHIVO}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(ARCHIVO, 'utf8');
  console.log('Aplicando esquema NautiSport a Supabase...\n');

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
    await db.query("SET client_encoding = 'UTF8'");
    await db.query(sql);

    const usuarios = await db.query('SELECT COUNT(*)::int AS total FROM public.usuario');
    const servicios = await db.query('SELECT COUNT(*)::int AS total FROM public.servicio');
    const authId = await db.query(
      `SELECT COUNT(*)::int AS total FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'auth_id'`
    );

    console.log('✅ Esquema aplicado.');
    console.log(`   usuarios: ${usuarios.rows[0].total}`);
    console.log(`   servicios: ${servicios.rows[0].total}`);
    console.log(`   auth_id: ${authId.rows[0].total ? 'OK' : 'FALTA'}`);
    console.log('\nSiguiente paso: npm run seed:auth');
  } finally {
    await db.end();
  }
})().catch((error) => {
  console.error('\n❌ Error aplicando el esquema:', error.message);
  process.exit(1);
});
