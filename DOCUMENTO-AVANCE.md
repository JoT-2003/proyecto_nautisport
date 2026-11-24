# 📄 Documento de Avance — Proyecto Nautisport

> **Última actualización:** sesión de desarrollo del 23/11/2026
> **Objetivo del documento:** registrar todo lo avanzado, lo pendiente y el punto exacto de retomada para la próxima sesión.
>
> **Arquitectura vigente:** frontend en Vercel + **Supabase Auth** (login) + **Supabase Edge Function `api`** (backend) + PostgreSQL de Supabase. Ya no se despliega Express/Render. La guía paso a paso está en [`README.md`](README.md).

---

## 1. Descripción general del sistema

Sistema de gestión para el taller NautiSport (ski y snowboard). Flujo de negocio:

```
Recepción del equipo (cliente + equipo + servicios)  →  Orden de Trabajo (OT)
  → Taller (técnico avanza estados, detecta sobrecostos)
  → Autorización de sobrecostos por el cliente
  → Finalizado → Entregado
```

**Stack:** PostgreSQL (Supabase) + Supabase Auth + Supabase Edge Functions (Deno) + Next.js 16 (React 19) + Tailwind 4 + Axios.

---

## 2. Estructura del proyecto

```
Proyecto-Nautisport-main/
├── inicio.py                          # (archivo original, no parte del sistema web)
├── ref.jpeg / Taller Sist avance 1.pdf# Documento de referencia del taller
├── nautisport-backend/                # API Express (puerto 4000)
│   ├── index.js                       # Servidor + registro de rutas + /api/health
│   ├── db.js                          # Pool PostgreSQL (usa DATABASE_URL de .env)
│   ├── middleware/auth.js             # autenticar (JWT) + requireRole(...roles)
│   ├── routes/
│   │   ├── clientes.js                # POST/GET + GET /:id/equipos
│   │   ├── ordenes.js                 # POST/GET + GET /:id + PATCH /:id/estado + POST /:id/servicios
│   │   ├── servicios.js               # GET catálogo + POST/PUT/DELETE (Admin)
│   │   └── auth.js                    # POST login + GET /me
│   ├── scripts/
│   │   ├── ddl triggers.sql           # DDL completo de la BD (tablas, enums, triggers)
│   │   ├── migracion_servicios.sql    # Migración del catálogo (tipo_equipo + precios reales)
│   │   ├── verificacion.sql / usuario.sql
│   │   └── seed_usuario.js            # Seed de 3 usuarios demo (uno por rol)
│   ├── .env.example                   # Plantilla DATABASE_URL + JWT_SECRET
│   └── package.json                   # scripts: dev / start / seed
└── nautisport-frontend/               # Next.js 16 App Router (puerto 3000)
    ├── .env.local                     # NEXT_PUBLIC_API_URL=http://localhost:4000/api
    ├── next.config.mjs                # Tailwind/turbopack + experimental.agentUpgrade
    └── src/
        ├── app/
        │   ├── layout.js              # Root: metadata NautiSport, lang es, fuentes Geist
        │   ├── globals.css            # Tema claro (se quitó el dark-mode por defecto)
        │   ├── login/page.js          # Inicio de sesión (fuera del layout de la app)
        │   └── (app)/                 # Grupo de rutas CON layout compartido + guard de sesión
        │       ├── layout.js          # AppShell
        │       ├── page.js            # Panel de inicio con accesos por módulo
        │       ├── recepcion/page.js  # Formulario de OT (Fase 2 completa)
        │       ├── ordenes/           # Módulo Órdenes (Fase 4 completa)
        │       │   ├── page.js        # Tabla con filtros por estado + búsqueda libre
        │       │   └── [id]/page.js   # Detalle de OT + timeline + comanda imprimible
        │       ├── taller/page.js     # Tablero kanban del taller (Fase 6 completa)
        │       └── servicios/page.js  # Catálogo de servicios para Admin (Fase 7 completa)
        ├── components/
        │   ├── ui/                    # Input, Select, Textarea, Button, Badge, Card, Modal, Tabla, index.js
        │   ├── layout/                # Sidebar (nav activa + filtro por rol) + AppShell (guard de sesión)
        │   └── taller/                # TarjetaOT + ModalAgregarServicio
        ├── hooks/useClienteLookup.js  # Búsqueda de cliente por teléfono con debounce
        ├── hooks/useAuth.js           # Sesión JWT (login/logout, validación con /auth/me)
        ├── lib/validaciones.js        # Regex +569, formatearFecha, formatearPrecio
        └── services/api.js            # Axios → baseURL de .env.local
```

