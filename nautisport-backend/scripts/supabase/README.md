# Migración de PostgreSQL local → Supabase

Este directorio deja todo listo para subir la base NautiSport a Supabase **sin instalar psql ni Supabase CLI**.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `migrar-a-supabase.js` | Copia esquema + datos + triggers + usuarios demo desde tu BD local a Supabase |
| `migracion_supabase.sql` | SQL generado, listo para pegar en el **SQL Editor** del dashboard (alternativa sin connection string) |
| `migrar-a-supabase.js --verificar` | Comprueba tablas, filas, triggers, secuencia y usuarios demo en Supabase |
| `crear-usuarios-auth.js` | Crea los usuarios demo en Supabase Auth y los enlaza con `public.usuario` |
| `../../.env.supabase.example` | Plantilla con URL, claves de Supabase y cadena de conexión |

---

## Atajo: todo con dos comandos

Si ya completaste `.env.supabase` (URL, claves y connection string):

```powershell
cd nautisport-backend
npm run setup:supabase     # esquema definitivo + usuarios demo en Supabase Auth
npm run deploy:supabase    # despliega la Edge Function "api" (requiere npx supabase login)
```

La guía completa de Vercel y la Edge Function está en el [`README.md`](../../../README.md) de la raíz.

---

## Opción A — Migración directa (recomendada)

### 1. Crear el proyecto en Supabase
1. Entra a https://supabase.com/dashboard y crea un proyecto nuevo.
2. Guarda la **contraseña del usuario `postgres`** que te pide al crearlo.
3. Espera a que el proyecto termine de aprovisionarse (1–2 min).

### 2. Obtener la cadena de conexión
En el dashboard: **Project Settings → Database → Connection strings**.

Copia la de **Session pooler** (puerto **5432**), no la de Transaction pooler (6543):

```
postgresql://postgres.TU_PROYECTO:TU_PASSWORD@aws-0-TU_REGION.pooler.supabase.com:5432/postgres
```

Reemplaza `TU_PASSWORD` por la contraseña real. Si tiene caracteres especiales, codifícalos en URL:

| Carácter | Reemplazo |
|---|---|
| `@` | `%40` |
| `#` | `%23` |
| `%` | `%25` |
| `:` | `%3A` |
| `/` | `%2F` |

Agrega `?sslmode=require` al final (Supabase exige SSL).

### 3. Configurar el archivo de entorno
Desde `nautisport-backend`:

```powershell
Copy-Item .env.supabase.example .env.supabase
notepad .env.supabase
```

Pega la URL en `DATABASE_URL_SUPABASE=...` y guarda. **No subas este archivo a Git.**

### 4. Ejecutar la migración

```powershell
cd nautisport-backend
npm run migrate:supabase
```

Si la BD de Supabase ya tiene objetos de NautiSport de un intento anterior:

```powershell
npm run migrate:supabase -- --reset
```

`--reset` solo borra las tablas, tipos, secuencias y funciones de este proyecto; no toma nada del esquema de Supabase.

> Si usas `--reset`, después vuelve a ejecutar `npm run db:supabase` y `npm run seed:auth` para recuperar `auth_id`, RLS y los usuarios de Supabase Auth.

### 5. Verificar

```powershell
npm run verify:supabase
```

Resultado esperado:

```
Tablas en public: cliente, equipo, historial_estado, orden_trabajo, ot_detalle_servicio, servicio, usuario
  usuario: 3
  cliente: ...
  equipo: ...
  servicio: 18        (15 activos + 3 inactivos)
  orden_trabajo: 1
  ot_detalle_servicio: ...
  historial_estado: ...
  Triggers activos: 2
  Usuarios demo: [{"email":"admin@nautisport.cl","rol":"Administrador"}, ...]
```

---

## Opción B — Pegar SQL en el dashboard (sin connection string)

Si no quieres usar la connection string para migrar:

```powershell
cd nautisport-backend
npm run migrate:supabase -- --generar-sql
```

Esto crea `scripts/supabase/migracion_supabase.sql`. Luego:

1. Abre tu proyecto en Supabase → **SQL Editor** → **New query**.
2. Pega todo el contenido del archivo.
3. Clic en **Run**.
4. Verifica con el mismo SQL Editor: `SELECT COUNT(*) FROM usuario;` debe dar 3.

> El SQL generado incluye las credenciales demo y los hashes bcrypt. Es un archivo sensible: no lo compartas.

---

## 6. Instalar el esquema definitivo (Auth + RLS + Edge Function)

Después de copiar los datos (o si prefieres partir de cero), ejecuta en el
**SQL Editor** de Supabase:

```
supabase/migrations/20261123000000_nautisport_supabase.sql
```

Ese script es idempotente y deja:

- `public.usuario.auth_id` enlazado con `auth.users`.
- `password_hash` opcional (el login ya no usa bcrypt del backend).
- RLS activo y permisos directos de `anon`/`authenticated` revocados.
- Triggers de totales/historial y secuencia del folio.
- Los 3 perfiles demo con su rol.

Luego crea las cuentas en Supabase Auth:

```powershell
cd nautisport-backend
Copy-Item .env.supabase.example .env.supabase
notepad .env.supabase   # URL, anon key, service_role key y DATABASE_URL_SUPABASE
npm run seed:auth
```

## 7. Backend y frontend

El backend ya no se despliega en Render: corre como **Edge Function** dentro
de Supabase (`supabase/functions/api/index.ts`).

Sigue la guía principal del repositorio: [`README.md`](../../../README.md).

Resumen:

```
Frontend Vercel → https://TU_PROYECTO.supabase.co/functions/v1/api
                → Edge Function "api" → PostgreSQL
                → Supabase Auth
```

En Vercel solo debes configurar:

```env
NEXT_PUBLIC_API_URL=https://TU_PROYECTO.supabase.co/functions/v1/api
```

---

## Cuentas que quedan en Supabase Auth

| Rol | Correo |
|---|---|
| Administrador | `admin@nautisport.cl` |
| Recepción | `recepcion@nautisport.cl` |
| Técnico | `tecnico@nautisport.cl` |

La contraseña se define en `DEMO_PASSWORD` dentro de `.env.supabase` y no se
sube al repositorio. El login de la web no muestra credenciales.

---

## Observaciones importantes

- **Plan Free:** Supabase pausa proyectos inactivos después de varios días. Abre el dashboard el mismo día de la demo para despertarlo.
- **RLS activo:** el frontend no consulta las tablas directamente; pasa por la Edge Function, que conecta como `postgres`. La `anon key` no puede leer ni escribir las tablas.
- La `service_role` key solo se usa en tu computador para `npm run seed:auth`. Nunca va en Vercel.
- El folio correlativo y los triggers de montos/historial se migran tal cual; la secuencia `folio_fisico_seq` queda posicionada según los folios existentes.
- El script fuerza `SET client_encoding = 'UTF8'` para que las tildes ("fijación") no se corrompan.
- Para regenerar el SQL de datos después de crear nuevas órdenes en local, vuelve a ejecutar `--generar-sql`.
