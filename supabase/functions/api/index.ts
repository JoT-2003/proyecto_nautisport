// ============================================================
// NautiSport · Backend (Supabase Edge Function)
// ============================================================
// Este archivo reemplaza al servidor Express: corre dentro de Supabase.
//
//   Frontend (Vercel) → Supabase Edge Function "api" → PostgreSQL
//                     → Supabase Auth (login)
//
// Endpoints (la URL base termina en /functions/v1/api):
//   GET    /health
//   POST   /auth              { email, password }
//   POST   /auth/refresh      { refresh_token }
//   GET    /auth/me
//   GET    /clientes?telefono=
//   POST   /clientes
//   GET    /clientes/:id/equipos
//   GET    /servicios
//   POST   /servicios
//   PUT    /servicios/:id
//   DELETE /servicios/:id
//   GET    /ordenes
//   POST   /ordenes
//   GET    /ordenes/:id
//   DELETE /ordenes/:id
//   PATCH  /ordenes/:id/estado
//   POST   /ordenes/:id/servicios
// ============================================================

import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

// ---------- Configuración ------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// SUPABASE_DB_URL lo inyecta Supabase automáticamente. El fallback permite
// usar un secreto propio (NAUTISPORT_DB_URL o DATABASE_URL) si hiciera falta.
const SUPABASE_DB_URL =
  Deno.env.get('SUPABASE_DB_URL') ??
  Deno.env.get('NAUTISPORT_DB_URL') ??
  Deno.env.get('DATABASE_URL') ??
  '';

function leerClave(nombre: 'ANON' | 'SERVICE'): string {
  const legacy = Deno.env.get(nombre === 'ANON' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  const simple = Deno.env.get(nombre === 'ANON' ? 'SUPABASE_PUBLISHABLE_KEY' : 'SUPABASE_SECRET_KEY');
  if (simple) return simple;

  const plural = Deno.env.get(nombre === 'ANON' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS');
  if (plural) {
    try {
      return JSON.parse(plural).default ?? '';
    } catch {
      return '';
    }
  }
  return '';
}

const SUPABASE_ANON_KEY = leerClave('ANON');

if (!SUPABASE_URL || !SUPABASE_DB_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltan variables de entorno de Supabase (URL, DB_URL o ANON_KEY).');
}

// prepare:false porque el pooler de Supabase trabaja en modo transacción.
const sql = postgres(SUPABASE_DB_URL, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Cliente para validar tokens y hacer login contra Supabase Auth.
const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// ---------- Utilidades HTTP ----------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function leerBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function entero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isInteger(n) ? n : null;
}

function bool(valor: unknown): boolean | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') {
    const normalizado = valor.trim().toLowerCase();
    if (normalizado === 'false' || normalizado === '0' || normalizado === '') return false;
    if (normalizado === 'true' || normalizado === '1') return true;
  }
  return Boolean(valor);
}

function requerir(condicion: boolean, status: number, mensaje: string): void {
  if (!condicion) throw new HttpError(status, mensaje);
}

const TIPOS_EQUIPO = ['Ski', 'Snowboard', 'Otros'];
const ESTADOS_VALIDOS = ['Pendiente', 'En Mantención', 'Requiere Autorización', 'Finalizado', 'Entregado'];

const TRANSICIONES_VALIDAS: Record<string, string[]> = {
  'Pendiente': ['En Mantención', 'Requiere Autorización', 'Finalizado'],
  'En Mantención': ['Requiere Autorización', 'Finalizado', 'Pendiente'],
  'Requiere Autorización': ['En Mantención', 'Finalizado', 'Pendiente'],
  'Finalizado': ['Entregado'],
  'Entregado': [],
};

function mapearErrorBD(error: unknown): never {
  const codigo = (error as { code?: string })?.code;
  if (codigo === '23505') throw new HttpError(400, 'Ya existe un registro con esos datos');
  if (codigo === '23503') throw new HttpError(400, 'El registro está siendo usado por otros datos');
  if (codigo === '23514') throw new HttpError(400, 'Los datos enviados están fuera de rango');
  if (codigo === '22P02') throw new HttpError(400, 'Formato de dato inválido');
  throw error;
}

