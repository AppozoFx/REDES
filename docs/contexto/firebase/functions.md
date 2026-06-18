# Firebase Functions - REDES

Actualizado: 2026-06-16.

Estado: **Revisar**. Deep dive focalizado en `garantiasCruceSync` y su relacion con BigQuery/backfills. Las functions restantes de Telegram, tramos y usuarios quedaron documentadas en `docs\contexto\firebase\functions-restantes.md`.

## Alcance

Fuentes leidas:

- `firebase\firebase.json`
- `firebase\functions\package.json`
- `firebase\functions\src\index.ts`
- `firebase\functions\src\garantiasCruceSync.ts`
- `firebase\firestore.rules`
- `firebase\firestore.indexes.json`
- `scripts\backfill_garantias_cruce_bq.ts`
- `firebase\functions\backfill_garantias_cruce_bq.ts`
- `scripts\backfill_instalaciones_abril_bq.ts`
- `firebase\functions\backfill_instalaciones_abril_bq.ts`
- `scripts\bigquery_garantias_cruce_setup.sql`
- `scripts\bigquery_garantias_dashboard.sql`
- `scripts\bigquery_update_vw_instalacion_garantia.sql`
- `firebase\functions\src\bootstrapAdmin.ts`
- `firebase\functions\src\usersCreate.ts`
- `firebase\functions\src\tramoAlertas.ts`
- `firebase\functions\src\telegram\webhook.ts`

No se ejecutaron scripts, queries, deploys ni emuladores.

## Configuracion De Functions

`firebase\firebase.json` define el codebase `default` con source `functions`, runtime por `package.json` en Node 22 y predeploy `npm.cmd --prefix "$RESOURCE_DIR" run build`.

El paquete `firebase\functions\package.json` usa:

- `firebase-functions` 7.x.
- `firebase-admin` 13.x.
- `@google-cloud/bigquery` 7.x.
- `zod`.
- Script `build` con `tsc`.

`firebase\functions\src\index.ts` aplica `setGlobalOptions({ maxInstances: 10 })` y exporta:

- `bootstrapAdmin`
- `usersCreate`
- `telegramWebhook`
- `telegramPendientesReminder`
- `telegramPreliqRetryWorker`
- `telegramCleanupWorker`
- `winboOrdenesAutoSync`
- `tramoAlerta1`, `tramoAlerta2`, `tramoAlerta3`, `tramoAlertaCierreRuta`
- `garantiasCruceSync`

## `garantiasCruceSync`

Ruta: `firebase\functions\src\garantiasCruceSync.ts`.

Trigger:

- `onDocumentWritten`
- Region `southamerica-west1`
- Documento `garantias_cruce_periods/{instYm}`
- Timeout 300 segundos
- Memoria 512 MiB

Destino BigQuery hardcodeado:

- Proyecto `redes-5bb81`
- Dataset `ordenes_export`
- Tabla `garantias_proveedor_rows`

Flujo observado:

1. Toma `instYm` desde el path del documento.
2. Crea cliente BigQuery con `projectId: redes-5bb81`.
3. Si el doc de periodo fue eliminado, borra en BigQuery todas las filas con ese `inst_ym` y termina.
4. Si el doc existe, lee `importId` desde el documento padre.
5. Lee la subcoleccion `garantias_cruce_periods/{instYm}/rows`.
6. Borra primero las filas existentes de BigQuery para ese periodo.
7. Si Firestore no tiene filas, deja BigQuery sin filas para ese periodo.
8. Mapea cada row proveedor a columnas BigQuery.
9. Inserta en batches de 500.

Campos enviados a BigQuery:

| BigQuery | Firestore row / fuente |
| --- | --- |
| `inst_ym` | path `{instYm}` |
| `import_id` | doc padre `importId` |
| `win_id` | `id` |
| `cod_pedido` | `codPedido` |
| `nombre` | `nombre` |
| `fecha_instalacion_ymd` | `fechaInstalacionYmd` |
| `fecha_atencion_ymd` | `fechaAtencionYmd` |
| `dias_desde_instalacion` | `diasDesdeInstalacion` si es number |
| `cuadrilla` | `cuadrilla` |
| `tipo_cierre` | `tipoCierre` |
| `solucionado` | `solucionado` |
| `partner` | `partner` |
| `sincronizado_at` | timestamp generado al sincronizar |

## Seguridad Firestore Observada

Detalle propio: `docs\contexto\firebase\auth-firestore-rules.md`.

`firebase\firestore.rules` no define reglas explicitas para:

- `garantias_cruce_imports`
- `garantias_cruce_periods`
- `garantias_cruce_periods/{instYm}/rows`

Como el bloque default deniega todo, el cliente Firestore directo no deberia poder leer/escribir estas colecciones. Las rutas web y functions operan por Admin SDK, por lo que las reglas no las limitan.

Esto reduce exposicion desde cliente, pero tambien significa que cualquier escritura operativa debe pasar por servidor/Admin SDK.

## Riesgos Operativos

- La estrategia delete+insert por periodo evita duplicados, pero si BigQuery falla despues del delete y antes de completar todos los batches, el periodo puede quedar vacio o incompleto.
- `PROJECT`, `DATASET` y `TABLE` estan hardcodeados. No hay separacion visible por entorno.
- El delete usa query sin `location`; revisar si el job hereda correctamente ubicacion del dataset en todos los entornos.
- La funcion se dispara al escribir el documento padre `garantias_cruce_periods/{instYm}`. Si se actualiza solo una row de la subcoleccion sin tocar el padre, no se observa trigger de resync.
- Los logs del archivo tienen caracteres mojibake en algunos textos; no afecta la logica, pero dificulta lectura operativa.

## Relacion Con Power BI / BigQuery

La funcion llena `garantias_proveedor_rows`, consumida por `vw_pbi_cruce_garantias` definida en `scripts\bigquery_garantias_cruce_setup.sql`.

La vista cruza WIN contra `vw_pbi_instalacion_garantia`, que depende de las vistas de ordenes KPI. Por eso la exactitud del dashboard depende de dos pipelines:

- Firestore `garantias_cruce_periods` -> Function -> BigQuery `garantias_proveedor_rows`.
- Firestore `ordenes` -> export BigQuery -> vistas `vw_ordenes_kpi`, `vw_pbi_ordenes_kpi`, `vw_pbi_instalacion_garantia`.

## Pendientes

- Decidir si `garantiasCruceSync` debe usar tabla staging o transaccion logica para no dejar periodos incompletos ante fallas parciales.
- Mover proyecto/dataset/tabla a configuracion por entorno si se planea staging.
- Validar si el trigger debe escuchar tambien cambios en subcoleccion `rows`.
- Revisar si BigQuery queries/inserts deben fijar `location: "southamerica-west1"`.
- Revisar las decisiones pendientes de `functions-restantes.md`: allowed users de Telegram, colisiones de retries por pedido, escape Markdown, helpers auth duplicados y divergencia de schema `usersCreate` contra dominio web.
