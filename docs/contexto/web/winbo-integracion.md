# Integracion Winbo - REDES

Actualizado: 2026-06-15.

Estado: **Revisar**. Esta unidad documenta la sincronizacion de ordenes desde WinBo hacia REDES, incluyendo cliente HTTP, descarga XLSX, parser, mapper, import manual, import automatico por scheduler y efectos sobre `ordenes`.

## Alcance Leido

- `apps/web/src/lib/winbo/client.ts`
- `apps/web/src/lib/winbo/exportParser.ts`
- `apps/web/src/lib/winbo/mappers.ts`
- `apps/web/src/lib/winbo/sync.ts`
- `apps/web/src/lib/winbo/mappers.test.ts`
- `apps/web/src/lib/winbo/exportParser.test.ts`
- `apps/web/src/lib/winbo/runTests.mjs`
- `apps/web/src/app/api/ordenes/import/winbo/route.ts`
- `apps/web/src/app/api/ordenes/import/winbo/cron/route.ts`
- `apps/web/src/app/(protected)/home/ordenes/import/ImportClient.tsx`
- `apps/web/src/domain/ordenes/repo.ts`
- `firebase/functions/src/winboScheduler.ts`
- `firebase/functions/src/index.ts`

No se ejecutaron llamadas reales a WinBo, cron, Cloud Scheduler, Firebase deploys, emuladores ni escrituras contra Firestore.

## Proposito

La integracion descarga un export XLSX de ordenes desde WinBo, lo interpreta y lo importa a la coleccion `ordenes` de REDES. Soporta:

- ejecucion manual desde la UI de importacion de ordenes;
- dry run para validar export/parser/mapper sin escribir ordenes;
- ejecucion automatica cada 5 minutos en ventana operativa;
- auditoria por corrida en `ordenes_import_runs`;
- lock global para evitar importaciones concurrentes;
- notificaciones globales y por cuadrilla cuando hay cambios.

## Variables Y Secretos

Cliente WinBo:

- `WINBO_BASE_URL`
- `WINBO_EXPORT_BASE_URL`
- `WINBO_USERNAME`
- `WINBO_PASSWORD`
- `WINBO_TIMEOUT_MS` default `15000`
- `WINBO_EXPORT_POLL_MS` default `2500`
- `WINBO_EXPORT_MAX_RETRIES` default `3`

Cron/scheduler:

- `WINBO_CRON_TOKEN`
- `WEB_APP_BASE_URL` en Firebase Functions

`WINBO_USERNAME`, `WINBO_PASSWORD` y `WINBO_CRON_TOKEN` son sensibles y no deben registrarse en docs, logs ni respuestas.

## Cliente HTTP

`client.ts` implementa:

- `CookieJar` local para mantener cookies entre requests.
- Login contra `/login.aspx/IniciarSesion`.
- Aceptacion/verificacion de terminos con `/login.aspx/VerificarTermiCondi`.
- Export remoto con `/Paginas/OperadoresBO/misOrdenes.aspx/ExportarTabla`.
- Descarga del archivo desde `WINBO_EXPORT_BASE_URL`.
- Timeouts por `AbortController`.
- Reintentos de descarga segun `WINBO_EXPORT_MAX_RETRIES`.

El payload de export arma fechas de visita en formato `dd/mm/yyyy`, filtros WinBo y `nombreArchivo`. Si el usuario no envia nombre, se genera `misOrdenesdeTrabajoDD-MM-YYYY(HH-MM-SS)`.

## Parser XLSX

`exportParser.ts`:

- Lee XLSX con `xlsx`.
- Prefiere hoja `Hoja de Datos`.
- Si no existe, usa la primera hoja con filas significativas.
- Busca fila de encabezado en las primeras 12 filas.
- Requiere reconocer algun alias de orden: `orden`, `ordenid`, `nroorden`, `numeroorden`.
- Normaliza encabezados quitando acentos, espacios y simbolos.
- Devuelve filas canonicas con `__rowNumber`.

Errores principales:

- `WINBO_SHEET_NOT_FOUND`
- `WINBO_HEADERS_NOT_FOUND`

## Mapper A Ordenes

