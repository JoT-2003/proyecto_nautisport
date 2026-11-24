# Migración de PostgreSQL local → Supabase

Este directorio deja todo listo para subir la base NautiSport a Supabase **sin instalar psql ni Supabase CLI**.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `migrar-a-supabase.js` | Copia esquema + datos + triggers + usuarios demo desde tu BD local a Supabase |
| `migracion_supabase.sql` | SQL generado, listo para pegar en el **SQL Editor** del dashboard (alternativa sin connection string) |
| `verificar-supabase.js` | Comprueba tablas, filas, triggers, secuencia y usuarios demo en Supabase |
| `../../.env.supabase.example` | Plantilla con la URL de conexión de Supabase |

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

## 6. Apuntar el backend a Supabase

Cuando el backend se despliegue (o para probar localmente contra Supabase), usa **la misma URL** en `nautisport-backend/.env`:

```env
DATABASE_URL=postgresql://postgres.TU_PROYECTO:TU_PASSWORD@aws-0-TU_REGION.pooler.supabase.com:5432/postgres?sslmode=require
PORT=4000
JWT_SECRET=un_secreto_largo_y_aleatorio
```

Luego reinicia el backend y comprueba:

```
GET https://TU-BACKEND.onrender.com/api/health
→ {"estado":"ok","base_datos":"conectada"}
```

> Si vas a probar contra Supabase desde tu máquina, haz una copia de tu `.env` local antes de cambiarlo, para poder volver a la BD local.

## 7. Frontend

Supabase **no reemplaza al backend**: el frontend sigue hablando con Express. En `nautisport-frontend/.env.local` (o `.env.production`):

```env
NEXT_PUBLIC_API_URL=https://TU-BACKEND.onrender.com/api
```

Si el demo corre todo en local, déjalo en `http://localhost:4000/api`. El CORS del backend ya está abierto (`app.use(cors())`).

---

## Credenciales que quedan en Supabase

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@nautisport.cl` | `nautisport123` |
| Recepción | `recepcion@nautisport.cl` | `nautisport123` |
| Técnico | `tecnico@nautisport.cl` | `nautisport123` |

---

## Observaciones importantes

- **plan Free:** Supabase pausa proyectos inactivos después de varios días. Si la demo es el miércoles, abre el dashboard el mismo día (o desactiva la pausa en el plan) para evitar que la BD esté dormida.
- La autenticación la sigue haciendo el backend con JWT; **no hace falta configurar RLS** en Supabase (el backend usa el usuario `postgres`).
- El folio correlativo y los triggers de montos/historial se migran tal cual; la secuencia `folio_fisico_seq` queda posicionada según los folios existentes.
- El script fuerza `SET client_encoding = 'UTF8'` para que las tildes ("fijación") no se corrompan, problema que ocurrió al aplicar migraciones con `psql` en Windows.
- Para regenerar el SQL después de crear nuevas órdenes en local, vuelve a ejecutar `--generar-sql`.
