-- ============================================================
-- NautiSport · Instalación / actualización en Supabase
-- ============================================================
-- Este script es idempotente: se puede ejecutar varias veces.
-- Sirve tanto para un proyecto Supabase nuevo como para el que
-- ya tiene las tablas migradas desde la base local.
--
-- Qué hace:
--   1. Crea el esquema NautiSport si no existe.
--   2. Agrega usuario.auth_id para enlazar con Supabase Auth.
--   3. Deja los 3 usuarios demo con su rol.
--   4. Crea triggers de totales e historial.
--   5. Activa RLS y bloquea el acceso directo con la anon key.
--      El backend (Edge Function) conecta como postgres y sí puede.
--   6. Reposiciona las secuencias (folio incluido).
-- ============================================================

-- 1. Tipos enumerados -----------------------------------------
DO $$ BEGIN
  CREATE TYPE public.rol_usuario AS ENUM ('Administrador', 'Recepcion', 'Tecnico');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_equipo_enum AS ENUM ('Ski', 'Snowboard', 'Otros');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_ot_enum AS ENUM (
    'Pendiente',
    'En Mantención',
    'Requiere Autorización',
    'Finalizado',
    'Entregado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tablas ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuario (
  id_usuario     SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  email          VARCHAR(150) UNIQUE NOT NULL,
  password_hash  VARCHAR(255),
  rol            public.rol_usuario NOT NULL,
  activo         BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- El login ahora lo hace Supabase Auth, no el backend.
-- password_hash queda opcional para no romper bases ya migradas.
ALTER TABLE public.usuario ALTER COLUMN password_hash DROP NOT NULL;

-- Enlace entre auth.users (Supabase Auth) y el perfil/rol de NautiSport.
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS auth_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS usuario_auth_id_key
  ON public.usuario (auth_id)
  WHERE auth_id IS NOT NULL;

-- FK opcional: en local no existe el esquema auth, en Supabase sí.
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'usuario_auth_id_fkey'
     ) THEN
    ALTER TABLE public.usuario
      ADD CONSTRAINT usuario_auth_id_fkey
      FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cliente (
  id_cliente     SERIAL PRIMARY KEY,
  nombre         VARCHAR(150) NOT NULL,
  telefono       VARCHAR(20) NOT NULL,
  email          VARCHAR(150),
  fecha_registro TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.equipo (
  id_equipo     SERIAL PRIMARY KEY,
  id_cliente    INT NOT NULL REFERENCES public.cliente(id_cliente) ON DELETE CASCADE,
  tipo          public.tipo_equipo_enum NOT NULL,
  marca_modelo  VARCHAR(150) NOT NULL,
  peso          DECIMAL(5,2),
  fijaciones    VARCHAR(150),
  zapatos       VARCHAR(150),
  fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.servicio (
  id_servicio SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  tipo_equipo public.tipo_equipo_enum,
  descripcion TEXT,
  precio_base INT NOT NULL DEFAULT 0 CHECK (precio_base >= 0),
  activo      BOOLEAN DEFAULT TRUE,
  UNIQUE (nombre, tipo_equipo)
);

CREATE SEQUENCE IF NOT EXISTS public.folio_fisico_seq START 1;

CREATE TABLE IF NOT EXISTS public.orden_trabajo (
  id_orden               SERIAL PRIMARY KEY,
  folio_fisico           VARCHAR(20) UNIQUE DEFAULT lpad(nextval('public.folio_fisico_seq')::text, 6, '0'),
  id_cliente             INT NOT NULL REFERENCES public.cliente(id_cliente),
  id_equipo              INT NOT NULL REFERENCES public.equipo(id_equipo),
  id_tecnico_asignado    INT REFERENCES public.usuario(id_usuario),
  fecha_recepcion        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  fecha_entrega_estimada TIMESTAMPTZ NOT NULL,
  fecha_entrega_real     TIMESTAMPTZ,
  estado                 public.estado_ot_enum NOT NULL DEFAULT 'Pendiente',
  monto_inicial          INT NOT NULL DEFAULT 0 CHECK (monto_inicial >= 0),
  monto_total            INT NOT NULL DEFAULT 0 CHECK (monto_total >= 0),
  observaciones          TEXT,
  fecha_creacion         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Asegura el default del folio incluso en bases creadas antes.
ALTER TABLE public.orden_trabajo
  ALTER COLUMN folio_fisico
  SET DEFAULT lpad(nextval('public.folio_fisico_seq')::text, 6, '0');

CREATE TABLE IF NOT EXISTS public.ot_detalle_servicio (
  id_detalle         SERIAL PRIMARY KEY,
  id_orden           INT NOT NULL REFERENCES public.orden_trabajo(id_orden) ON DELETE CASCADE,
  id_servicio        INT REFERENCES public.servicio(id_servicio),
  descripcion_custom VARCHAR(255),
  precio_aplicado    INT NOT NULL CHECK (precio_aplicado >= 0),
  es_sobrecosto      BOOLEAN DEFAULT FALSE,
  fecha_agregado     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.historial_estado (
  id_historial    SERIAL PRIMARY KEY,
  id_orden        INT NOT NULL REFERENCES public.orden_trabajo(id_orden) ON DELETE CASCADE,
  estado_anterior public.estado_ot_enum,
  estado_nuevo    public.estado_ot_enum NOT NULL,
  id_usuario      INT REFERENCES public.usuario(id_usuario),
  comentario      TEXT,
  fecha_cambio    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Índices --------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cliente_telefono ON public.cliente (telefono);
CREATE INDEX IF NOT EXISTS idx_orden_cliente    ON public.orden_trabajo (id_cliente);
CREATE INDEX IF NOT EXISTS idx_orden_estado     ON public.orden_trabajo (estado);
CREATE INDEX IF NOT EXISTS idx_equipo_cliente   ON public.equipo (id_cliente);

-- 4. Funciones y triggers -------------------------------------
CREATE OR REPLACE FUNCTION public.fn_actualizar_totales_ot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.orden_trabajo
  SET
    monto_inicial = COALESCE((
      SELECT SUM(precio_aplicado)
      FROM public.ot_detalle_servicio
      WHERE id_orden = NEW.id_orden AND es_sobrecosto = FALSE
    ), 0),
    monto_total = COALESCE((
      SELECT SUM(precio_aplicado)
      FROM public.ot_detalle_servicio
      WHERE id_orden = NEW.id_orden
    ), 0)
  WHERE id_orden = NEW.id_orden;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_totales_ot ON public.ot_detalle_servicio;
CREATE TRIGGER trg_actualizar_totales_ot
AFTER INSERT OR UPDATE OR DELETE ON public.ot_detalle_servicio
FOR EACH ROW
EXECUTE FUNCTION public.fn_actualizar_totales_ot();

CREATE OR REPLACE FUNCTION public.fn_registrar_cambio_estado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (OLD.estado IS DISTINCT FROM NEW.estado) THEN
    INSERT INTO public.historial_estado (id_orden, estado_anterior, estado_nuevo, id_usuario)
    VALUES (NEW.id_orden, OLD.estado, NEW.estado, NEW.id_tecnico_asignado);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_cambio_estado ON public.orden_trabajo;
CREATE TRIGGER trg_registrar_cambio_estado
AFTER UPDATE ON public.orden_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.fn_registrar_cambio_estado();

-- 5. Catálogo oficial de servicios ----------------------------
INSERT INTO public.servicio (nombre, tipo_equipo, precio_base)
VALUES
  ('Encerado',                            'Ski',       15000),
  ('Afilado de cantos',                   'Ski',       17000),
  ('Rectificado de base',                 'Ski',       20000),
  ('Canto y cera',                        'Ski',       30000),
  ('Tune up',                             'Ski',       40000),
  ('Tune up racing (estructura)',         'Ski',       45000),
  ('Montaje fijación alpina',             'Ski',       35000),
  ('Montaje fijación randonee (gabarit)', 'Ski',       40000),
  ('Montaje fijación randonee (manual)',  'Ski',       55000),
  ('Encerado',                            'Snowboard', 15000),
  ('Afilado de cantos',                   'Snowboard', 17000),
  ('Rectificado de base',                 'Snowboard', 25000),
  ('Canto y cera',                        'Snowboard', 30000),
  ('Tune up',                             'Snowboard', 45000),
  ('Montaje fijación snowboard',          'Snowboard', 30000)
ON CONFLICT DO NOTHING;

-- 6. Usuarios demo (los crea/actualiza el script de Auth) -----
-- El correo y el rol viven aquí; la contraseña vive en Supabase Auth.
INSERT INTO public.usuario (nombre, email, rol, activo, password_hash)
VALUES
  ('Administrador NautiSport', 'admin@nautisport.cl',     'Administrador', TRUE, NULL),
  ('Recepción NautiSport',     'recepcion@nautisport.cl', 'Recepcion',     TRUE, NULL),
  ('Técnico NautiSport',       'tecnico@nautisport.cl',   'Tecnico',       TRUE, NULL)
ON CONFLICT (email) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      rol    = EXCLUDED.rol,
      activo = TRUE;

-- 7. Seguridad: RLS + bloqueo de la API pública -------------
-- El frontend NO habla directo con las tablas: pasa por la Edge Function.
-- La Edge Function conecta como postgres, por lo que RLS no la afecta.
ALTER TABLE public.usuario            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicio           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_trabajo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_detalle_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_estado   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
  END IF;
END $$;

-- 8. Reposicionar secuencias ---------------------------------
SELECT setval(pg_get_serial_sequence('public.usuario', 'id_usuario'),
  GREATEST(COALESCE((SELECT MAX(id_usuario) FROM public.usuario), 1), 1),
  (SELECT COUNT(*) > 0 FROM public.usuario));

SELECT setval(pg_get_serial_sequence('public.cliente', 'id_cliente'),
  GREATEST(COALESCE((SELECT MAX(id_cliente) FROM public.cliente), 1), 1),
  (SELECT COUNT(*) > 0 FROM public.cliente));

SELECT setval(pg_get_serial_sequence('public.equipo', 'id_equipo'),
  GREATEST(COALESCE((SELECT MAX(id_equipo) FROM public.equipo), 1), 1),
  (SELECT COUNT(*) > 0 FROM public.equipo));

SELECT setval(pg_get_serial_sequence('public.servicio', 'id_servicio'),
  GREATEST(COALESCE((SELECT MAX(id_servicio) FROM public.servicio), 1), 1),
  (SELECT COUNT(*) > 0 FROM public.servicio));

SELECT setval(pg_get_serial_sequence('public.orden_trabajo', 'id_orden'),
  GREATEST(COALESCE((SELECT MAX(id_orden) FROM public.orden_trabajo), 1), 1),
  (SELECT COUNT(*) > 0 FROM public.orden_trabajo));

SELECT setval(pg_get_serial_sequence('public.ot_detalle_servicio', 'id_detalle'),
  GREATEST(COALESCE((SELECT MAX(id_detalle) FROM public.ot_detalle_servicio), 1), 1),
  (SELECT COUNT(*) > 0 FROM public.ot_detalle_servicio));

SELECT setval(pg_get_serial_sequence('public.historial_estado', 'id_historial'),
  GREATEST(COALESCE((SELECT MAX(id_historial) FROM public.historial_estado), 1), 1),
  (SELECT COUNT(*) > 0 FROM public.historial_estado));

-- El folio nunca debe retroceder si se borraron órdenes al final.
DO $$
DECLARE
  max_folio BIGINT;
  ultimo    BIGINT;
  llamado   BOOLEAN;
BEGIN
  SELECT COALESCE(MAX(folio_fisico::BIGINT), 0)
    INTO max_folio
    FROM public.orden_trabajo
   WHERE folio_fisico ~ '^[0-9]+$';

  SELECT last_value, is_called INTO ultimo, llamado FROM public.folio_fisico_seq;

  -- Si la secuencia va atrás (o está en el máximo pero nunca se usó),
  -- avanzarla para que el próximo nextval sea max_folio + 1.
  IF max_folio > 0 AND (ultimo < max_folio OR (ultimo = max_folio AND NOT llamado)) THEN
    PERFORM setval('public.folio_fisico_seq', max_folio, TRUE);
  END IF;
END $$;

-- 9. Verificación rápida (opcional, se puede borrar) ----------
-- SELECT email, rol, auth_id FROM public.usuario ORDER BY id_usuario;
-- SELECT COUNT(*) AS servicios FROM public.servicio;