`mappers.ts` transforma filas normalizadas a `OrdenImportInput`:

- `ordenId`
- `tipoOrden`
- `tipoTraba`
- `fSoli`
- `cliente`
- `tipo`
- `tipoClienId`
- `cuadrilla`
- `estado`
- `direccion`
- `direccion1`
- `idenServi`
- `region`
- `zonaDistrito`
- `codiSeguiClien`
- `codiSegui`
- `numeroDocumento`
- `telefono`
- `fechaFinVisi`
- `fechaIniVisi`
- `motivoCancelacion`
- `motivoFinalizacion`
- `georeferencia`

Soporta fechas Excel numericas, fechas `yyyy-mm-dd`, `dd/mm/yyyy` y parsing nativo como fallback. Una fila sin `ordenId` queda invalida con issue `ORDEN_ID_REQUIRED`. Filas sin `fechaFinVisi` ni `fSoli` se importan si tienen `ordenId`, pero generan warning `MISSING_PRIMARY_DATE`.

## Sync Orquestador

`sync.ts` ejecuta el flujo:

1. Crea `ordenes_import_runs/{id}` con `status: RUNNING`.
2. Descarga XLSX desde WinBo.
3. Parsea XLSX.
4. Mapea filas a `OrdenImportInput`.
5. Si `dryRun` es true, no escribe ordenes.
6. Si `dryRun` es false, hace `upsertOrden` con concurrencia maxima 12.
7. Registra resumen `nuevos`, `actualizados`, `duplicadosSinCambios`, `invalidos`.
8. Notifica a cuadrillas afectadas via `notificaciones_tecnico`.
9. Crea notificacion global en `notificaciones`.
10. Actualiza audit run a `OK` o `ERROR`.

Lock:

- Documento: `system_locks/winbo_ordenes_sync`.
- TTL: 20 minutos.
- Owner: `${mode}:${actor.kind}:${actor.uid}`.
- Si otro owner mantiene lock vigente, falla con `IMPORT_IN_PROGRESS`.

Detalle operativo: el lock permite que el mismo owner/mode renueve o reingrese mientras siga vigente, porque solo bloquea owners distintos. En cron esto suele ser estable (`auto:system:system:winbo-cron`).

## Endpoint Manual

`POST /api/ordenes/import/winbo`

Requisitos:

- sesion web;
- `estadoAcceso == HABILITADO`;
- admin o permiso `ORDENES_IMPORT`.

Body:

- `dryRun`
- `mode: "manual"`
- `scope: "today" | "range"`
- `fechaVisiDesde`
- `fechaVisiHasta`
- `nombreArchivo`
- `filtros`

Valida fechas `yyyy-mm-dd` y rango. Toma lock modo `manual`, ejecuta `syncWinboOrdenes` y libera lock en `finally`. Devuelve `409` si hay import en progreso con owner distinto.

## UI Manual

`ImportClient.tsx` agrega una seccion "Sincronizar desde WinBo":

- modo `Hoy` o `Rango personalizado`;
- checkbox de dry run por defecto;
- nombre de archivo opcional;
- boton `Validar en WinBo (dry run)`;
- boton `Importar desde WinBo` cuando dry run esta desactivado.

Muestra resumen de export, hoja, filas leidas, validas, omitidas, invalidas, warnings e incidencias.

## Cron Web

`POST /api/ordenes/import/winbo/cron`

Requisitos:

- Header `x-winbo-cron-token` igual a `WINBO_CRON_TOKEN`.
- Ventana Lima entre 07:30 y 22:00.

Si esta fuera de ventana devuelve `ok: true, skipped: true, reason: "OUTSIDE_WINDOW"`.

Si hay lock devuelve `ok: true, skipped: true, reason: "LOCKED"`.

Si ejecuta, usa:

- actor `system:winbo-cron`;
- `dryRun: false`;
- `mode: "auto"`;
- `scope: "today"`;
- fechas del dia Lima;
- filtros vacios.

## Firebase Scheduler

`firebase/functions/src/winboScheduler.ts` exporta `winboOrdenesAutoSync`.

Configuracion:

- region `us-central1`;
- schedule `every 5 minutes`;
- timezone `America/Lima`;
- secret `WINBO_CRON_TOKEN`;
- param `WEB_APP_BASE_URL`.

