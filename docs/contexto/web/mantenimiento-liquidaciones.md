# Mantenimiento Liquidaciones - REDES

Actualizado: 2026-07-08.

Estado: **Revisar**. Deep dive del dominio critico `mantenimientoLiquidaciones`, sus rutas API, pantallas de mantenimiento, catalogo de causas raiz, consulta de stock de cuadrillas y entrada desde Telegram.

## Alcance

Fuentes leidas:

- `apps/web/src/domain/mantenimientoLiquidaciones/schemas.ts`
- `apps/web/src/domain/mantenimientoLiquidaciones/repo.ts`
- `apps/web/src/domain/mantenimientoCausasRaiz/repo.ts`
- `apps/web/src/app/api/mantenimiento/liquidaciones/*/route.ts`
- `apps/web/src/app/api/mantenimiento/causas-raiz/*/route.ts`
- `apps/web/src/app/api/mantenimiento/cuadrillas/stock-materiales*/route.ts`
- `apps/web/src/app/api/integrations/telegram/mantenimiento/create-ticket/route.ts`
- `apps/web/src/app/(protected)/home/mantenimiento/liquidaciones/*`
- `apps/web/src/core/auth/guards.ts`, `apps/web/src/core/rbac/buildHomeNav.ts`

No se ejecuto la app, tests, emuladores, exports reales, queries contra datos de produccion ni escrituras contra Firestore.

## Resumen

El flujo administra tickets de mantenimiento y consume stock de cuadrillas al liquidar. La coleccion principal es `mantenimiento_liquidaciones`; los consumos y correcciones se reflejan en `cuadrillas/{id}/stock` y `movimientos_inventario`.

Estados del dominio:

- `ABIERTO`
- `LISTO_PARA_LIQUIDAR`
- `LIQUIDADO`
- `CORRECCION_PENDIENTE`
- `ANULADO`

Origenes:

- `MANUAL`
- `TELEGRAM`
- `IMPORTADO`

La UI vive en `/home/mantenimiento/liquidaciones` y usa area `MANTENIMIENTO` como guard principal. No se observo permiso granular especifico para crear, liquidar, corregir, borrar o exportar liquidaciones; las APIs usan `requireAreaScope(session, ["MANTENIMIENTO"])`.

## Modelo De Entrada

`MantenimientoLiquidacionCreateSchema` exige:

- `ticketNumero`
- `fechaAtencionYmd`
- `cuadrillaId`
- opcionales operativos: `codigoCaja`, distrito, latitud, longitud, horas, causa raiz, solucion, observacion.
- materiales consumidos con `materialId`, `unidadTipo` (`UND` o `METROS`), `und` y `metros`.
- `sinMateriales` y `motivoSinMateriales` para liquidaciones sin consumo.

El repo normaliza:

- ticket a `ticketNumeroNorm` en mayusculas.
- coordenadas fuera de rango a `null`.
- estado legacy `BORRADOR` a `ABIERTO`.
- materiales sin cantidad a fuera del payload.
- cuadrilla solo si existe y `area === "MANTENIMIENTO"`.

## Flujo Principal

### Crear

`createMantenimientoLiquidacion`:

- valida schema Zod.
- carga cuadrilla de mantenimiento desde `cuadrillas`.
- calcula `ticketVisita` contando liquidaciones previas por `ticketNumeroNorm` o ticket exacto.
- crea id con ticket normalizado, timestamp y aleatorio.
- guarda estado `ABIERTO`, datos de cuadrilla/coordinador y `audit`.

Riesgo: `ticketVisita` se calcula antes del `set` y no corre dentro de transaccion; dos creaciones concurrentes del mismo ticket podrian asignar la misma visita.

### Actualizar

`updateMantenimientoLiquidacion`:

- bloquea si ya esta `LIQUIDADO`.
- revalida cuadrilla, ticket y materiales.
- conserva `ticketVisita` actual.
- actualiza datos operativos, estado y `audit`.

### Liquidar

`liquidarMantenimientoLiquidacion` corre en transaccion:

