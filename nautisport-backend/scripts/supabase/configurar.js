#!/usr/bin/env node
/**
 * Asistente para completar nautisport-backend/.env.supabase.
 *
 * Uso (desde nautisport-backend):
 *   npm run config:supabase          → pregunta los datos y los valida
 *   npm run check:supabase           → valida el archivo actual y prueba conexiones
 *
 * Los valores se guardan solo en tu computador (.env.supabase está fuera de Git).
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const RAIZ = path.resolve(__dirname, '../..');
const ARCHIVO = path.join(RAIZ, '.env.supabase');

const PLACEHOLDERS = /TU_REF|TU_PROYECTO|TU_PASSWORD|TU_REGION|tu_region|tu-proyecto|\.\.\./i;

function limpiar(valor) {
  let v = (valor || '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  // Quita un comentario pegado al valor: "clave  # comentario"
  v = v.replace(/\s+#.*$/, '').trim();
  return v;
}

function validarUrl(valor) {
  const v = limpiar(valor).replace(/\/+$/, '');
  if (!v) return { error: 'La URL no puede estar vacía.' };
  if (PLACEHOLDERS.test(v)) return { error: 'Todavía tiene texto de ejemplo (TU_REF). Usa la URL real.' };
  let u;
  try {
    u = new URL(v);
  } catch {
    return { error: 'No parece una URL válida. Debe empezar con https://' };
  }
  if (u.protocol !== 'https:') return { error: 'Debe empezar con https://' };
  if (!u.hostname.endsWith('.supabase.co')) {
    return { error: 'Debe ser la Project URL de Supabase: https://xxxx.supabase.co' };
  }
  const ref = u.hostname.split('.')[0];
  if (!/^[a-z0-9-]{8,}$/i.test(ref)) return { error: 'El identificador del proyecto no parece válido.' };
  return { valor: `https://${u.hostname}`, ref };
}

function validarClave(valor, tipo) {
  const v = limpiar(valor);
  if (!v) return { error: 'La clave no puede estar vacía.' };
  if (PLACEHOLDERS.test(v)) return { error: 'Todavía tiene texto de ejemplo (...). Copia la clave real.' };
  if (/\s/.test(v)) return { error: 'La clave no debe tener espacios ni comentarios.' };
  if (v.length < 40) return { error: `La clave parece incompleta (largo ${v.length}).` };

  const jwt = v.startsWith('eyJ');
  const publishable = v.startsWith('sb_publishable_');
  const secret = v.startsWith('sb_secret_');

  if (tipo === 'anon' && !jwt && !publishable) {
    return { error: 'Debe ser la clave anon public (empieza con eyJ...) o publishable (sb_publishable_...).' };
  }
  if (tipo === 'service' && !jwt && !secret) {
    return { error: 'Debe ser la clave service_role (empieza con eyJ...) o secret (sb_secret_...).' };
  }
  return { valor: v };
}

function validarDbUrl(valor, refEsperado) {
  let v = limpiar(valor);
  if (!v) return { error: 'La cadena de conexión no puede estar vacía.' };
  if (PLACEHOLDERS.test(v)) {
    return { error: 'Todavía tiene TU_REF, TU_PASSWORD o tu_region. Copia la cadena real del dashboard.' };
  }
  if (!/^postgres(ql)?:\/\//i.test(v)) return { error: 'Debe empezar con postgresql://' };

  let u;
  try {
    u = new URL(v);
  } catch {
    return { error: 'No se pudo interpretar la cadena. Revisa que la contraseña no tenga caracteres sin codificar (@ → %40).' };
  }
  if (!u.username || !u.password) {
    return { error: 'Falta el usuario o la contraseña en la cadena de conexión.' };
  }
  if (u.port === '6543') {
    return { error: 'Esa es la Transaction pooler (6543). Usa la Session pooler (5432).' };
  }
  const esPooler = /^postgres\.[a-z0-9-]+$/i.test(u.username);
  const esDirecta = /^postgres$/i.test(u.username) && /^db\./i.test(u.hostname);
  if (!esPooler && !esDirecta) {
    return { error: 'El usuario debe verse como postgres.TU_REF (Session pooler).' };
  }
  const refDb = esPooler
    ? u.username.replace(/^postgres\./i, '')
    : (u.hostname.match(/^db\.([^.]+)\./i) || [])[1];
  if (refEsperado && refDb && refDb !== refEsperado) {
    return { error: `El proyecto de la base (${refDb}) no coincide con la Project URL (${refEsperado}).` };
  }

  const hostOk =
    u.hostname.endsWith('.pooler.supabase.com') ||
    /^db\.[a-z0-9-]+\.supabase\.co$/i.test(u.hostname) ||
    u.hostname.endsWith('.supabase.co');
  if (!hostOk) return { error: 'El host no parece de Supabase. Copia la cadena desde Project Settings → Database.' };

  if (!/[?&]sslmode=require/i.test(v)) {
    v += (v.includes('?') ? '&' : '?') + 'sslmode=require';
  }
  return { valor: v };
}

// pg interpreta sslmode=require como verify-full y falla con los certificados
// que inyectan algunos antivirus/proxies en Windows. Para los scripts locales
// quitamos ese parámetro y usamos ssl: { rejectUnauthorized: false }.
function cadenaSinSslMode(cadena) {
  try {
    const u = new URL(cadena);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return cadena;
  }
}

function enmascarar(valor) {
  if (!valor) return '(vacío)';
  if (valor.length <= 14) return valor;
  return `${valor.slice(0, 8)}…${valor.slice(-4)}`;
}

function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(texto, (respuesta) => {
    rl.close();
    resolve(respuesta);
  }));
}

function preguntarOculto(texto) {
  if (!process.stdin.isTTY) return preguntar(texto);

  return new Promise((resolve) => {
    process.stdout.write(texto);
    const stdin = process.stdin;
    let valor = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const terminar = () => {
      stdin.removeListener('data', alRecibir);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      resolve(valor);
    };

    const alRecibir = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') { terminar(); return; }
        if (char === '\u0003') { process.stdout.write('\n'); process.exit(1); }
        if (char === '\u007f' || char === '\b') {
          if (valor.length) {
            valor = valor.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          valor += char;
          process.stdout.write('*');
        }
      }
    };

    stdin.on('data', alRecibir);
  });
}

async function preguntarValidado(texto, validador, { oculto = false } = {}) {
  for (;;) {
    const respuesta = oculto ? await preguntarOculto(texto) : await preguntar(texto);
    const resultado = validador(respuesta);
    if (!resultado.error) return resultado;
    console.log(`  ⚠ ${resultado.error}\n`);
  }
}

async function probarConexiones({ url, anon, service, db }) {
  let todoOk = true;

  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anon },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) console.log('  ✔ Project URL y anon key responden');
    else {
      todoOk = false;
      console.log(`  ✖ anon key: Supabase respondió ${res.status}. Revisa la clave.`);
    }
  } catch (error) {
    todoOk = false;
    console.log(`  ✖ No se pudo llegar a ${url}: ${error.message}`);
  }

  try {
    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) console.log('  ✔ service_role key válida');
    else {
      todoOk = false;
      console.log(`  ✖ service_role key: Supabase respondió ${res.status}. Revisa la clave.`);
    }
  } catch (error) {
    todoOk = false;
    console.log(`  ✖ No se pudo validar la service_role key: ${error.message}`);
  }

  let cliente;
  try {
    const { Client } = require('pg');
    // rejectUnauthorized: false evita fallos con antivirus/proxies que
    // interceptan TLS en Windows. La conexión sigue cifrada.
    cliente = new Client({
      connectionString: cadenaSinSslMode(db),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    });
    await cliente.connect();
    await cliente.query('SELECT 1');
    console.log('  ✔ Conexión a PostgreSQL correcta');
  } catch (error) {
    todoOk = false;
    const detalle = error.code ? `${error.code}: ${error.message}` : error.message;
    console.log(`  ✖ No se pudo conectar a PostgreSQL: ${detalle}`);
  } finally {
    if (cliente) { try { await cliente.end(); } catch { /* ignore */ } }
  }

  return todoOk;
}