// ---------- Autenticación ------------------------------------

interface Usuario {
  id_usuario: number;
  nombre: string;
  email: string;
  rol: 'Administrador' | 'Recepcion' | 'Tecnico';
  activo: boolean;
}

// Busca el perfil por auth_id. Si aún no está enlazado, lo enlaza por email
// (así los usuarios creados en el dashboard funcionan al primer login).
async function perfilDe(authId: string, email?: string | null): Promise<Usuario | null> {
  const porId = await sql<Usuario[]>`
    SELECT id_usuario, nombre, email, rol, activo
    FROM public.usuario
    WHERE auth_id = ${authId} AND activo = TRUE
    LIMIT 1
  `;
  if (porId[0]) return porId[0];

  const correo = (email ?? '').trim().toLowerCase();
  if (!correo) return null;

  const porEmail = await sql<Usuario[]>`
    UPDATE public.usuario
    SET auth_id = ${authId}
    WHERE email = ${correo}
      AND auth_id IS NULL
      AND activo = TRUE
    RETURNING id_usuario, nombre, email, rol, activo
  `;
  return porEmail[0] ?? null;
}

function tokenBearer(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

async function autenticar(req: Request, roles?: Usuario['rol'][]): Promise<Usuario> {
  const token = tokenBearer(req);
  if (!token) throw new HttpError(401, 'Token no proporcionado');

  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Token inválido o expirado');

  const usuario = await perfilDe(data.user.id, data.user.email);
  if (!usuario) {
    throw new HttpError(403, 'Tu usuario de Supabase no tiene un perfil activo en NautiSport');
  }
  if (roles && roles.length > 0 && !roles.includes(usuario.rol)) {
    throw new HttpError(403, 'No tienes permisos para realizar esta acción');
  }
  return usuario;
}

// ---------- Rutas: salud y autenticación ---------------------

async function health(): Promise<Response> {
  await sql`SELECT 1`;
  return json({ estado: 'ok', base_datos: 'conectada', backend: 'supabase-edge' });
}

async function login(req: Request): Promise<Response> {
  const body = await leerBody(req);
  const email = texto(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  requerir(Boolean(email) && Boolean(password), 400, 'Email y contraseña son obligatorios');

  const { data, error } = await auth.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    const detalle = (error?.message ?? '').toLowerCase();
    if (detalle.includes('email not confirmed')) {
      throw new HttpError(403, 'El correo aún no está confirmado en Supabase Auth');
    }
    throw new HttpError(401, 'Credenciales incorrectas');
  }

  const usuario = await perfilDe(data.user.id, data.user.email);
  if (!usuario) {
    throw new HttpError(403, 'Tu usuario de Supabase no tiene un perfil activo en NautiSport');
  }

  return json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    usuario,
  });
}

async function refrescar(req: Request): Promise<Response> {
  const body = await leerBody(req);
  const refreshToken = texto(body.refresh_token);
  requerir(Boolean(refreshToken), 400, 'Falta el refresh token');

  const { data, error } = await auth.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    throw new HttpError(401, 'La sesión expiró. Inicia sesión nuevamente.');
  }

  const usuario = await perfilDe(data.user.id, data.user.email);
  if (!usuario) throw new HttpError(403, 'Tu usuario ya no está activo en NautiSport');

  return json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    usuario,
  });
}

async function me(req: Request): Promise<Response> {
  const usuario = await autenticar(req);
  return json(usuario);
}

// ---------- Rutas: clientes ---------------------------------

async function listarClientes(req: Request, url: URL): Promise<Response> {
  await autenticar(req);
  const telefono = texto(url.searchParams.get('telefono'));

  const filas = telefono
    ? await sql`
        SELECT * FROM public.cliente
        WHERE telefono = ${telefono}
        ORDER BY id_cliente DESC
      `
    : await sql`SELECT * FROM public.cliente ORDER BY id_cliente DESC`;

  return json(filas);
}