- bloquea doble liquidacion y estado `ANULADO`.
- exige cuadrilla.
- si `sinMateriales` es true, exige motivo y marca `LIQUIDADO` sin movimiento.
- si hay materiales, valida catalogo `materiales`, stock de `cuadrillas/{id}/stock` y unidad canonica del catalogo.
- descuenta stock por `stockUnd` o `stockCm`.
- crea `movimientos_inventario` con tipo `LIQUIDACION_MANTENIMIENTO`.
- guarda `materialesSnapshot`, `movimientoInventarioId`, `liquidadoAt` y `liquidadoBy`.

Riesgo: para materiales en metros, cuando existe `stockCm`, el codigo setea `stockCm: availableCm - needCm` en vez de usar increment. La transaccion protege consistencia, pero hay que validar compatibilidad con escrituras externas que todavia usen `stockUnd` legacy para materiales medidos en metros.

### Corregir Liquidacion

`corregirMantenimientoLiquidacion`:

- solo permite corregir si el estado actual es `LIQUIDADO`.
- calcula diferencias entre `materialesSnapshot` anterior y materiales nuevos.
- descuenta o devuelve stock segun delta.
- si hay delta, crea movimiento `CORRECCION_LIQUIDACION_MANTENIMIENTO`.
- actualiza metadata, `materialesConsumidos`, `materialesSnapshot`, `correccionPendiente: false` y auditoria.

Riesgo: el cambio de cuadrilla en correccion usa el stock de la nueva cuadrilla para calcular delta contra el snapshot anterior. Si la liquidacion original consumio stock de otra cuadrilla, corregir cambiando `cuadrillaId` puede no devolver el stock a la cuadrilla original.

### Eliminar

`deleteMantenimientoLiquidacion` (actualizado 2026-07-08, ver incidente mas abajo):

- permite anular solo si estado `ABIERTO` o `LIQUIDADO`.
- si estaba `LIQUIDADO`, devuelve materiales del snapshot al stock de la cuadrilla actual.
- crea movimiento `ELIMINACION_LIQUIDACION_MANTENIMIENTO` si hubo devolucion.
- **ya no borra el documento**. Hace soft-delete: `estado: "ANULADO"` + `anuladoAt` + `anuladoBy` via `tx.set(ref, ..., {merge:true})`.
- escribe un registro en `auditoria` con `action: "MANTENIMIENTO_LIQUIDACION_ANULADA"`, `actorUid`, `meta.ticketNumero`, `meta.cuadrillaId` y `target.{collection,id}`.

`findLiquidacionesByTicket` excluye documentos `ANULADO` de sus resultados, para que la numeracion de `ticketVisita` y el preview de visitas previas se comporten igual que antes del cambio (como si el doc no existiera).

El filtro por defecto de `MantenimientoLiquidacionesListClient.tsx` oculta `ANULADO` salvo que se seleccione ese estado explicitamente en el dropdown de filtros (la opcion ya existia en el UI, sin uso real hasta ahora).

## APIs

Todas bajo `apps/web/src/app/api/mantenimiento/liquidaciones` usan runtime `nodejs`.

| Ruta | Metodo | Guardia | Accion |
| --- | --- | --- | --- |
| `/list` | GET | Area `MANTENIMIENTO` | Lista ultimas 500 por `audit.createdAt desc`. |
| `/detail?id=` | GET | Area `MANTENIMIENTO` | Obtiene una liquidacion por id. |
| `/create` | POST | Area `MANTENIMIENTO` | Crea liquidacion. |
| `/update` | POST | Area `MANTENIMIENTO` | Actualiza liquidacion no confirmada. |
| `/liquidar` | POST | Area `MANTENIMIENTO` | Confirma liquidacion y afecta inventario. |
| `/corregir` | POST | Area `MANTENIMIENTO` | Ajusta liquidacion ya confirmada y genera delta de inventario. |
| `/delete` | POST | Area `MANTENIMIENTO` | Anula (soft-delete) abierta o liquidada, devolviendo stock si aplica. |
| `/ticket-preview` | GET | Area `MANTENIMIENTO` | Previsualiza visitas previas del ticket. |
| `/export?month=YYYY-MM` | GET | Area `MANTENIMIENTO` | Exporta XLSX con resumen, materiales, interno, totales y hojas por cuadrilla. |

