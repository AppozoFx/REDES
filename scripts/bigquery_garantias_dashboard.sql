-- =============================================================================
-- REDES – BigQuery: Vistas para Dashboard de Garantías Power BI
-- Proyecto: redes-5bb81   Dataset: ordenes_export
-- Ejecutar en orden en la consola de BigQuery Console
-- https://console.cloud.google.com/bigquery
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 · Fix bug duracion_texto en vw_ordenes_kpi
--   Bug: el segundo argumento de DATETIME_DIFF usaba hora_fin_visita
--        en lugar de hora_inicio_visita, haciendo que duracion_texto = "0H 0m"
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `redes-5bb81.ordenes_export.vw_ordenes_kpi` AS
SELECT
  orden_id,
  cliente,
  codi_segui_clien,
  codi_segui,
  tipo_segui_clien,
  tipo_orden,
  tipo_trabajo,
  tipo_cuadrilla,
  estado,
  motivo_cancelacion,
  motivo_finalizacion,
  region,
  distrito,
  cuadrilla_id,
  cuadrilla_nombre,
  FORMAT_DATE('%d/%m/%Y', fecha_solicitud_date) AS fecha_solicitud_texto,
  fecha_inicio_visita,
  fecha_fin_visita,
  hora_inicio_visita,
  hora_fin_visita,
  lat,
  lng,
  direccion,
  telefono,
  numero_documento,
  DATETIME_DIFF(
    SAFE.PARSE_DATETIME('%F %H:%M', CONCAT(NULLIF(fecha_fin_visita,''),' ',NULLIF(hora_fin_visita,''))),
    SAFE.PARSE_DATETIME('%F %H:%M', CONCAT(NULLIF(fecha_inicio_visita,''),' ',NULLIF(hora_inicio_visita,''))),
    MINUTE
  ) AS duracion_minutos,
  CONCAT(
    CAST(DIV(
      DATETIME_DIFF(
        SAFE.PARSE_DATETIME('%F %H:%M', CONCAT(NULLIF(fecha_fin_visita,''),' ',NULLIF(hora_fin_visita,''))),
        SAFE.PARSE_DATETIME('%F %H:%M', CONCAT(NULLIF(fecha_inicio_visita,''),' ',NULLIF(hora_inicio_visita,''))),
        MINUTE), 60) AS STRING),
    'H ',
    CAST(MOD(
      DATETIME_DIFF(
        SAFE.PARSE_DATETIME('%F %H:%M', CONCAT(NULLIF(fecha_fin_visita,''),' ',NULLIF(hora_fin_visita,''))),
        SAFE.PARSE_DATETIME('%F %H:%M', CONCAT(NULLIF(fecha_inicio_visita,''),' ',NULLIF(hora_inicio_visita,''))),
        MINUTE), 60) AS STRING),
    'm'
  ) AS duracion_texto
FROM `redes-5bb81.ordenes_export.vw_ordenes_actuales`;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 · vw_pbi_ordenes_kpi  (sin cambios en lógica — se re-crea para
--           garantizar que apunta al vw_ordenes_kpi ya corregido)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `redes-5bb81.ordenes_export.vw_pbi_ordenes_kpi` AS
SELECT
  orden_id,
  cliente,
  codi_segui_clien,
  codi_segui,
  tipo_segui_clien,
  tipo_orden,
  tipo_trabajo,
  tipo_cuadrilla,
  estado,
  motivo_cancelacion,
  motivo_finalizacion,
  region,
  distrito,
  cuadrilla_id,
  cuadrilla_nombre,
  fecha_solicitud_texto,
  FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%d/%m/%Y', fecha_solicitud_texto)) AS mes_solicitud,
  fecha_inicio_visita,
  fecha_fin_visita,
  hora_inicio_visita,
  hora_fin_visita,
  duracion_minutos,
  duracion_texto,
  direccion,
  telefono,
  numero_documento,
  lat,
  lng