async function crearCliente(req: Request): Promise<Response> {
  const body = await leerBody(req);
  await autenticar(req, ['Recepcion', 'Administrador']);

  const nombre = texto(body.nombre);
  const telefono = texto(body.telefono);
  const email = texto(body.email) || null;

  requerir(Boolean(nombre), 400, 'El nombre del cliente es obligatorio');
  requerir(/^\+569\d{8}$/.test(telefono), 400, 'El teléfono debe tener el formato chileno válido (+569XXXXXXXX)');

  const [cliente] = await sql`
    INSERT INTO public.cliente (nombre, telefono, email)
    VALUES (${nombre}, ${telefono}, ${email})
    RETURNING *
  `;
  return json(cliente, 201);
}

async function equiposDeCliente(req: Request, idCliente: number): Promise<Response> {
  await autenticar(req);
  const equipos = await sql`
    SELECT * FROM public.equipo
    WHERE id_cliente = ${idCliente}
    ORDER BY fecha_creacion DESC
  `;
  return json(equipos);
}

// ---------- Rutas: servicios --------------------------------

async function listarServicios(req: Request): Promise<Response> {
  await autenticar(req);
  const servicios = await sql`
    SELECT * FROM public.servicio
    ORDER BY tipo_equipo NULLS FIRST, id_servicio
  `;
  return json(servicios);
}

async function crearServicio(req: Request): Promise<Response> {
  const body = await leerBody(req);
  await autenticar(req, ['Administrador']);

  const nombre = texto(body.nombre);
  const tipo = texto(body.tipo_equipo) || null;
  const descripcion = texto(body.descripcion) || null;
  const precio = Number(body.precio_base);

  requerir(Boolean(nombre), 400, 'El nombre del servicio es obligatorio');
  requerir(body.precio_base !== null && body.precio_base !== undefined && !Number.isNaN(precio) && precio >= 0, 400, 'El precio base debe ser un número mayor o igual a 0');
  requerir(tipo === null || TIPOS_EQUIPO.includes(tipo), 400, `Tipo de equipo inválido. Valores: ${TIPOS_EQUIPO.join(', ')}`);

  try {
    const [servicio] = await sql`
      INSERT INTO public.servicio (nombre, tipo_equipo, descripcion, precio_base)
      VALUES (${nombre}, ${tipo}, ${descripcion}, ${Math.trunc(precio)})
      RETURNING *
    `;
    return json(servicio, 201);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new HttpError(400, 'Ya existe un servicio con ese nombre para esa disciplina');
    }
    return mapearErrorBD(error);
  }
}

async function editarServicio(req: Request, id: number): Promise<Response> {
  const body = await leerBody(req);
  await autenticar(req, ['Administrador']);

  const [actual] = await sql`SELECT * FROM public.servicio WHERE id_servicio = ${id}`;
  if (!actual) throw new HttpError(404, 'Servicio no encontrado');

  const tipo = body.tipo_equipo !== undefined ? (texto(body.tipo_equipo) || null) : actual.tipo_equipo;
  const precio = body.precio_base !== undefined && body.precio_base !== null
    ? Number(body.precio_base)
    : Number(actual.precio_base);

  requerir(tipo === null || TIPOS_EQUIPO.includes(tipo), 400, `Tipo de equipo inválido. Valores: ${TIPOS_EQUIPO.join(', ')}`);
  requerir(!Number.isNaN(precio) && precio >= 0, 400, 'El precio base no puede ser negativo');

  try {
    const [servicio] = await sql`
      UPDATE public.servicio
      SET nombre = ${body.nombre !== undefined ? texto(body.nombre) : actual.nombre},
          tipo_equipo = ${tipo},
          descripcion = ${body.descripcion !== undefined ? (texto(body.descripcion) || null) : actual.descripcion},
          precio_base = ${Math.trunc(precio)},
          activo = ${body.activo !== undefined ? (bool(body.activo) ?? actual.activo) : actual.activo}
      WHERE id_servicio = ${id}
      RETURNING *
    `;
    return json(servicio);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new HttpError(400, 'Ya existe un servicio con ese nombre para esa disciplina');
    }
    return mapearErrorBD(error);
  }
}

