#!/usr/bin/env node
/**
 * Despliega la Edge Function "api" con Supabase CLI.
 *
 * Requisitos:
 *   1. npx supabase login
 *   2. Tener SUPABASE_URL en nautisport-backend/.env.supabase
 *
 * Uso (desde nautisport-backend):
 *   npm run deploy:supabase
 */
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(RAIZ, 'nautisport-backend/.env.supabase') });

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');

function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  try {
    const host = new URL(SUPABASE_URL).hostname;
    return host.split('.')[0];
  } catch {
    return '';
  }
}

const ref = projectRef();

if (!ref) {
  console.error('❌ Falta SUPABASE_URL (o SUPABASE_PROJECT_REF) en nautisport-backend/.env.supabase');
  process.exit(1);
}

console.log(`Desplegando Edge Function "api" en el proyecto ${ref}...\n`);
console.log('Si es la primera vez, ejecuta antes: npx supabase login\n');

const resultado = spawnSync(
  'npx',
  ['supabase', 'functions', 'deploy', 'api', '--project-ref', ref, '--no-verify-jwt'],
  { cwd: RAIZ, stdio: 'inherit', shell: true }
);

if (resultado.status !== 0) {
  console.error('\n❌ El despliegue falló. Revisa que hayas hecho `npx supabase login`.');
  process.exit(resultado.status || 1);
}

console.log(`\n✅ Función desplegada. Prueba:`);
console.log(`   ${SUPABASE_URL}/functions/v1/api/health`);