FROM `redes-5bb81.ordenes_export.vw_ordenes_kpi`;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3 · vw_pbi_instalacion_garantia  (rediseñada)
--   Cambios respecto a la versión anterior:
--     · Instalaciones: solo estado = 'Finalizada'
--     · Garantías:     solo tipo_segui_clien = 'GAR'  (excluye AT y NULL)
--                      solo estado IN ('Finalizada','Cancelada')
--     · Nuevos campos: anio_instalacion, anio_garantia, tramo_dias
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `redes-5bb81.ordenes_export.vw_pbi_instalacion_garantia` AS

WITH base AS (
  SELECT
    *,
    SAFE.PARSE_DATE('%d/%m/%Y', fecha_solicitud_texto) AS fecha_solicitud_date_real
  FROM `redes-5bb81.ordenes_export.vw_pbi_ordenes_kpi`
),

instalaciones AS (
  SELECT
    orden_id                   AS orden_instalacion,
    cliente,
    codi_segui_clien,
    cuadrilla_id,
    cuadrilla_nombre,
    tipo_cuadrilla,
    distrito,
    region,
    lat                        AS lat_instalacion,
    lng                        AS lng_instalacion,
    tipo_trabajo               AS tipo_trabajo_instalacion,
    estado                     AS estado_instalacion,
    motivo_cancelacion         AS motivo_cancelacion_instalacion,
    motivo_finalizacion        AS motivo_finalizacion_instalacion,
    fecha_solicitud_date_real  AS fecha_instalacion,
    FORMAT_DATE('%Y-%m',       fecha_solicitud_date_real) AS mes_instalacion,
    FORMAT_DATE('%Y',          fecha_solicitud_date_real) AS anio_instalacion,
    hora_inicio_visita         AS hora_inicio_instalacion,
    hora_fin_visita            AS hora_fin_instalacion,
    duracion_texto             AS duracion_instalacion,
    duracion_minutos           AS duracion_minutos_instalacion
  FROM base
  WHERE UPPER(TRIM(tipo_trabajo)) IN ('INSTALACION','INSTALACION POSIBLE FRAUDE')
    AND estado = 'Finalizada'
),

garantias AS (
  SELECT
    orden_id                   AS orden_garantia,
    codi_segui_clien,
    codi_segui                 AS codi_segui_garantia,
    tipo_segui_clien           AS tipo_gar,
    cuadrilla_nombre           AS cuadrilla_nombre_garantia,
    lat                        AS lat_garantia,
    lng                        AS lng_garantia,
    tipo_trabajo               AS tipo_trabajo_garantia,
    estado                     AS estado_garantia,
    motivo_cancelacion         AS motivo_cancelacion_garantia,
    motivo_finalizacion        AS motivo_finalizacion_garantia,
    fecha_solicitud_date_real  AS fecha_garantia,
    FORMAT_DATE('%Y-%m',       fecha_solicitud_date_real) AS mes_garantia,
    FORMAT_DATE('%Y',          fecha_solicitud_date_real) AS anio_garantia,
    hora_inicio_visita         AS hora_inicio_garantia,
    hora_fin_visita            AS hora_fin_garantia,
    duracion_texto             AS duracion_garantia,
    duracion_minutos           AS duracion_minutos_garantia
  FROM base
  WHERE UPPER(TRIM(tipo_trabajo)) = 'GARANTIA'
    AND UPPER(TRIM(tipo_segui_clien)) = 'GAR'
    AND estado IN ('Finalizada','Cancelada')
),