async function desactivarServicio(req: Request, id: number): Promise<Response> {
  await autenticar(req, ['Administrador']);
  const [servicio] = await sql`
    UPDATE public.servicio SET activo = FALSE
    WHERE id_servicio = ${id}
    RETURNING *
  `;
  if (!servicio) throw new HttpError(404, 'Servicio no encontrado');
  return json({ mensaje: 'Servicio desactivado', servicio });
}

// ---------- Rutas: órdenes de trabajo -----------------------

async function listarOrdenes(req: Request): Promise<Response> {
  await autenticar(req);
  const ordenes = await sql`
    SELECT
      ot.id_orden, ot.folio_fisico, ot.estado, ot.monto_inicial, ot.monto_total,
      ot.fecha_recepcion, ot.fecha_entrega_estimada, ot.fecha_entrega_real,
      c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
      eq.tipo AS equipo_tipo, eq.marca_modelo AS equipo_modelo,
      u.nombre AS tecnico_nombre
    FROM public.orden_trabajo ot
    JOIN public.cliente c ON ot.id_cliente = c.id_cliente
    JOIN public.equipo eq ON ot.id_equipo = eq.id_equipo
    LEFT JOIN public.usuario u ON ot.id_tecnico_asignado = u.id_usuario
    ORDER BY ot.id_orden DESC
  `;
  return json(ordenes);
}

async function crearOrden(req: Request): Promise<Response> {
  const body = await leerBody(req);
  await autenticar(req, ['Recepcion', 'Administrador']);

  const idCliente = entero(body.id_cliente);
  const idEquipoExistente = entero(body.id_equipo);
  const fechaEstimada = texto(body.fecha_entrega_estimada);
  const observaciones = texto(body.observaciones) || null;
  const equipo = body.equipo as Record<string, unknown> | undefined;
  const servicios = Array.isArray(body.servicios)
    ? body.servicios.map((id) => entero(id)).filter((id): id is number => id !== null)
    : [];

  requerir(idCliente !== null && idCliente > 0, 400, 'Debes indicar el cliente');
  requerir(Boolean(fechaEstimada) && !Number.isNaN(Date.parse(fechaEstimada)), 400, 'La fecha de entrega estimada es obligatoria');

  const [cliente] = await sql`SELECT 1 FROM public.cliente WHERE id_cliente = ${idCliente}`;
  requerir(Boolean(cliente), 400, 'El cliente indicado no existe');

  try {
    const nuevaOT = await sql.begin(async (tx) => {
      let idEquipo = idEquipoExistente;

      if (idEquipo) {
        const [pertenece] = await tx`
          SELECT 1 FROM public.equipo
          WHERE id_equipo = ${idEquipo} AND id_cliente = ${idCliente}
        `;
        if (!pertenece) {
          throw new HttpError(400, 'El equipo indicado no pertenece a este cliente');
        }
      } else {
        const tipo = texto(equipo?.tipo);
        const marca = texto(equipo?.marca_modelo);
        requerir(TIPOS_EQUIPO.includes(tipo), 400, 'El tipo de equipo es obligatorio (Ski, Snowboard u Otros)');
        requerir(Boolean(marca), 400, 'La marca/modelo del equipo es obligatoria');

        const [creado] = await tx`
          INSERT INTO public.equipo (id_cliente, tipo, marca_modelo, peso, fijaciones, zapatos)
          VALUES (
            ${idCliente},
            ${tipo},
            ${marca},
            ${equipo?.peso ? Number(equipo.peso) : null},
            ${texto(equipo?.fijaciones) || null},
            ${texto(equipo?.zapatos) || null}
          )
          RETURNING id_equipo
        `;
        idEquipo = creado.id_equipo;
      }

      const [orden] = await tx`
        INSERT INTO public.orden_trabajo (id_cliente, id_equipo, fecha_entrega_estimada, observaciones)
        VALUES (${idCliente}, ${idEquipo}, ${fechaEstimada}, ${observaciones})
        RETURNING *
      `;

      for (const idServicio of servicios) {
        const [servicio] = await tx`
          SELECT precio_base FROM public.servicio WHERE id_servicio = ${idServicio}
        `;
        if (!servicio) throw new HttpError(400, `El servicio ${idServicio} no existe`);

        await tx`
          INSERT INTO public.ot_detalle_servicio (id_orden, id_servicio, precio_aplicado, es_sobrecosto)
          VALUES (${orden.id_orden}, ${idServicio}, ${servicio.precio_base}, FALSE)
        `;
      }

      return orden;
    });

    return json({
      mensaje: 'Orden de trabajo creada con éxito',
      id_orden: nuevaOT.id_orden,
      folio_fisico: nuevaOT.folio_fisico,
    }, 201);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return mapearErrorBD(error);
  }
}