---

## 3. ✅ LO AVANZADO

### Fase 0 — Entorno (COMPLETA)
- [x] `.env.local` en frontend (`NEXT_PUBLIC_API_URL`) y `.env.example` en backend
- [x] Alias de rutas `@/` verificado en `jsconfig.json`
- [x] Dependencias instaladas en ambos proyectos (`node_modules` OK)
- [x] Next.js actualizado **16.4.2 → 16.4.6** por vulnerabilidad de seguridad (build verificado)
- [x] Backend: agregadas dependencias `bcryptjs` + `jsonwebtoken`; scripts `npm run dev / start / seed`

### Fase 1 — Layout y componentes UI (COMPLETA)
- [x] Componentes en `src/components/ui/`:
  - `Input` / `Select` / `Textarea` (label, required con *, error integrado, readOnly)
  - `Button` (variantes primary/secondary/danger, spinner de loading)
  - `Badge` (colores por estado de OT — coincide con `estado_ot_enum`)
  - `Card` (secciones de formulario, variante `highlight` amarilla)
  - `Modal` (cierre con Escape y clic fuera, footer de acciones)
  - `Tabla` (genérica por columnas con `render` custom — lista para Fase 4)
  - `index.js` barrel de exportación
- [x] `Sidebar` (barra negra/amarilla, link activo con `usePathname`, módulos Taller/Servicios marcados "Pronto")
- [x] `AppShell` (marco general; futuro punto de control de sesión/rol)
- [x] Route group `src/app/(app)/` — toda la app comparte layout; `/login` vivirá fuera
- [x] Home `/` con tarjetas de acceso por módulo
- [x] Formulario de Recepción movido de `page.js` antiguo (eliminado) a `(app)/recepcion/page.js`

### Fase 2 — Módulo Recepción (COMPLETA)
- [x] **Búsqueda de cliente por teléfono** (hook `useClienteLookup`, debounce 500ms, cancelación de requests)
  - Cliente encontrado → autocompleta nombre/email (solo lectura) y reutiliza su `id_cliente` (no duplica registros)
  - Cliente nuevo → campos editables normales
- [x] **Equipos anteriores**: se listan en un banner; al seleccionar uno se precarga en solo lectura y la OT reutiliza ese `id_equipo`
- [x] **Validación en vivo** del teléfono `+569XXXXXXXX` con mensaje bajo el campo y bloqueo de envío
- [x] **Modal de confirmación** con resumen completo (folio, fecha en español, cliente con etiqueta Registrado/Nuevo, equipo, servicios, observaciones) antes del envío real
- [x] Mensajes de resultado con color según éxito (verde) / error (rojo)
- [x] Backend de soporte:
  - `GET /api/clientes/:id/equipos`
  - `POST /api/ordenes` acepta `id_equipo` opcional (valida que pertenezca al cliente)

### Fase 3 — Endpoints backend (COMPLETA)
- [x] **Auth:** `POST /api/auth` (login JWT 8h con rol) y `GET /api/auth/me` (verificación de sesión)
- [x] **Detalle OT:** `GET /api/ordenes/:id` → OT + cliente + equipo + técnico + servicios + historial
- [x] **Cambio de estado:** `PATCH /api/ordenes/:id/estado` con validación de transiciones, asignación de técnico (valida rol), comentario adjuntado al historial y `fecha_entrega_real` automática al Entregar
- [x] **Servicios a la OT:** `POST /api/ordenes/:id/servicios` (catálogo usa `precio_base`; custom = sobrecosto por defecto; sobrecosto → estado "Requiere Autorización" automático)
- [x] **Catálogo:** `PUT /api/servicios/:id` protegido con JWT + rol Administrador (primer endpoint con RBAC)
- [x] **Middleware** `middleware/auth.js`: `autenticar` + `requireRole` (listo para aplicar en Fase 5)
- [x] **Seed:** `scripts/seed_usuario.js` — 3 usuarios demo (contraseña definida en `DEMO_PASSWORD`, nunca en el repo):
  - `admin@nautisport.cl` (Administrador) · `recepcion@nautisport.cl` (Recepcion) · `tecnico@nautisport.cl` (Tecnico)
