-- =============================================================================
-- CRUCE GARANTIAS PROVEEDOR → BIGQUERY
-- Ejecutar una sola vez para crear la tabla y la vista
-- Proyecto: redes-5bb81  Dataset: ordenes_export
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: garantias_proveedor_rows
--    Recibe las filas WIN (Excel M&D) sincronizadas desde Firestore
--    vía Cloud Function garantiasCruceSync.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `redes-5bb81.ordenes_export.garantias_proveedor_rows`
(
  inst_ym                STRING  NOT NULL OPTIONS (description = 'Periodo YYYY-MM según fecha_instalacion_ymd'),
  import_id              STRING           OPTIONS (description = 'ID del documento en garantias_cruce_imports'),
  win_id                 STRING           OPTIONS (description = 'ID del registro en el Excel (ej: GAR-12345)'),
  cod_pedido             STRING           OPTIONS (description = 'Clave de cruce: equivale a codi_segui_clien en ordenes'),
  nombre                 STRING           OPTIONS (description = 'Nombre del cliente según Excel WIN'),
  fecha_instalacion_ymd  STRING           OPTIONS (description = 'Fecha de instalación YYYY-MM-DD'),
  fecha_atencion_ymd     STRING           OPTIONS (description = 'Fecha de atención / garantía YYYY-MM-DD'),
  dias_desde_instalacion INT64            OPTIONS (description = 'Días entre instalación y atención'),
  cuadrilla              STRING           OPTIONS (description = 'Cuadrilla según Excel WIN'),
  tipo_cierre            STRING           OPTIONS (description = 'Tipo de cierre registrado por WIN'),
  solucionado            STRING           OPTIONS (description = 'Campo solucionado del Excel'),
  partner                STRING           OPTIONS (description = 'Partner instalador (M&D, M&D SGI…)'),
  sincronizado_at        TIMESTAMP        OPTIONS (description = 'Timestamp de la última sincronización')
)
OPTIONS (
  description = 'Filas del Excel WIN (proveedor M&D) por período. '
                'Sincronizadas automáticamente desde Firestore garantias_cruce_periods/{instYm}/rows '
                'mediante la Cloud Function garantiasCruceSync.'
);


-- -----------------------------------------------------------------------------
-- 2. VISTA: vw_pbi_cruce_garantias
--    JOIN entre filas WIN y vw_pbi_instalacion_garantia (solo tipo GAR,
--    estado Finalizada o Cancelada).
--    Produce una fila por cada combinación relevante con estado_cruce.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW `redes-5bb81.ordenes_export.vw_pbi_cruce_garantias`
OPTIONS (
  description = 'Cruce WIN vs REDES por período de instalación. '
                'Columna estado_cruce: COINCIDE / COINCIDE_FECHA_DIFERENTE / SOLO_WIN / SOLO_REDES. '
                'Columna categoria_cruce: agrupación de 3 vías para dashboard gerencial.'
)
AS

WITH

-- ── WIN: filas del Excel del proveedor ────────────────────────────────────────
win AS (
  SELECT
    inst_ym,
    import_id,
    win_id,
    cod_pedido,
    nombre                                                        AS win_nombre,
    SAFE.PARSE_DATE('%Y-%m-%d', fecha_instalacion_ymd)            AS win_fecha_instalacion,
    SAFE.PARSE_DATE('%Y-%m-%d', fecha_atencion_ymd)               AS win_fecha_atencion,
    dias_desde_instalacion                                        AS win_dias,
    cuadrilla                                                     AS win_cuadrilla,
    tipo_cierre                                                   AS win_tipo_cierre,
    partner                                                       AS win_partner
  FROM `redes-5bb81.ordenes_export.garantias_proveedor_rows`
),

-- ── REDES: garantías GAR válidas (Finalizada o Cancelada) ────────────────────
redes_gar AS (
  SELECT
    mes_instalacion                                               AS inst_ym,
    codi_segui_clien,
    orden_garantia,
    cliente                                                       AS redes_cliente,
    fecha_garantia                                                AS redes_fecha_atencion,
    fecha_instalacion                                             AS redes_fecha_instalacion,
    estado_garantia                                               AS redes_estado,
    cuadrilla_nombre_garantia                                     AS redes_cuadrilla,
    mes_garantia,
    anio_garantia,
    dias_hasta_garantia,
    tipo_reincidencia,
    cantidad_garantias_cliente
  FROM `redes-5bb81.ordenes_export.vw_pbi_instalacion_garantia`
  WHERE tipo_gar        = 'GAR'
    AND estado_garantia IN ('Finalizada', 'Cancelada')
),