async function detalleOrden(req: Request, idOrden: number): Promise<Response> {
  await autenticar(req);

  const [orden] = await sql`
    SELECT
      ot.*,
      c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.email AS cliente_email,
      eq.tipo AS equipo_tipo, eq.marca_modelo AS equipo_marca_modelo,
      eq.peso AS equipo_peso, eq.fijaciones AS equipo_fijaciones, eq.zapatos AS equipo_zapatos,
      u.nombre AS tecnico_nombre
    FROM public.orden_trabajo ot
    JOIN public.cliente c ON ot.id_cliente = c.id_cliente
    JOIN public.equipo eq ON ot.id_equipo = eq.id_equipo
    LEFT JOIN public.usuario u ON ot.id_tecnico_asignado = u.id_usuario
    WHERE ot.id_orden = ${idOrden}
  `;
  if (!orden) throw new HttpError(404, 'Orden de trabajo no encontrada');

  const servicios = await sql`
    SELECT d.id_detalle, d.id_servicio, d.descripcion_custom, d.precio_aplicado,
           d.es_sobrecosto, d.fecha_agregado, s.nombre AS servicio_nombre
    FROM public.ot_detalle_servicio d
    LEFT JOIN public.servicio s ON d.id_servicio = s.id_servicio
    WHERE d.id_orden = ${idOrden}
    ORDER BY d.id_detalle
  `;

  const historial = await sql`
    SELECT h.id_historial, h.estado_anterior, h.estado_nuevo, h.comentario, h.fecha_cambio,
           u.nombre AS usuario_nombre
    FROM public.historial_estado h
    LEFT JOIN public.usuario u ON h.id_usuario = u.id_usuario
    WHERE h.id_orden = ${idOrden}
    ORDER BY h.fecha_cambio ASC, h.id_historial ASC
  `;

  return json({ ...orden, servicios, historial });
}

async function eliminarOrden(req: Request, idOrden: number): Promise<Response> {
  await autenticar(req, ['Administrador']);

  const resultado = await sql.begin(async (tx) => {
    const [orden] = await tx`
      SELECT folio_fisico FROM public.orden_trabajo
      WHERE id_orden = ${idOrden}
      FOR UPDATE
    `;
    if (!orden) throw new HttpError(404, 'Orden de trabajo no encontrada');

    await tx`DELETE FROM public.orden_trabajo WHERE id_orden = ${idOrden}`;
    return orden;
  });

  return json({
    mensaje: `Orden N° ${idOrden} eliminada correctamente`,
    id_orden: idOrden,
    folio_fisico: resultado.folio_fisico,
  });
}

