# Despliegue de NautiSport

Arquitectura final: **todo el backend vive en Supabase**, sin Render ni servidores extra.

```
Navegador → Vercel (frontend Next.js)
          → Supabase Edge Function "api" (backend Express portado a Deno)
          → Supabase PostgreSQL (datos)
          → Supabase Auth (login y contraseñas)
```

| Pieza | Dónde vive |
|---|---|
| Frontend Next.js | Vercel |
| Login / usuarios / contraseñas | Supabase Auth |
| API (clientes, órdenes, servicios) | Edge Function `api` |
| Datos, triggers y folio automático | PostgreSQL de Supabase |

---

## 1. Base de datos

La vía rápida (hace el SQL y los usuarios de una vez):

```powershell
cd nautisport-backend
npm install
npm run config:supabase      # asistente: pide y valida URL, claves y cadena
npm run setup:supabase       # aplica el esquema + crea usuarios demo
```

`config:supabase` prueba la URL, las dos claves y la conexión a PostgreSQL antes
de guardar. Si prefieres editar a mano, copia `.env.supabase.example` como
`.env.supabase`, complétalo y verifica con `npm run check:supabase`.

Si prefieres hacerlo desde el dashboard, ejecuta en **SQL Editor** el archivo
`supabase/migrations/20261123000000_nautisport_supabase.sql` y después
`npm run seed:auth` (sección 2).

El script es idempotente: sirve si el proyecto está vacío y también si ya
tenías las tablas migradas desde la base local. Agrega `usuario.auth_id`,
crea los triggers, deja el catálogo de servicios, activa RLS y bloquea el
acceso directo con la `anon key` (el frontend no habla directo con las tablas).

## 2. Usuarios demo en Supabase Auth

Completa `nautisport-backend/.env.supabase` con estos datos.

Desde **Project Settings → API**:

- `SUPABASE_URL` → Project URL.
- `SUPABASE_ANON_KEY` → clave `anon public` (o `sb_publishable_...`).
- `SUPABASE_SERVICE_ROLE_KEY` → clave `service_role` (o `sb_secret_...`). **Es secreta.**

Desde **Project Settings → Database → Connection strings**:

- `DATABASE_URL_SUPABASE` → **Session pooler** (puerto 5432) con `?sslmode=require`.

Luego:

```powershell
cd nautisport-backend
npm run seed:auth
```

Esto crea/actualiza en **Supabase Auth**:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@nautisport.cl` | `nautisport123` |
| Recepción | `recepcion@nautisport.cl` | `nautisport123` |
| Técnico | `tecnico@nautisport.cl` | `nautisport123` |

y enlaza cada usuario de Auth con su fila de `public.usuario` (donde está el rol).

> Alternativa sin script: crea los 3 usuarios en **Authentication → Users**
> con esos correos y contraseñas, marcando “Auto Confirm”. El rol ya está
> preparado en `public.usuario` y se enlaza solo en el primer login.

## 3. Backend (Edge Function en Supabase)

### Opción A — Dashboard (la más simple)

1. Supabase Dashboard → **Edge Functions** → **Deploy a new function**.
2. Nombre: **`api`**.
3. En la configuración de la función, desactiva **Verify JWT**.
   Es necesario porque `/auth` y `/auth/refresh` son públicos; la función
   valida el token por su cuenta en las demás rutas.
4. Borra el código de ejemplo y pega todo el contenido de
   `supabase/functions/api/index.ts`.
5. **Deploy**.
6. Prueba en el navegador:

   ```
   https://TU_PROYECTO.supabase.co/functions/v1/api/health
   → {"estado":"ok","base_datos":"conectada","backend":"supabase-edge"}
   ```

No hay que configurar secretos: Supabase inyecta automáticamente
`SUPABASE_URL`, `SUPABASE_DB_URL` y las claves de API.

### Opción B — CLI

```powershell
cd nautisport-backend
npx supabase login
npm run deploy:supabase
```

`deploy:supabase` toma el project ref desde `SUPABASE_URL` y despliega la
función con `--no-verify-jwt`. También puedes hacerlo a mano:

```powershell
npx supabase functions deploy api --project-ref TU_PROYECTO --no-verify-jwt
```

`supabase/config.toml` ya deja `verify_jwt = false` para la función `api`.

## 4. Frontend (Vercel)

En el proyecto de Vercel → **Settings**:

- **Root Directory**: `nautisport-frontend`
- **Environment Variables**:

  ```
  NEXT_PUBLIC_API_URL=https://TU_PROYECTO.supabase.co/functions/v1/api
  ```

Márcala para **Production**, **Preview** y **Development**.

Luego **Deployments → último deploy → Redeploy**. Es obligatorio: Next.js
graba `NEXT_PUBLIC_API_URL` en el build; si no redeployas, el sitio sigue
apuntando a la URL anterior (o a `localhost`).

## 5. Probar

1. Abre `https://proyecto-nautisport.vercel.app/login`.
2. Usa el botón **Usar** de cualquiera de los 3 usuarios demo.
3. Contraseña: `nautisport123`.
4. Prueba el flujo completo: Recepción crea OT → Técnico avanza estados →
   Recepción entrega → Admin elimina una OT de prueba.

## 6. Checklist

- [ ] SQL de `supabase/migrations/20261123000000_nautisport_supabase.sql` ejecutado.
- [ ] `npm run seed:auth` terminó con “Usuarios demo listos”.
- [ ] Edge Function `api` desplegada con **Verify JWT desactivado**.
- [ ] `/functions/v1/api/health` responde conectada.
- [ ] Vercel tiene `NEXT_PUBLIC_API_URL` con la URL de la Edge Function + `/api`.
- [ ] Redeploy de Vercel después de cambiar la variable.
- [ ] Login con los 3 roles.

## Notas

- **Plan Free de Supabase:** el proyecto se pausa tras varios días sin uso.
  Abre el dashboard el mismo día de la demo para despertarlo.
- **Cold start:** la primera llamada a la Edge Function puede tardar 1–3 s.
- **Seguridad:** la `service_role` key nunca va en Vercel ni en el navegador.
  Solo se usa localmente en `npm run seed:auth`.
- **Cambiar contraseñas:** hazlo desde **Authentication → Users** en Supabase.
- **Agregar un usuario nuevo:** créalo en **Authentication → Users** y luego
  inserta su perfil/rol en `public.usuario`:
  ```sql
  INSERT INTO public.usuario (nombre, email, rol, activo)
  VALUES ('Nombre Apellido', 'correo@nautisport.cl', 'Recepcion', TRUE);
  ```
  Al primer login se enlaza solo por correo con Supabase Auth.
- **Backend Express antiguo:** queda en `nautisport-backend/` solo como
  referencia y para los scripts de migración; ya no se despliega.