- [x] `GET /api/health` para verificar servidor + BD
- [x] Sintaxis verificada con `node --check` en todos los archivos

### Transiciones de estado implementadas (backend)
```
Pendiente → En Mantención | Requiere Autorización | Finalizado
En Mantención → Requiere Autorización | Finalizado | Pendiente
Requiere Autorización → En Mantención | Finalizado | Pendiente
Finalizado → Entregado
Entregado → (estado final, sin cambios)
```

---

## 4. ⏳ LO PENDIENTE (por fase)

### Fase 4 — Módulo Órdenes en el frontend (COMPLETA)
- [x] `(app)/ordenes/page.js`: tabla real con el componente `Tabla`
  - Columnas: N° OT, folio, cliente (nombre+teléfono), equipo, estado (con `Badge`), monto total, fecha de recepción y acción "Ver detalle"
  - Filtros por estado (chips con contador de OT por estado) y búsqueda libre por N° OT, folio, cliente, teléfono o equipo (filtrado en cliente)
  - Botón "+ Nueva Recepción" en la cabecera
- [x] `(app)/ordenes/[id]/page.js`: **detalle completo** consumiendo `GET /api/ordenes/:id`
  - Tarjetas de cliente y equipo; fechas (recepción, estimada, real) y técnico asignado
  - Tabla de servicios aplicados con distintivo "Sobrecosto" y totales (monto inicial vs. total, destacado en rojo cuando hay sobrecostos)
  - **Timeline del historial de estados** con badges anterior → nuevo, fecha, usuario y comentario
  - Estados de carga, error (con datos del backend) y observaciones de recepción
- [x] Backend: `GET /api/ordenes` ahora incluye `monto_inicial`, `fecha_entrega_estimada` y `fecha_entrega_real`
- [x] `formatearFechaHora()` agregada a `lib/validaciones.js` para timestamps de la BD

### Fase 5 — Login y RBAC (COMPLETA)
- [x] Backend: **todas las rutas protegidas** con `autenticar` + `requireRole`:
  - `POST /clientes`, `POST /ordenes` → Recepción o Administrador
  - `GET /clientes`, `GET /clientes/:id/equipos`, `GET /ordenes`, `GET /ordenes/:id` → cualquier usuario autenticado
  - `PATCH /ordenes/:id/estado`, `POST /ordenes/:id/servicios` → Técnico, Recepción o Administrador
  - `PUT /servicios/:id` → solo Administrador (desde Fase 3)
  - `GET /servicios` → usuarios autenticados
- [x] Frontend: `/login` (fuera del grupo `(app)`, sin navegación) con formulario y credenciales de prueba visibles
- [x] Hook `useAuth`: valida el token contra `GET /api/auth/me` en cada carga, expone `login`/`logout`
- [x] Interceptor de Axios en `services/api.js`: envía `Authorization: Bearer <token>` en todas las peticiones y redirige a `/login` ante 401 (excepto llamadas a `/auth` para no romper el login fallido)
- [x] `AppShell` protege todas las rutas del grupo `(app)`: verifica sesión y redirige a `/login` si no hay
- [x] Sidebar muestra nombre y rol del usuario (Administrador/Recepción/Técnico) + botón "Salir"

### Fase 6 — Módulo Taller (COMPLETA)
- [x] `(app)/taller/page.js`: **tablero kanban** con 4 columnas (Pendiente · En Mantención · Requiere Autorización · Finalizado), contador por columna y refresco automático tras cada acción
- [x] `components/taller/TarjetaOT.jsx`: tarjeta con N° OT (link al detalle), cliente, equipo, folio, fecha estimada, técnico asignado y monto total; acciones según estado y rol:
  - **Pendiente** → "Iniciar mantención" (el técnico se autoasigna con su `id_usuario`)
  - **En Mantención** → "+ Servicio" (solo técnico) y "Finalizar"
  - **Requiere Autorización** → Recepción/Admin: "Aprobar" (→ En Mantención) o "Rechazar" (→ **Finalizado**, decisión acordada); Técnico: solo lectura
  - **Finalizado** → "Listo para entrega" (paso a Entregado queda en Fase 7)
