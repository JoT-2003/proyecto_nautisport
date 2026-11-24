#!/usr/bin/env node
/**
 * Despliega la Edge Function "api" con Supabase CLI y verifica /health.
 *
 * Autenticación (elige una):
 *   a) npx supabase login                      (abre el navegador)
 *   b) SUPABASE_ACCESS_TOKEN=sbp_... en .env.supabase
 *
 * Uso (desde nautisport-backend):
 *   npm run deploy:supabase
 */
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(RAIZ, 'nautisport-backend/.env.supabase') });

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  try {
    const host = new URL(SUPABASE_URL).hostname;
    return host.split('.')[0];
  } catch {
    return '';
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verificarSalud() {
  const url = `${SUPABASE_URL}/functions/v1/api/health`;
  for (let intento = 1; intento <= 4; intento += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const data = await res.json();
      if (res.ok && data.base_datos === 'conectada') {
        console.log(`✅ /health responde: ${JSON.stringify(data)}`);
        return true;
      }
      console.log(`   intento ${intento}: ${res.status} ${JSON.stringify(data)}`);
    } catch (error) {
      console.log(`   intento ${intento}: ${error.message}`);
    }
    if (intento < 4) await esperar(6000);
  }
  console.log(`\n⚠ La función se desplegó, pero /health no respondió todavía.`);
  console.log(`  Ábrela en el navegador en unos segundos: ${url}`);
  return false;
}

(async () => {
  const ref = projectRef();
  if (!ref) {
    console.error('❌ Falta SUPABASE_URL (o SUPABASE_PROJECT_REF) en nautisport-backend/.env.supabase');
    process.exit(1);
  }

  console.log(`Desplegando Edge Function "api" en el proyecto ${ref}...\n`);
  if (!ACCESS_TOKEN) {
    console.log('No hay SUPABASE_ACCESS_TOKEN en .env.supabase.');
    console.log('Si el comando falla, ejecuta antes en tu terminal: npx supabase login\n');
  }

  const resultado = spawnSync(
    'npx',
    ['supabase', 'functions', 'deploy', 'api', '--project-ref', ref, '--no-verify-jwt'],
    { cwd: RAIZ, stdio: 'inherit', shell: true, env: process.env }
  );

  if (resultado.status !== 0) {
    console.error('\n❌ El despliegue falló.');
    console.error('Autentícate con una de estas opciones:');
    console.error('  a) npx supabase login');
    console.error('  b) Agrega SUPABASE_ACCESS_TOKEN=sbp_... a nautisport-backend/.env.supabase');
    console.error('     (créalo en https://supabase.com/dashboard/account/tokens)');
    process.exit(resultado.status || 1);
  }

  console.log('\n✅ Función desplegada. Verificando...\n');
  const ok = await verificarSalud();
  process.exit(ok ? 0 : 1);
})();