-- ── PARTE 1: perspectiva WIN (LEFT JOIN → todos los registros WIN) ────────────
win_joined AS (
  SELECT
    w.inst_ym,
    w.import_id,
    w.win_id,
    w.cod_pedido                                                  AS win_cod_pedido,
    w.win_nombre,
    w.win_fecha_instalacion,
    w.win_fecha_atencion,
    w.win_dias,
    w.win_cuadrilla,
    w.win_tipo_cierre,
    w.win_partner,
    r.orden_garantia                                              AS redes_orden,
    r.codi_segui_clien                                            AS redes_codigo_cliente,
    r.redes_cliente,
    r.redes_fecha_atencion,
    r.redes_fecha_instalacion,
    r.redes_estado,
    r.redes_cuadrilla,
    r.mes_garantia,
    r.anio_garantia,
    r.dias_hasta_garantia,
    r.tipo_reincidencia,
    r.cantidad_garantias_cliente,
    CASE
      WHEN r.codi_segui_clien IS NULL                                     THEN 'SOLO_WIN'
      WHEN w.win_fecha_instalacion = r.redes_fecha_instalacion
       AND w.win_fecha_atencion    = r.redes_fecha_atencion                THEN 'COINCIDE'
      ELSE                                                                      'COINCIDE_FECHA_DIFERENTE'
    END                                                           AS estado_cruce
  FROM win w
  LEFT JOIN redes_gar r
    ON  w.cod_pedido = r.codi_segui_clien
    AND w.inst_ym    = r.inst_ym
),

-- ── PARTE 2: SOLO_REDES (GAR fin/cancel sin ningún WIN del mismo período) ─────
redes_solo AS (
  SELECT
    r.inst_ym,
    CAST(NULL AS STRING)                                          AS import_id,
    CAST(NULL AS STRING)                                          AS win_id,
    CAST(NULL AS STRING)                                          AS win_cod_pedido,
    CAST(NULL AS STRING)                                          AS win_nombre,
    CAST(NULL AS DATE)                                            AS win_fecha_instalacion,
    CAST(NULL AS DATE)                                            AS win_fecha_atencion,
    CAST(NULL AS INT64)                                           AS win_dias,
    CAST(NULL AS STRING)                                          AS win_cuadrilla,
    CAST(NULL AS STRING)                                          AS win_tipo_cierre,
    CAST(NULL AS STRING)                                          AS win_partner,
    r.orden_garantia                                              AS redes_orden,
    r.codi_segui_clien                                            AS redes_codigo_cliente,
    r.redes_cliente,
    r.redes_fecha_atencion,
    r.redes_fecha_instalacion,
    r.redes_estado,
    r.redes_cuadrilla,
    r.mes_garantia,
    r.anio_garantia,
    r.dias_hasta_garantia,
    r.tipo_reincidencia,
    r.cantidad_garantias_cliente,
    'SOLO_REDES'                                                  AS estado_cruce
  FROM redes_gar r
  WHERE NOT EXISTS (
    SELECT 1
    FROM win w
    WHERE w.cod_pedido = r.codi_segui_clien
      AND w.inst_ym    = r.inst_ym
  )
),

-- ── UNION de ambas partes ─────────────────────────────────────────────────────
union_all AS (
  SELECT * FROM win_joined
  UNION ALL
  SELECT * FROM redes_solo
)

-- ── Resultado final con categoría gerencial ───────────────────────────────────
SELECT
  *,
  CASE estado_cruce
    WHEN 'COINCIDE'               THEN 'Coincide'
    WHEN 'COINCIDE_FECHA_DIFERENTE' THEN 'Coincide'
    WHEN 'SOLO_WIN'               THEN 'Solo WIN'
    WHEN 'SOLO_REDES'             THEN 'Solo REDES'
    ELSE estado_cruce
  END AS categoria_cruce
FROM union_all;