- [x] `components/taller/ModalAgregarServicio.jsx`: servicio del catálogo (con precio base visible) o arreglo personalizado, precio aplicado opcional, y marca de **sobrecosto** → al guardar, el backend pasa la OT a "Requiere Autorización"
- [x] Mensajes con los cambios de estado en el historial (comentarios: "Mantención iniciada", "Trabajo finalizado", "Sobrecosto autorizado/rechazado por el cliente")
- [x] Sidebar: Taller **activado** y menú filtrado por rol (Recepción solo lo ven Admin/Recepción; Servicios solo Admin)
- [x] Backend: `GET /api/ordenes` ahora incluye `tecnico_nombre` (LEFT JOIN usuario)

### Fase 7 — Gestión de servicios y cierre (COMPLETA)
- [x] **Migración del catálogo** (`scripts/migracion_servicios.sql`, idempotente):
  - Nueva columna `servicio.tipo_equipo` (Ski / Snowboard / NULL = ambos)
  - Único por `(nombre, tipo_equipo)` en vez de nombre global
  - Elimina servicios antiguos sin uso y desactiva los referenciados en OT históricas
  - Carga los **15 servicios oficiales con precios reales** (9 Ski + 6 Snowboard, ver tabla en la sección 8)
- [x] DDL canónico (`ddl triggers.sql`) actualizado para instalaciones nuevas
- [x] Backend: `POST /api/servicios` (crear) y `DELETE /api/servicios/:id` (desactivación lógica), ambos solo Administrador; `GET` ordena por disciplina
- [x] `(app)/servicios/page.js`: CRUD del catálogo — tabla con disciplina/precio/estado, modal crear/editar, desactivar/reactivar y guard de rol
- [x] **Recepción**: catálogo filtrado por disciplina del equipo (`Otros` = todos), precio visible en cada servicio, limpieza de selección al cambiar tipo/equipo y **total estimado** en la selección y en el modal de confirmación
- [x] **Entrega**: botón "Entregar equipo" en la columna Finalizado del Taller (Recepción/Admin) → estado `Entregado` con `fecha_entrega_real` automática
- [x] **Comanda imprimible**: botón "Imprimir comanda" en el detalle de la OT, estilos `print:` (oculta navegación y botones, fondo blanco, firmas Cliente/Taller)
- [x] **Home corregido**: tarjeta de Taller ahora enlazada (bug reportado), Servicios activo solo para Administrador y tarjetas filtradas por rol

### Fase 8 — Preparación de la muestra (COMPLETA)
- [x] **Folio físico correlativo automático**: secuencia PostgreSQL `folio_fisico_seq` + `DEFAULT lpad(nextval(...), 6, '0')` en `orden_trabajo.folio_fisico`
  - Migración idempotente: `scripts/migracion_folio_automatico.sql` (normaliza folios antiguos a 6 dígitos y completa los que estaban nulos)
  - El formulario de Recepción ya **no pide folio**: muestra "Se asigna automáticamente al registrar la orden"
  - El backend dejó de enviar `folio_fisico` en el INSERT para que PostgreSQL aplique el `DEFAULT`
- [x] **Eliminación de órdenes (solo Administrador)**:
  - `DELETE /api/ordenes/:id` protegido con `requireRole('Administrador')`; borra en cascada servicios e historial (`ON DELETE CASCADE`)
  - Botón "Eliminar" en la tabla de órdenes y en el detalle, con modal de confirmación y aviso de que la acción es irreversible
  - Verificado: Recepción recibe **403**, Admin recibe **200**, y la OT deja de existir (404)
- [x] **Credenciales de muestra listas**: seed re-ejecutado y los 3 usuarios verificados por login real
  - `/login` ahora lista las 3 cuentas demo con botón **"Usar"** que rellena correo y contraseña automáticamente
- [x] Corrección de 4 nombres de servicios con tildes corruptas en la BD (`fijaciÃ³n` → `fijación`) y `SET client_encoding = 'UTF8'` agregado a la migración de catálogo

### Fase 9 — Preparación para Supabase (LISTO PARA EJECUTAR)
- [x] `nautisport-backend/scripts/supabase/migrar-a-supabase.js`: copia **esquema + datos + triggers + usuarios demo** desde la BD local a Supabase
  - Modos: directo (con `.env.supabase`), `--generar-sql` (SQL para pegar en el SQL Editor), `--verificar`, `--reset`
  - Fuerza `client_encoding = 'UTF8'` y reposiciona todas las secuencias (incluida `folio_fisico_seq`)
  - Probado de extremo a extremo contra una BD local que simuló Supabase (7 tablas, 2 triggers, 3 usuarios demo)
