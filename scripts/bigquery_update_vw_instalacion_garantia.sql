-- Actualización: vw_pbi_instalacion_garantia
-- Motivo: incluir WINBOX EN COMODATO, MESH + WINBOX EN COMODATO y Pago Adelantado
--         como instalaciones válidas (antes solo contaba INSTALACION e INSTALACION POSIBLE FRAUDE)
-- Impacto: April 2026 pasa de 2563 a 2570 instalaciones finalizadas
-- Ejecutar en: BigQuery Console > proyecto redes-5bb81 > dataset ordenes_export

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
  WHERE UPPER(TRIM(tipo_trabajo)) IN (
      'INSTALACION',
      'INSTALACION POSIBLE FRAUDE',
      'WINBOX EN COMODATO',
      'MESH + WINBOX EN COMODATO',
      'PAGO ADELANTADO'
    )
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
    AND estado IN ('Finalizada', 'Cancelada')
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