async function cambiarEstado(req: Request, idOrden: number): Promise<Response> {
  const body = await leerBody(req);
  const usuario = await autenticar(req, ['Tecnico', 'Recepcion', 'Administrador']);

  const estado = texto(body.estado);
  const idTecnico = entero(body.id_tecnico_asignado);
  const comentario = texto(body.comentario) || null;

  requerir(ESTADOS_VALIDOS.includes(estado), 400, `Estado inválido. Valores permitidos: ${ESTADOS_VALIDOS.join(', ')}`);

  const actualizada = await sql.begin(async (tx) => {
    const [orden] = await tx`
      SELECT id_orden, estado, id_tecnico_asignado
      FROM public.orden_trabajo
      WHERE id_orden = ${idOrden}
      FOR UPDATE
    `;
    if (!orden) throw new HttpError(404, 'Orden de trabajo no encontrada');

    if (!TRANSICIONES_VALIDAS[orden.estado]?.includes(estado)) {
      throw new HttpError(400, `Transición no permitida: '${orden.estado}' → '${estado}'`);
    }

    if (idTecnico) {
      const [tecnico] = await tx`
        SELECT 1 FROM public.usuario
        WHERE id_usuario = ${idTecnico} AND rol = 'Tecnico' AND activo = TRUE
      `;
      if (!tecnico) {
        throw new HttpError(400, 'El técnico indicado no existe o no tiene el rol de Técnico');
      }
    }

    const fechaEntregaReal = estado === 'Entregado' ? new Date() : null;

    await tx`
      UPDATE public.orden_trabajo
      SET estado = ${estado},
          id_tecnico_asignado = COALESCE(${idTecnico}, id_tecnico_asignado),
          fecha_entrega_real = COALESCE(${fechaEntregaReal}, fecha_entrega_real)
      WHERE id_orden = ${idOrden}
    `;

    if (comentario) {
      await tx`
        UPDATE public.historial_estado
        SET comentario = ${comentario}
        WHERE id_historial = (
          SELECT MAX(id_historial) FROM public.historial_estado WHERE id_orden = ${idOrden}
        )
      `;
    }

    const [fila] = await tx`SELECT * FROM public.orden_trabajo WHERE id_orden = ${idOrden}`;
    return fila;
  });

  return json({ mensaje: 'Estado actualizado', orden: actualizada, actualizado_por: usuario.nombre });
}

async function agregarServicio(req: Request, idOrden: number): Promise<Response> {
  const body = await leerBody(req);
  await autenticar(req, ['Tecnico', 'Recepcion', 'Administrador']);

  const idServicio = entero(body.id_servicio);
  const descripcion = texto(body.descripcion_custom) || null;
  const precioIngresado = body.precio_aplicado !== null && body.precio_aplicado !== undefined
    ? Number(body.precio_aplicado)
    : null;
  const sobrecostoIngresado = bool(body.es_sobrecosto);

  requerir(idServicio !== null || Boolean(descripcion), 400, 'Indique un servicio del catálogo o una descripción personalizada');
  requerir(precioIngresado === null || (!Number.isNaN(precioIngresado) && precioIngresado >= 0), 400, 'El precio aplicado no puede ser negativo');

  try {
    const resultado = await sql.begin(async (tx) => {
      const [orden] = await tx`
        SELECT id_orden, estado FROM public.orden_trabajo
        WHERE id_orden = ${idOrden}
        FOR UPDATE
      `;
      if (!orden) throw new HttpError(404, 'Orden de trabajo no encontrada');
      if (['Finalizado', 'Entregado'].includes(orden.estado)) {
        throw new HttpError(400, `No se pueden agregar servicios a una orden '${orden.estado}'`);
      }

      let precioFinal = precioIngresado;
      let esSobrecosto = sobrecostoIngresado;

      if (idServicio !== null) {
        const [servicio] = await tx`
          SELECT precio_base FROM public.servicio WHERE id_servicio = ${idServicio}
        `;
        if (!servicio) throw new HttpError(400, 'Servicio del catálogo no encontrado');

        if (precioFinal === null) precioFinal = Number(servicio.precio_base);
        if (esSobrecosto === null) esSobrecosto = Number(precioFinal) > Number(servicio.precio_base);
      } else if (esSobrecosto === null) {
        esSobrecosto = true;
      }

      await tx`
        INSERT INTO public.ot_detalle_servicio
          (id_orden, id_servicio, descripcion_custom, precio_aplicado, es_sobrecosto)
        VALUES
          (${idOrden}, ${idServicio}, ${descripcion}, ${Math.trunc(Number(precioFinal ?? 0))}, ${Boolean(esSobrecosto)})
      `;

      if (esSobrecosto && orden.estado !== 'Requiere Autorización') {
        await tx`
          UPDATE public.orden_trabajo
          SET estado = 'Requiere Autorización'
          WHERE id_orden = ${idOrden}
        `;
      }

      const [totales] = await tx`
        SELECT monto_inicial, monto_total, estado
        FROM public.orden_trabajo
        WHERE id_orden = ${idOrden}
      `;
      return totales;
    });

    return json({ mensaje: 'Servicio agregado', ...resultado }, 201);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return mapearErrorBD(error);
  }
}