- [x] `scripts/supabase/migracion_supabase.sql`: SQL generado y listo para pegar en el dashboard (incluye datos actuales y hashes bcrypt)
- [x] `scripts/supabase/README.md`: instructivo completo (obtener connection string de Session pooler, ejecutar, verificar y apuntar backend/frontend)
- [x] `.env.supabase.example`, `.env.example` del frontend y `.gitignore` del backend creados
- [x] Se quitó una contraseña real que estaba expuesta en `nautisport-backend/.env.example` (ahora placeholders)
- [ ] **Pendiente de ejecutar:** requiere la connection string del proyecto Supabase del usuario; una vez entregada se corre `npm run migrate:supabase` y `npm run verify:supabase`

### Fase 10 — Backend y login dentro de Supabase (23/11/2026)
- [x] Login migrado a **Supabase Auth**: los usuarios demo se crean con `npm run seed:auth` y se enlazan a `public.usuario.auth_id`.
- [x] Backend Express portado a una **Edge Function** (`supabase/functions/api/index.ts`) con todos los endpoints: auth, clientes, servicios, órdenes, estados, servicios de OT y borrado.
- [x] Esquema definitivo idempotente en `supabase/migrations/20261123000000_nautisport_supabase.sql`: `auth_id`, RLS, permisos bloqueados para `anon`/`authenticated`, triggers y secuencias.
- [x] Frontend con refresh automático de sesión (`src/lib/sesion.js` + interceptor en `src/services/api.js`).
- [x] Guía única de despliegue en `README.md` (Supabase SQL Editor + Edge Function + Vercel).
- [x] Probado localmente de punta a punta con un mock de Supabase Auth y PostgreSQL: login, refresh, permisos por rol, CRUD, folio, estados, sobrecostos, historial y borrado en cascada.
- [ ] **Pendiente de ejecutar por el usuario:** aplicar el SQL en su proyecto, correr `npm run seed:auth`, desplegar la función `api` con **Verify JWT desactivado** y configurar `NEXT_PUBLIC_API_URL` en Vercel.

### Mejoras adicionales registradas (no bloquean)
- [ ] `npm audit` reporta 16 vulnerabilidades en dependencias transitivas del frontend (6 backend). Revisar con calma; **no usar `--force`**
- [ ] Considerar campo de fotos/estado del equipo en la recepción si el documento del taller lo exige (ver `Taller Sist avance 1.pdf`)

---

## 5. ▶️ PUNTO DE RETOMADA (próxima sesión)

**Las 7 fases del plan + la preparación de la muestra están completas.** Para la entrega del miércoles:

1. **Levantar backend y frontend** en terminales separadas (sección 6) y dejar ambas abiertas durante la demo
2. **Probar el flujo completo** con los 3 roles:
   - Recepción: registrar OT → verificar que el folio se asigne solo (000002 en adelante) → cobrar servicios con precios
   - Técnico: iniciar mantención → agregar servicio/sobrecosto → finalizar
   - Recepción/Admin: aprobar o rechazar sobrecosto → entregar equipo → imprimir comanda
   - Admin: eliminar una OT de prueba desde la tabla o el detalle
3. **Ingresar con las cuentas demo** (sin botón de credenciales en el login, desde "Usar" en el login): `admin@` / `recepcion@` / `tecnico@nautisport.cl`, contraseña privada definida en `DEMO_PASSWORD`
4. **Antes de presentar**, confirmar `https://TU_PROYECTO.supabase.co/functions/v1/api/health` → `{"estado":"ok","base_datos":"conectada","backend":"supabase-edge"}`

---

## 6. 🚀 Cómo levantar el proyecto (recordatorio)

> Para la demo en producción sigue [`README.md`](README.md): Supabase (SQL + Auth + Edge Function) y Vercel. Lo de abajo queda como referencia del entorno local antiguo.

**Base de datos:** ejecutar `nautisport-backend/scripts/ddl triggers.sql` en PostgreSQL si la BD no existe aún (crea tablas, enums, triggers y catálogo de servicios).

**Backend local (legacy, ya no se despliega):**
```bash
cd nautisport-backend
# copiar .env.example → .env y poner la contraseña real de PostgreSQL en DATABASE_URL
npm install
npm run seed      # crea los usuarios demo
npm run dev       # http://localhost:4000
# Verificar: GET http://localhost:4000/api/health → {"estado":"ok","base_datos":"conectada"}
```

