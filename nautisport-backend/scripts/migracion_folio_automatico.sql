-- ============================================================
-- Migración: folio físico correlativo automático
-- Ejecutar sobre una BD existente:
--   psql -U postgres -d nautisport_db -f scripts/migracion_folio_automatico.sql
-- Es idempotente: se puede volver a ejecutar sin duplicar datos.
-- ============================================================
BEGIN;

SET client_encoding = 'UTF8';

-- 1. Secuencia para los folios (000001, 000002, ...)
CREATE SEQUENCE IF NOT EXISTS folio_fisico_seq;

-- 2. Posicionar la secuencia después del mayor folio numérico existente
SELECT setval(
  'folio_fisico_seq',
  GREATEST(
    COALESCE((
      SELECT MAX(CASE WHEN folio_fisico ~ '^[0-9]+$' THEN folio_fisico::bigint END)
      FROM orden_trabajo
    ), 0) + 1,
    1
  ),
  false
);

-- 3. Normalizar folios numéricos antiguos al formato de 6 dígitos (ej: "1" → "000001")
UPDATE orden_trabajo ot
SET folio_fisico = lpad(ot.folio_fisico, 6, '0')
WHERE ot.folio_fisico ~ '^[0-9]{1,5}$'
  AND NOT EXISTS (
    SELECT 1 FROM orden_trabajo o2
    WHERE o2.folio_fisico = lpad(ot.folio_fisico, 6, '0')
  );

-- 4. Completar con correlativos las órdenes antiguas sin folio
WITH faltantes AS (
  SELECT id_orden FROM orden_trabajo WHERE folio_fisico IS NULL ORDER BY id_orden
)
UPDATE orden_trabajo ot
SET folio_fisico = lpad(nextval('folio_fisico_seq')::text, 6, '0')
FROM faltantes f
WHERE ot.id_orden = f.id_orden;

-- 5. Valor por defecto para nuevas órdenes
ALTER TABLE orden_trabajo
  ALTER COLUMN folio_fisico SET DEFAULT lpad(nextval('folio_fisico_seq')::text, 6, '0');

COMMIT;