cruce AS (
  SELECT
    i.*,
    g.orden_garantia,
    g.codi_segui_garantia,
    g.tipo_gar,
    g.tipo_trabajo_garantia,
    g.estado_garantia,
    g.motivo_cancelacion_garantia,
    g.motivo_finalizacion_garantia,
    g.cuadrilla_nombre_garantia,
    g.fecha_garantia,
    g.mes_garantia,
    g.anio_garantia,
    g.hora_inicio_garantia,
    g.hora_fin_garantia,
    g.duracion_garantia,
    g.duracion_minutos_garantia,
    g.lat_garantia,
    g.lng_garantia,
    DATE_DIFF(g.fecha_garantia, i.fecha_instalacion, DAY) AS dias_hasta_garantia
  FROM instalaciones i
  LEFT JOIN garantias g
    ON  i.codi_segui_clien = g.codi_segui_clien
    AND g.fecha_garantia > i.fecha_instalacion
),

reincidencias AS (
  SELECT
    codi_segui_clien,
    COUNT(DISTINCT orden_garantia) AS cantidad_garantias_cliente
  FROM garantias
  GROUP BY 1
)

SELECT
  c.*,
  -- Tramo para histograma de tiempo hasta garantía
  CASE
    WHEN c.dias_hasta_garantia IS NULL   THEN NULL
    WHEN c.dias_hasta_garantia <=  7     THEN '01 · 1-7 días'
    WHEN c.dias_hasta_garantia <= 15     THEN '02 · 8-15 días'
    WHEN c.dias_hasta_garantia <= 30     THEN '03 · 16-30 días'
    ELSE                                      '04 · >30 días'
  END AS tramo_dias_garantia,
  COALESCE(r.cantidad_garantias_cliente, 0) AS cantidad_garantias_cliente,
  CASE
    WHEN COALESCE(r.cantidad_garantias_cliente, 0) > 1 THEN 'REINCIDENTE'
    ELSE 'NORMAL'
  END AS tipo_reincidencia,
  CASE
    WHEN c.orden_garantia IS NOT NULL THEN 'CON GARANTIA'
    ELSE 'SIN GARANTIA'
  END AS estado_relacion_garantia
FROM cruce c
LEFT JOIN reincidencias r ON c.codi_segui_clien = r.codi_segui_clien;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 4 · vw_pbi_garantias_cuadrilla  (KPIs agregados por cuadrilla/mes)
--   Agrega desde vw_pbi_instalacion_garantia ya filtrada (solo GAR)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `redes-5bb81.ordenes_export.vw_pbi_garantias_cuadrilla` AS
SELECT
  mes_instalacion                                AS mes,
  anio_instalacion                               AS anio,
  cuadrilla_nombre,
  tipo_cuadrilla,
  region,
  COUNT(DISTINCT orden_instalacion)              AS instalaciones,
  COUNT(DISTINCT orden_garantia)                 AS garantias,
  ROUND(SAFE_DIVIDE(
    COUNT(DISTINCT orden_garantia),
    COUNT(DISTINCT orden_instalacion)) * 100, 2) AS pct_garantia,
  ROUND(AVG(dias_hasta_garantia), 1)             AS promedio_dias_garantia,
  COUNTIF(tipo_reincidencia = 'REINCIDENTE')     AS clientes_reincidentes
FROM `redes-5bb81.ordenes_export.vw_pbi_instalacion_garantia`
GROUP BY 1,2,3,4,5;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 5 · vw_kpi_garantias_cuadrilla  (corregida: referencia rota)
--   Antes apuntaba a vw_instalacion_garantia que no existe
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW `redes-5bb81.ordenes_export.vw_kpi_garantias_cuadrilla` AS
SELECT
  mes_instalacion                                AS mes,
  cuadrilla_nombre,
  region,
  COUNT(DISTINCT orden_instalacion)              AS instalaciones,
  COUNT(DISTINCT orden_garantia)                 AS garantias,
  ROUND(SAFE_DIVIDE(
    COUNT(DISTINCT orden_garantia),
    COUNT(DISTINCT orden_instalacion)) * 100, 2) AS pct_garantia
FROM `redes-5bb81.ordenes_export.vw_pbi_instalacion_garantia`
GROUP BY 1,2,3;