**Frontend:**
```bash
cd nautisport-frontend
npm install
npm run dev       # http://localhost:3000
```

**Migración del catálogo (BD existente):** aplicar una vez el script que agrega `tipo_equipo` y los 15 servicios con precios reales:
```bash
cd nautisport-backend
psql -U postgres -d nautisport_db -f scripts/migracion_servicios.sql
# También se puede pegar el contenido en pgAdmin (Query Tool) y ejecutar.
# Es idempotente: se puede volver a ejecutar sin duplicar datos.
```

**Migración del folio automático (BD existente):** aplicar una vez el script que crea la secuencia y deja el `DEFAULT` en `orden_trabajo.folio_fisico`:
```bash
cd nautisport-backend
psql -U postgres -d nautisport_db -f scripts/migracion_folio_automatico.sql
# Idempotente: normaliza folios numéricos a 6 dígitos y completa los nulos.
# Si se usa psql en Windows, el script ya fuerza SET client_encoding = 'UTF8'.
```

**Para verificar el build de producción:** `npm run build` en el frontend (debe compilar sin errores — última verificación OK).

---

## 7. ⚠️ Notas y riesgos a tener en cuenta

1. **`.env` del backend ya existe** con `DATABASE_URL`, `PORT` y `JWT_SECRET`. No subirlo a Git si se inicializa el repositorio (contiene credenciales locales).
2. **Catálogo con precios reales**: se carga con `scripts/migracion_servicios.sql` (ver sección 6). Si no se aplica la migración, recepción no verá los servicios nuevos y los montos seguirán en $0.
3. El proyecto **no está en Git** — recomendable iniciar un repositorio antes de seguir (permite volver atrás si algo se rompe).
4. La tabla `usuario` requiere el seed para poder hacer login (no hay usuarios por defecto en la BD). **Cuentas demo listas**: `admin@nautisport.cl`, `recepcion@nautisport.cl`, `tecnico@nautisport.cl` — contraseña privada en `DEMO_PASSWORD`.
5. Los triggers de la BD recalculan los montos (`fn_actualizar_totales_ot`) y registran el historial (`fn_registrar_cambio_estado`) — **no duplicar esa lógica** en el frontend/backend.
6. El historial guarda el técnico desde `id_tecnico_asignado` — al cambiar a "En Mantención" conviene asignar técnico en el mismo PATCH.
7. ~~En la Fase 5, al aplicar JWT a los endpoints existentes, el formulario de Recepción dejará de funcionar si el frontend no manda el token — hacer ambos cambios en la misma sesión.~~ **Resuelto en Fase 5:** backend y frontend se actualizaron juntos; todas las peticiones ya incluyen el token automáticamente.
8. **El folio lo asigna la BD**: no enviar `folio_fisico` en el INSERT (si se envía `NULL` explícito, PostgreSQL ignora el `DEFAULT`). Para reiniciar la numeración en una BD de prueba: `SELECT setval('folio_fisico_seq', 1, false);` (solo si no hay OT con ese folio).
9. **Eliminar una OT es irreversible** y solo lo puede hacer un Administrador; el borrado arrastra servicios e historial por `ON DELETE CASCADE`. El equipo y el cliente se conservan.

---

## 8. 📋 Catálogo oficial de servicios (precios fijos)

Cargado por `scripts/migracion_servicios.sql` y editable desde `/servicios` (Admin).

| Servicio | Ski | Snowboard |
|---|---:|---:|
| Encerado | $15.000 | $15.000 |
| Afilado de cantos | $17.000 | $17.000 |
| Rectificado de base | $20.000 | $25.000 |
| Canto y cera | $30.000 | $30.000 |
| Tune up | $40.000 | $45.000 |
| Tune up racing (estructura) | $45.000 | — |
| Montaje fijación alpina | $35.000 | — |
| Montaje fijación randonee (gabarit) | $40.000 | — |
| Montaje fijación randonee (manual) | $55.000 | — |
| Montaje fijación snowboard | — | $30.000 |

**Regla del modelo:** `servicio.tipo_equipo` indica la disciplina (`Ski`, `Snowboard`); `NULL` significa que aplica a ambas. El nombre es único por disciplina, por lo que "Encerado" existe dos veces con el mismo precio y "Rectificado de base" con precios distintos.
