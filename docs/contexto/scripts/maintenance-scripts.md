# Scripts Operativos - REDES

Actualizado: 2026-06-15.

Estado: **Revisar**. Deep dive focalizado en SQL/backfills de garantias y scripts BigQuery relacionados. No se ejecutaron scripts ni queries.

## Alcance Leido

- `scripts\backfill_garantias_cruce_bq.ts`
- `firebase\functions\backfill_garantias_cruce_bq.ts`
- `scripts\backfill_instalaciones_abril_bq.ts`
- `firebase\functions\backfill_instalaciones_abril_bq.ts`
- `scripts\bigquery_garantias_cruce_setup.sql`
- `scripts\bigquery_garantias_dashboard.sql`
- `scripts\bigquery_update_vw_instalacion_garantia.sql`

## Backfill `garantias_proveedor_rows`

Archivos:

- `scripts\backfill_garantias_cruce_bq.ts`
- `firebase\functions\backfill_garantias_cruce_bq.ts`

Comparacion: ambos archivos son identicos en la revision del 2026-06-15.

Uso declarado:

```powershell
npx ts-node --project apps/web/tsconfig.json scripts/backfill_garantias_cruce_bq.ts
```

Requisitos declarados:

- `GOOGLE_APPLICATION_CREDENTIALS` con service account que tenga acceso a BigQuery.
- Firebase Admin configurado.

Comportamiento:

1. Inicializa Firebase Admin si no existe app.
2. Lista `garantias_cruce_periods` ordenado por `instYm`.
3. Por cada periodo, lee subcoleccion `rows`.
4. Borra de BigQuery las filas del `inst_ym`.
5. Si el periodo no tiene filas, lo deja vacio en BigQuery.
6. Inserta rows en batches de 500 en `redes-5bb81.ordenes_export.garantias_proveedor_rows`.

Riesgos:

- Comparte la misma estrategia delete+insert de `garantiasCruceSync`; una falla despues del delete puede dejar el periodo incompleto.
- No recibe parametros de periodo; procesa todos los periodos existentes.
- Proyecto/dataset/tabla estan hardcodeados.
- No fija `location` en queries BigQuery.

## Backfill Instalaciones Abril 2026

Archivos:

- `scripts\backfill_instalaciones_abril_bq.ts`
- `firebase\functions\backfill_instalaciones_abril_bq.ts`

Proposito declarado:

- Detectar instalaciones finalizadas de abril 2026 que no llegaron a BigQuery porque la extension empezo el 18-may-2026.
- Tocar documentos Firestore faltantes con `_bqSyncAt` para disparar la extension BigQuery Export.

Diferencias observadas entre variantes:

| Tema | `scripts\...` | `firebase\functions\...` |
| --- | --- | --- |
| BigQuery query | Incluye `location: "southamerica-west1"` | No fija location |
| Firestore query | Filtra `estado == "Finalizada"` en query | Lee rango por fecha y filtra `estado` en memoria |
| Select Firestore | `tipoTraba`, `fSoliYmd` | `tipoTraba`, `fSoliYmd`, `estado` |

Ambas variantes limitan instalaciones validas a:

- `INSTALACION`
- `INSTALACION POSIBLE FRAUDE`

Pendiente importante: esto no incorpora los tipos agregados luego al denominador del dashboard:

- `WINBOX EN COMODATO`
- `MESH + WINBOX EN COMODATO`
- `PAGO ADELANTADO`

No conviene ejecutar este backfill sin decidir si debe alinearse con el nuevo criterio de instalaciones validas.

## SQL `bigquery_garantias_cruce_setup.sql`

Crea o asegura:

- Tabla `redes-5bb81.ordenes_export.garantias_proveedor_rows`.
- Vista `redes-5bb81.ordenes_export.vw_pbi_cruce_garantias`.

La vista:

- Lee WIN desde `garantias_proveedor_rows`.
- Lee REDES desde `vw_pbi_instalacion_garantia`.
- Filtra REDES a `tipo_gar = 'GAR'` y `estado_garantia IN ('Finalizada', 'Cancelada')`.
- Genera estados `COINCIDE`, `COINCIDE_FECHA_DIFERENTE`, `SOLO_WIN`, `SOLO_REDES`.
- Agrupa categoria gerencial como `Coincide`, `Solo WIN`, `Solo REDES`.

Observacion: la API web usa estado `PROVEEDOR_REDES_PENDIENTE` para filas WIN con orden REDES aun no finalizada/cancelada. La vista SQL solo cruza contra GAR finalizadas/canceladas, por lo que ese estado no aparece en `vw_pbi_cruce_garantias`.

## SQL `bigquery_garantias_dashboard.sql`

Script de vistas para dashboard Power BI. Orden declarado:

1. Recrea `vw_ordenes_kpi` y corrige calculo de `duracion_texto`.
2. Recrea `vw_pbi_ordenes_kpi`.
3. Recrea `vw_pbi_instalacion_garantia`.
4. Crea `vw_pbi_garantias_cuadrilla`.
5. Crea `vw_kpi_garantias_cuadrilla`.

Reglas clave en la version leida:

- Instalaciones: `estado = 'Finalizada'`.
- En este script, instalaciones validas solo incluyen `INSTALACION` e `INSTALACION POSIBLE FRAUDE`.
- Garantias: `tipo_trabajo = 'GARANTIA'`, `tipo_segui_clien = 'GAR'`, estado `Finalizada` o `Cancelada`.
- Garantia debe ser posterior a la instalacion.

## SQL `bigquery_update_vw_instalacion_garantia.sql`

Script posterior y mas especifico para recrear `vw_pbi_instalacion_garantia`.

Cambio declarado:

- Incluye `WINBOX EN COMODATO`, `MESH + WINBOX EN COMODATO` y `PAGO ADELANTADO` como instalaciones validas.
- Impacto documentado: abril 2026 pasa de 2563 a 2570 instalaciones finalizadas.

Este archivo queda como fuente mas reciente para el denominador de instalaciones frente a `bigquery_garantias_dashboard.sql`.

## Orden Operativo Inferido

Para entorno nuevo o reconstruccion:

1. Crear/recrear vistas base de ordenes KPI.
2. Aplicar la version actualizada de `vw_pbi_instalacion_garantia`.
3. Crear tabla `garantias_proveedor_rows`.
4. Crear/recrear `vw_pbi_cruce_garantias`.
5. Ejecutar backfill de garantias solo si Firestore `garantias_cruce_periods` ya esta correcto y se acepta el riesgo delete+insert.

## Pendientes

- Unificar o eliminar duplicados de backfills entre `scripts\` y `firebase\functions\`.
- Parametrizar backfill de garantias por periodo antes de usarlo operativamente.
- Alinear `bigquery_garantias_dashboard.sql` con `bigquery_update_vw_instalacion_garantia.sql` para evitar que una ejecucion antigua revierta el denominador.
- Decidir si la vista SQL debe modelar tambien `PROVEEDOR_REDES_PENDIENTE`.
- Agregar checklist de ejecucion segura: credenciales, proyecto activo, dry-run/query preview, conteos antes/despues y rollback.