function leerArchivo() {
  if (!fs.existsSync(ARCHIVO)) {
    console.log('❌ No existe nautisport-backend/.env.supabase');
    process.exit(1);
  }
  const vars = {};
  for (const linea of fs.readFileSync(ARCHIVO, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

async function modoCheck() {
  const vars = leerArchivo();
  const url = validarUrl(vars.SUPABASE_URL);
  const anon = validarClave(vars.SUPABASE_ANON_KEY, 'anon');
  const service = validarClave(vars.SUPABASE_SERVICE_ROLE_KEY, 'service');
  const db = validarDbUrl(vars.DATABASE_URL_SUPABASE, url.ref);

  const errores = [
    ['SUPABASE_URL', url],
    ['SUPABASE_ANON_KEY', anon],
    ['SUPABASE_SERVICE_ROLE_KEY', service],
    ['DATABASE_URL_SUPABASE', db],
  ].filter(([, r]) => r.error);

  if (errores.length) {
    console.log('❌ El archivo todavía tiene problemas:\n');
    for (const [nombre, r] of errores) console.log(`  ${nombre}: ${r.error}`);
    console.log('\nEjecuta: npm run config:supabase');
    process.exit(1);
  }

  console.log('Formato correcto. Probando conexiones reales...\n');
  const ok = await probarConexiones({
    url: url.valor,
    anon: anon.valor,
    service: service.valor,
    db: db.valor,
  });
  process.exit(ok ? 0 : 1);
}

async function modoAsistente() {
  console.log('\nConfiguración de NautiSport en Supabase');
  console.log('Abre el dashboard de tu proyecto y ten a mano estos datos.\n');

  const url = await preguntarValidado(
    '1) Project URL (https://xxxx.supabase.co): ',
    validarUrl
  );
  console.log(`   Proyecto: ${url.ref}\n`);

  const anon = await preguntarValidado(
    '2) anon public key (pegar y Enter): ',
    (v) => validarClave(v, 'anon'),
    { oculto: true }
  );

  const service = await preguntarValidado(
    '3) service_role key (pegar y Enter): ',
    (v) => validarClave(v, 'service'),
    { oculto: true }
  );

  if (service.valor === anon.valor) {
    console.log('  ⚠ La service_role key es igual a la anon. Revisa, son claves distintas.\n');
  }

  console.log('\nProject Settings → Database → Connection strings → Session pooler.');
  console.log('Reemplaza [YOUR-PASSWORD] por la contraseña de la base.\n');
  const db = await preguntarValidado(
    '4) Cadena postgresql://...: ',
    (v) => validarDbUrl(v, url.ref)
  );

  const contenido = [
    '# Generado por npm run config:supabase — NO subir a Git.',
    `SUPABASE_URL=${url.valor}`,
    `SUPABASE_ANON_KEY=${anon.valor}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service.valor}`,
    `DATABASE_URL_SUPABASE=${db.valor}`,
    '',
  ].join('\n');

  fs.writeFileSync(ARCHIVO, contenido, 'utf8');
  console.log('\n✅ Guardado en nautisport-backend/.env.supabase');
  console.log(`   anon: ${enmascarar(anon.valor)}`);
  console.log(`   service: ${enmascarar(service.valor)}`);
  console.log(`   base de datos: ${enmascarar(db.valor)}\n`);

  console.log('Probando conexiones reales...\n');
  const ok = await probarConexiones({
    url: url.valor,
    anon: anon.valor,
    service: service.valor,
    db: db.valor,
  });

  if (ok) {
    console.log('\nTodo listo. Siguiente paso:');
    console.log('   npm run setup:supabase\n');
  } else {
    console.log('\nCorrige lo indicado y vuelve a ejecutar: npm run config:supabase');
    process.exit(1);
  }
}

const esCheck = process.argv.includes('--check');
(esCheck ? modoCheck() : modoAsistente()).catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