La exportacion usa `xlsx-js-style`, filtra en memoria sobre `listMantenimientoLiquidaciones()` y arma hojas adicionales por cuadrilla con despachos desde `movimientos_inventario`.

Riesgos:

- `listMantenimientoLiquidaciones` limita a 500 documentos; el export tambien parte de esa lista, por lo que meses con mas de 500 liquidaciones historicas o fuera del corte podrian quedar incompletos.
- Faltan indices documentados para `mantenimiento_liquidaciones.orderBy(audit.createdAt)` y queries por `ticketNumeroNorm`/`ticketNumero` si crece el volumen.
- Los errores de dominio se traducen mayormente a 500 salvo algunos casos; conviene mapear errores esperados a 400/409.

## UI Y Navegacion

Pantallas:

- `/home/mantenimiento/liquidaciones`
- `/home/mantenimiento/liquidaciones/new`
- `/home/mantenimiento/liquidaciones/[id]`

Las paginas server usan `requireArea("MANTENIMIENTO")`. `buildHomeNav` agrega `Mantenimiento: Liquidaciones` cuando la sesion tiene area `MANTENIMIENTO`.

Clientes:

- `MantenimientoLiquidacionesListClient.tsx`: lista, filtros, export, borrado, gestion de causas raiz.
- `MantenimientoLiquidacionFormClient.tsx`: alta/edicion, carga de cuadrillas/materiales/causas, stock de cuadrilla, preview de visita, liquidar y corregir.

Riesgo: la navegacion y los guards estan alineados por area, pero no hay separacion de permisos para operaciones destructivas o de inventario.

## Causas Raiz

`mantenimientoCausasRaiz/repo.ts` administra `mantenimiento_causas_raiz`:

- crea id normalizado desde nombre.
- lista hasta 300 por nombre.
- no permite renombrar o borrar una causa si ya existe una liquidacion que usa ese nombre.
- `deleteMantenimientoCausaRaiz` borra fisicamente el documento.

Riesgo: se valida uso por nombre, no por id. Cambios historicos de nombre o diferencias de espacios/mayusculas pueden dejar usos no detectados.

## Stock De Cuadrillas

Las rutas `stock-materiales` y `stock-materiales-history`:

- requieren sesion y, si no es admin, algun permiso entre `MATERIALES_VIEW`, `MATERIALES_TRANSFER_SERVICIO`, `MATERIALES_DEVOLUCION`, ademas del area `MANTENIMIENTO`.
- leen `cuadrillas/{id}/stock`.
- enriquecen materiales desde `materiales`.
- consultan ultimos despachos en `movimientos_inventario`.

Esto conecta con el pendiente de Firestore rules: hay UI que tambien escucha `cuadrillas/{id}/stock` desde cliente en transferencias, pero estas rutas de mantenimiento lo hacen server-side con Admin SDK.

## Integracion Telegram

`/api/integrations/telegram/mantenimiento/create-ticket` crea liquidaciones desde ingresos normalizados:

- autoriza por sesion con area `MANTENIMIENTO` o por token secreto de Telegram.
- exige `ingresoId`.
- lee ingreso desde `telegram_mantenimiento_ingresos`.
- solo crea si `status === "READY_FOR_CREATE"` y no tiene `createTicket.createdId`.
- llama `createMantenimientoLiquidacion(payload, "system:telegram")`.
- marca resultado `CREATED` o `CREATE_FAILED`.

Riesgo: el route tiene tratamiento especial para error `TICKET_DUPLICADO`, pero el repo actual permite multiples visitas para el mismo ticket y no lanza ese error.

## Colecciones

- `mantenimiento_liquidaciones`
- `mantenimiento_causas_raiz`
- `cuadrillas`
- `cuadrillas/{id}/stock`
- `materiales`
- `movimientos_inventario`
- `usuarios`
- `telegram_mantenimiento_ingresos`

## Incidente 2026-07: perdida de liquidaciones Mayo/Junio (cuadrilla Norte Tarde)

Se detecto que los documentos de `mantenimiento_liquidaciones` de mayo y junio para `MANTENIMIENTO_NORTE_TARDE` habian desaparecido de Firestore, aunque el Excel exportado (`mantenimiento_liquidaciones_2026-05.xlsx`) si los tenia.