La function tambien valida ventana 07:30-22:00 antes de llamar al endpoint web. Luego hace `POST {WEB_APP_BASE_URL}/api/ordenes/import/winbo/cron` con header `x-winbo-cron-token`.

## Upsert De Ordenes

`domain/ordenes/repo.ts`:

- escribe en `ordenes/{ordenId}`;
- enriquece cuadrilla desde `cuadrillas/{id}` calculando `K{numero}_{MOTO|RESIDENCIAL}`;
- parsea georeferencia `lat,lng`;
- convierte fechas a strings Lima `ymd/hm` y timestamps;
- deriva `tipoSeguiClien` desde `codiSegui` (`GAR-` o `AT-`);
- deriva opcionales desde `idenServi` (`planGamer`, `cat6`, `kitWifiPro`, `cantMESHwin`, `cantFONOwin`, `cantBOXwin`);
- compara campos de negocio para decidir `CREATED`, `UPDATED` o `UNCHANGED`;
- notifica a tecnico cuando hay orden nueva, cambio de cuadrilla o cambio de estado.

Riesgo: `tipoOrden` entrante no se preserva directamente; se deriva desde `tipo` como `CONDOMINIO` si `tipo === "Condominio/Edificio"`, si no `RESIDENCIAL`. Esto debe validarse con semantica WinBo/manual.

## Tests Existentes

- `mappers.test.ts` cubre mapeo basico, alias principales, fila sin orden, motivo de finalizacion y coexistencia con motivo de cancelacion.
- `exportParser.test.ts` cubre deteccion de fila de encabezado y lectura de filas.
- `runTests.mjs` ejecuta pruebas simples del parser/mapper.

No se ejecutaron en esta revision para evitar mezclar documentacion con validacion de runtime local.

## Riesgos Y Observaciones

- Hay mojibake visible en strings de codigo relacionados con WinBo/notificaciones (`ContraseÃ±a`, `Ã“rdenes`, `SincronizaciÃ³n`, `â†’`). Puede ser solo encoding historico del archivo, pero conviene normalizar.
- El cliente depende de endpoints WebForms/ASP.NET de WinBo y de cookies; cambios menores externos pueden romper login/export/download.
- `WINBO_EXPORT_MAX_RETRIES` default 3 con poll incremental puede ser corto si WinBo demora generando XLSX.
- El cron automatico importa cada 5 minutos durante 07:30-22:00; si WinBo devuelve un export grande, puede solaparse con la siguiente corrida y depender del lock.
- El lock tiene TTL 20 minutos; si un proceso queda vivo mas tiempo o una descarga tarda demasiado, otra corrida podria entrar cuando venza.
- El mismo owner/mode puede reentrar aunque exista lock vigente. Para cron esto reduce bloqueos propios, pero puede permitir doble ejecucion si hay dos invocaciones auto simultaneas.
- La concurrencia de upsert es hasta 12; si hay muchos cambios, se generan multiples lecturas/escrituras/notificaciones.
- `downloadUrl` queda devuelto en respuesta y audit run; validar si expone rutas sensibles o temporales del export.
- El endpoint manual permite rango arbitrario de fechas validas; no se observa limite maximo de dias.

## Pendientes

- Ejecutar tests locales del parser/mapper en una unidad de validacion controlada.
- Revisar mojibake en `client.ts`, `sync.ts` y `ordenes/repo.ts`.
- Confirmar que secrets/envs estan configurados en produccion y no aparecen en logs.
- Definir limite maximo de rango para import manual.
- Revisar si el lock debe bloquear tambien reentradas del mismo owner mientras este vigente.
- Evaluar si TTL 20 minutos cubre el peor caso real de WinBo/export/upsert.
- Validar si `WINBO_EXPORT_MAX_RETRIES` default 3 es suficiente para exports grandes.
- Confirmar si `downloadUrl` debe guardarse/devolverse completo o solo `nombreArchivo`.
- Validar con negocio la derivacion de `tipoOrden` desde `tipo`.
- Revisar indices/queries asociados a `ordenes_import_runs` y `system_locks` si se consultan en UI/reportes.

