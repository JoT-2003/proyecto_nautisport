# Despliegue de NautiSport

Arquitectura:

```
Navegador → Vercel (frontend Next.js) → Render (backend Express) → Supabase (PostgreSQL)
```

## 1. Base de datos (Supabase)

Sigue `nautisport-backend/scripts/supabase/README.md`:

```powershell
cd nautisport-backend
Copy-Item .env.supabase.example .env.supabase   # pegar la URL de Session pooler
npm run migrate:supabase
npm run verify:supabase
```

## 2. Backend (Render)

1. Render Dashboard → **New → Blueprint** → conecta `https://github.com/JoT-2003/proyecto_nautisport`.
2. Render leerá `render.yaml` y creará el servicio `nautisport-backend`.
3. En **Environment** completa:
   - `DATABASE_URL`: la misma URL de Supabase (Session pooler, `?sslmode=require`).
   - `JWT_SECRET`: se genera solo (o pon uno largo).
4. Espera el deploy y prueba:
   ```
   https://TU-SERVICIO.onrender.com/api/health
   → {"estado":"ok","base_datos":"conectada"}
   ```

> Plan free de Render: el servicio se duerme tras ~15 min sin uso. Ábrelo unos minutos antes de la demo para despertarlo.

## 3. Frontend (Vercel)

En el proyecto de Vercel → **Settings**:

- **Root Directory**: `nautisport-frontend`
- **Environment Variables**:
  ```
  NEXT_PUBLIC_API_URL=https://TU-SERVICIO.onrender.com/api
  ```
- **Deployments → Redeploy** (la variable se graba en el build; sin redeploy no se aplica).

Verifica que el login funcione con `admin@nautisport.cl` / `nautisport123`.

## 4. Checklist rápido

- [ ] Supabase migrado (`npm run verify:supabase`)
- [ ] Backend responde `/api/health`
- [ ] Vercel tiene `NEXT_PUBLIC_API_URL` con la URL de Render + `/api`
- [ ] Redeploy de Vercel después de cambiar la variable
- [ ] Login con los 3 roles