Investigacion (solo lectura, sin gcloud/Firebase Console con Data Access logs activos en ese momento):

- El endpoint `/delete` de la app solo dejo **1** registro `ELIMINACION_LIQUIDACION_MANTENIMIENTO` en toda su historia, de otra cuadrilla y otro ticket (22 de junio). Ningun ticket de Norte Tarde tiene ese registro.
- Cruce de los 33 tickets de la hoja "MANTENIMIENTO NORTE TARDE" del Excel de mayo contra `movimientos_inventario`: 29 de 33 tenian `LIQUIDACION_MANTENIMIENTO` confirmado (creado 27-28 mayo), sin ningun `ELIMINACION_...` asociado.
- Logs de Cloud Run (`ssrredes5bb81`), IAM del proyecto y Cloud Audit Logs no mostraron actividad del endpoint de borrado para esos tickets dentro de la ventana de retencion disponible.
- El Data Access audit log de Firestore **nunca habia estado activado** antes de este incidente, por lo que no existe rastro a nivel de Firestore de quien ejecuto el borrado.
- Se descartaron como causa los scripts `renombrar-materiales-ids.js` (solo hace patch, no borra top-level) y `limpiar-cuadrillas.js` (solo borra subcolecciones de `cuadrillas`), asi como la extension `firestore-bigquery-export` (solo vigila la coleccion de ordenes, no `mantenimiento_liquidaciones`).

Conclusion: el borrado se hizo por fuera del codigo de la app (consola de Firestore o script ad-hoc con Admin SDK), no via el endpoint `/delete`. No se pudo determinar el actor con certeza forense porque no existia Data Access audit log activo.

### Medidas aplicadas (2026-07-08)

- `deleteMantenimientoLiquidacion` pasa de hard-delete a soft-delete (`ANULADO` + `auditoria`, ver seccion "Eliminar" arriba).
- Data Access audit logs activados a nivel de proyecto GCP: `auditConfigs` con `service: datastore.googleapis.com`, `logType: DATA_WRITE` (cubre Firestore; se dejo fuera `DATA_READ` para no disparar volumen/costo de logging en un app con trafico constante de lecturas).
- `deleteProtectionState: DELETE_PROTECTION_ENABLED` en la base de datos Firestore `(default)`.
- Nota de la documentacion oficial de Google: bulk-delete, imports y operaciones TTL **no quedan** en el Data Access audit log, solo los `Commit`/`Delete` individuales via SDK. El audit log activado no cubre un borrado masivo hecho por la herramienta de bulk-delete de Firestore.

### Pendiente de este incidente

- Restringir `/delete` a rol ADMIN o validar que la cuadrilla del documento coincide con la del usuario (hoy cualquier sesion con area `MANTENIMIENTO` puede anular liquidaciones de cualquier cuadrilla).
- Rotar o restringir el acceso a la clave de servicio Admin SDK (`redes-5bb81-firebase-adminsdk-fbsvc-*.json`), que hoy vive en texto plano fuera del control de versiones.
- Aplicar el mismo patron de soft-delete a `mantenimientoCausasRaiz/repo.ts` (`deleteMantenimientoCausaRaiz` sigue con borrado fisico).

## Pendientes

- Definir permisos granulares para crear, liquidar, corregir, borrar y exportar liquidaciones; hoy basta area `MANTENIMIENTO`.
- Revisar concurrencia de `ticketVisita` para tickets repetidos.
- Validar correccion cuando cambia `cuadrillaId`: devolucion a cuadrilla original vs delta en cuadrilla nueva.
- Confirmar si export XLSX debe superar el limite de 500 documentos y filtrar por mes en query.
- Revisar indices Firestore para listados por fecha, tickets y movimientos de inventario por area/tipo/destino.
- Mapear errores de dominio esperados a HTTP 400/403/409 en vez de 500 generico.
- Alinear `TICKET_DUPLICADO` en route Telegram con el comportamiento real de visitas multiples.
- Revisar textos mojibake en mensajes/historial antes de documentos de negocio o export final.