// ---------- Router -------------------------------------------

const RUTAS_CONOCIDAS = new Set(['health', 'auth', 'clientes', 'servicios', 'ordenes']);

function rutaDe(req: Request): string {
  const partes = new URL(req.url).pathname.split('/').filter(Boolean);

  // Quita /functions/v1 si el runtime no lo hizo ya.
  const iV1 = partes.indexOf('v1');
  if (iV1 >= 0) partes.splice(0, iV1 + 1);

  // Quita el nombre de la función (api) si viene en la ruta.
  if (partes.length > 0 && !RUTAS_CONOCIDAS.has(partes[0])) partes.shift();

  return '/' + partes.join('/');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const ruta = rutaDe(req);
    const method = req.method;
    const url = new URL(req.url);

    if (method === 'GET' && ruta === '/health') return await health();
    if (method === 'POST' && ruta === '/auth') return await login(req);
    if (method === 'POST' && ruta === '/auth/refresh') return await refrescar(req);
    if (method === 'GET' && ruta === '/auth/me') return await me(req);

    if (method === 'GET' && ruta === '/clientes') return await listarClientes(req, url);
    if (method === 'POST' && ruta === '/clientes') return await crearCliente(req);

    const equiposMatch = ruta.match(/^\/clientes\/(\d+)\/equipos$/);
    if (method === 'GET' && equiposMatch) return await equiposDeCliente(req, Number(equiposMatch[1]));

    if (method === 'GET' && ruta === '/servicios') return await listarServicios(req);
    if (method === 'POST' && ruta === '/servicios') return await crearServicio(req);

    const servicioMatch = ruta.match(/^\/servicios\/(\d+)$/);
    if (servicioMatch) {
      const id = Number(servicioMatch[1]);
      if (method === 'PUT') return await editarServicio(req, id);
      if (method === 'DELETE') return await desactivarServicio(req, id);
    }

    if (method === 'GET' && ruta === '/ordenes') return await listarOrdenes(req);
    if (method === 'POST' && ruta === '/ordenes') return await crearOrden(req);

    const ordenMatch = ruta.match(/^\/ordenes\/(\d+)$/);
    if (ordenMatch) {
      const id = Number(ordenMatch[1]);
      if (method === 'GET') return await detalleOrden(req, id);
      if (method === 'DELETE') return await eliminarOrden(req, id);
    }

    const estadoMatch = ruta.match(/^\/ordenes\/(\d+)\/estado$/);
    if (method === 'PATCH' && estadoMatch) return await cambiarEstado(req, Number(estadoMatch[1]));

    const servicioOrdenMatch = ruta.match(/^\/ordenes\/(\d+)\/servicios$/);
    if (method === 'POST' && servicioOrdenMatch) return await agregarServicio(req, Number(servicioOrdenMatch[1]));

    return json({ error: `Ruta no encontrada: ${method} ${ruta}` }, 404);
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status);
    }
    console.error('Error no controlado:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
