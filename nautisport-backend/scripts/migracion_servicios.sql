-- ============================================================
-- Migración: catálogo de servicios con precios reales por disciplina
-- Ejecutar sobre una BD existente:
--   psql -U postgres -d nautisport_db -f scripts/migracion_servicios.sql
-- Es idempotente: se puede volver a ejecutar sin duplicar datos.
-- ============================================================
BEGIN;

-- Forzar UTF-8 para que las tildes se guarden correctamente (especialmente en psql de Windows)
SET client_encoding = 'UTF8';

-- 1. Nueva columna: disciplina a la que aplica el servicio (NULL = ambas)
ALTER TABLE servicio ADD COLUMN IF NOT EXISTS tipo_equipo tipo_equipo_enum;

-- 2. El nombre deja de ser único global: pasa a ser único por disciplina
--    (ej: "Encerado" existe para Ski y para Snowboard con el mismo precio)
ALTER TABLE servicio DROP CONSTRAINT IF EXISTS servicio_nombre_key;
ALTER TABLE servicio DROP CONSTRAINT IF EXISTS servicio_nombre_tipo_unique;
ALTER TABLE servicio ADD CONSTRAINT servicio_nombre_tipo_unique UNIQUE (nombre, tipo_equipo);

-- 3. Eliminar los servicios antiguos que NO se usan en ninguna OT
DELETE FROM servicio s
WHERE s.tipo_equipo IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM ot_detalle_servicio d WHERE d.id_servicio = s.id_servicio
  );

-- 4. Los antiguos que sí se usaron en OT históricas se conservan, pero inactivos
UPDATE servicio SET activo = FALSE WHERE tipo_equipo IS NULL;

-- 5. Catálogo oficial con precios fijos (CLP)
INSERT INTO servicio (nombre, tipo_equipo, precio_base, activo) VALUES
  -- Ski
  ('Encerado',                          'Ski',       15000, TRUE),
  ('Afilado de cantos',                 'Ski',       17000, TRUE),
  ('Rectificado de base',               'Ski',       20000, TRUE),
  ('Canto y cera',                      'Ski',       30000, TRUE),
  ('Tune up',                           'Ski',       40000, TRUE),
  ('Tune up racing (estructura)',       'Ski',       45000, TRUE),
  ('Montaje fijación alpina',           'Ski',       35000, TRUE),
  ('Montaje fijación randonee (gabarit)','Ski',      40000, TRUE),
  ('Montaje fijación randonee (manual)', 'Ski',      55000, TRUE),
  -- Snowboard
  ('Encerado',                          'Snowboard', 15000, TRUE),
  ('Afilado de cantos',                 'Snowboard', 17000, TRUE),
  ('Rectificado de base',               'Snowboard', 25000, TRUE),
  ('Canto y cera',                      'Snowboard', 30000, TRUE),
  ('Tune up',                           'Snowboard', 45000, TRUE),
  ('Montaje fijación snowboard',        'Snowboard', 30000, TRUE)
ON CONFLICT (nombre, tipo_equipo) DO UPDATE
  SET precio_base = EXCLUDED.precio_base,
      activo = TRUE;

COMMIT;
