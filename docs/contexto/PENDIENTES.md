# Pendientes de Contexto - REDES

Actualizado: 2026-06-21.

Siguiente unidad recomendada: **Dominio critico: transferencias/instalaciones**.

## Backlog Inicial

| Prioridad | Estado | Tipo | Fuente | Motivo | Accion |
| --- | --- | --- | --- | --- | --- |
| Alta | Revisar | API mobile + Network/API Android | `C:\Proyectos\REDES\apps\web\src\app\api\mobile` + `C:\Proyectos\REDES-MOBILE\app\src\main\java\com\redes\app\network` | Contrato directo entre backend mobile y cliente Android; rutas y DTOs quedaron documentados | Validar inconsistencias detectadas: inicio-jornada supervisor, ruta compartida coordinador/cuadrillas-mapa, errores 404 historicos y mapeo de roles a status |
| Alta | Revisar | Arquitectura web | `C:\Proyectos\REDES\apps\web` | App Next.js central con rutas protegidas, admin, home y API routes | Rutas protegidas documentadas; falta profundizar API routes no mobile y acciones por dominio |
| Alta | Revisar | Auth/RBAC mobile | `C:\Proyectos\REDES\apps\web\src\core\auth`, `apps\web\src\core\rbac`, rutas `/api/mobile/bootstrap` y `/api/mobile/me` | Define bootstrap mobile, contexto de acceso, roles efectivos y permisos consumidos por Android | Validar defaultRole mobile, 401/403, cache de access context y uso real de permisos |
| Alta | Revisar | Cruce de garantias | `apps\web\src\app\api\ordenes\garantias\cruce`, `apps\web\src\core\garantias\cruceProveedor.ts`, `firebase\functions\src\garantiasCruceSync.ts` | Nuevo flujo de comparacion WIN/REDES con Firestore, Power BI y sync BigQuery | Validar permisos por rol, preview con datos sensibles, carrera import/sync, reglas Firestore y tolerancia a fallas parciales en BigQuery |
| Alta | Revisar | Firebase | `C:\Proyectos\REDES\firebase` | Firestore rules, indexes y functions son frontera de seguridad e integracion | Rules/indexes, `garantiasCruceSync`, Telegram, tramos, `usersCreate` y `bootstrapAdmin` documentados; `app_config` y lectura de `alertas_app` ya tienen regla explicita en fuente; quedan decisiones de seguridad/operacion |
| Alta | Revisar | Dominio web | `C:\Proyectos\REDES\apps\web\src\domain` | Contiene repositorios/esquemas por areas de negocio | Mapa general documentado; falta deep dive por dominio critico |
| Alta | Revisar | Mantenimiento liquidaciones | `apps\web\src\domain\mantenimientoLiquidaciones`, `apps\web\src\app\api\mantenimiento\liquidaciones`, `/home/mantenimiento/liquidaciones` | Flujo critico de tickets de mantenimiento, consumo/devolucion de stock y export XLSX | Validar permisos granulares, borrado fisico, concurrencia de visitas, correccion con cambio de cuadrilla, limite 500 en export e indices |
| Media | Revisar | Integracion Winbo | `C:\Proyectos\REDES\apps\web\src\lib\winbo` | Integracion externa con tests y sync visibles | Validar secrets/envs, lock/reentradas, rango maximo, retries y derivacion de `tipoOrden` |
| Media | Revisar | Cloud Run | `C:\Proyectos\REDES\cloudrun\acta-engine` | Servicio externo para extraccion de actas usado por flujos de actas | Validar token en produccion, modo de activacion, timeout, limites de request y smoke test |
| Media | Revisar | Scripts operativos | `C:\Proyectos\REDES\scripts` | Migraciones, backfills y SQL BigQuery con impacto en datos | SQL/backfills de garantias documentados; falta agrupar resto de scripts |
| Media | Pendiente | Rutas web protegidas | `C:\Proyectos\REDES\apps\web\src\app\(protected)` | Muchas pantallas por rol/area | Documentar rutas por modulo sin bajar aun a componentes menores |
| Baja | Revisar | UI compartida | `C:\Proyectos\REDES\apps\web\src\ui` | Componentes de layout, presencia, notificaciones y navegacion | Validar alcance/despliegue de regla `alertas_app`, limpiar logs/mojibake y definir offline por timeout |
| Baja | Revisar | Tipos compartidos | `C:\Proyectos\REDES\apps\web\src\types` | Tipos de auth, permisos y usuarios | Definir fuente canonica, resolver duplicaciones y conectar invalidacion de access context |

## Nuevos Pendientes Detectados En Fase 0

- API mobile tiene prioridad por ser dependencia directa de REDES-MOBILE.
- Firebase Functions incluye areas visibles: `bootstrapAdmin`, `usersCreate`, `tramoAlertas`, `winboScheduler`, `garantiasCruceSync` y Telegram.
- Scripts recientes de BigQuery/backfill requieren contexto antes de automatizar o programar cambios de datos.
- Cloud Run `acta-engine` ya tiene README operativo, pero falta relacionarlo con rutas web consumidoras.

## Pendientes Detectados En Revision Incremental 2026-06-14

- Documentar rutas `apps\web\src\app\api\ordenes\garantias\cruce\import\route.ts` y `preview\route.ts`.
- Documentar SQL/backfills nuevos de garantias antes de automatizar cambios de datos.
- Revisar reglas Firestore para `garantias_cruce_imports` y `garantias_cruce_periods`.
- Validar si `GERENCIA` y `SUPERVISOR` deben ver cruce de garantias por rol directo sin permiso explicito.
- Revisar estrategia delete+insert de `garantiasCruceSync` ante fallas parciales de BigQuery.
- Registrar como sensible/no indexable el archivo `BBDD_M&D_01-06-2026.xlsx`; no fue abierto.

## Pendientes Detectados En Revision Incremental 2026-06-15

- Validar con negocio que el KPI `redesGarTotal` debe deduplicar por `codigoCliente` y contar GAR `Finalizada` + `Cancelada`, mientras `redesGarOrdenes` conserva ordenes.
- Revisar el cambio de denominador de instalaciones finalizadas: ahora solo cuenta `tipoTraba` en `INSTALACION`, `INSTALACION POSIBLE FRAUDE`, `WINBOX EN COMODATO`, `MESH + WINBOX EN COMODATO` y `PAGO ADELANTADO`.
- Documentar en unidad propia `scripts\bigquery_garantias_cruce_setup.sql`, `scripts\bigquery_garantias_dashboard.sql`, `scripts\bigquery_update_vw_instalacion_garantia.sql` y backfills asociados.
- Comparar `scripts\backfill_garantias_cruce_bq.ts` contra `firebase\functions\backfill_garantias_cruce_bq.ts` antes de recomendar ejecucion operativa.
- Mantener como pendiente sensible/no indexable `BBDD_M&D_01-06-2026.xlsx`; no fue abierto.

## Pendientes Detectados En Deep Dive Firebase Functions Restantes

- Validar si `TELEGRAM_ALLOWED_USER_IDS` debe bloquear tambien plantillas normales, no solo comandos/callbacks.
- Revisar colisiones operativas de `telegram_preliquidacion_retries/{pedido}` cuando haya multiples chats o dias para el mismo pedido.
- Confirmar si la ventana de `telegram_found_guards` de 2 horas cubre duplicados reales de preliquidacion.
- Revisar escape Markdown en mensajes Telegram con datos de usuario/orden.
- Separar el webhook Telegram en modulos antes de cambios funcionales grandes.
- Validar costo, latencia y tratamiento de datos del fallback OpenAI para preliquidacion.
- Revisar indices Firestore necesarios para queries de Telegram y tramo alertas.
- Unificar helpers de auth entre `lib/security.ts` y `utils/authz.ts`, o documentar por que `usersCreate` no usa revocation check.
- Comparar `UsersCreateSchema` contra el schema web de usuarios para evitar contratos divergentes.
- Confirmar que `ENABLE_ADMIN_BOOTSTRAP` solo se habilite temporalmente y no quede activo en produccion.
- Validar que `WEB_APP_BASE_URL` y `CRON_TOKEN` de tramo alertas coincidan entre Functions y web.
- Evaluar si las functions de tramo deben enviar el tramo esperado al endpoint, para evitar depender solo de la hora Lima actual.

## Pendientes Detectados En Deep Dive Mantenimiento Liquidaciones

- Definir permisos granulares para crear, liquidar, corregir, borrar y exportar liquidaciones; hoy basta area `MANTENIMIENTO`.
- Cambiar borrado fisico de liquidaciones y causas raiz por anulacion/inactivacion si se mantiene la regla operativa del proyecto.
- Revisar concurrencia de `ticketVisita` para tickets repetidos: se calcula fuera de transaccion.
- Validar correccion cuando cambia `cuadrillaId`: posible delta aplicado a cuadrilla nueva sin devolver stock a la cuadrilla original.
- Confirmar si export XLSX debe superar el limite de 500 documentos y filtrar por mes en query.
- Revisar indices Firestore para `mantenimiento_liquidaciones` por fecha/ticket y `movimientos_inventario` por area/tipo/destino.
- Mapear errores de dominio esperados a HTTP 400/403/409 en vez de 500 generico.
- Alinear `TICKET_DUPLICADO` en route Telegram con el comportamiento real de visitas multiples.
- Revisar textos mojibake en movimientos/export antes de documentos de negocio.

## Pendientes Detectados En Deep Dive Firebase Functions + BigQuery Garantias

- `garantiasCruceSync` y `backfill_garantias_cruce_bq.ts` usan delete+insert por periodo; decidir mitigacion ante fallas parciales.
- `garantiasCruceSync` escucha el documento padre `garantias_cruce_periods/{instYm}`; validar si cambios solo en subcoleccion `rows` deben disparar resync.
- Proyectos/datasets/tablas BigQuery estan hardcodeados en function y backfills.
- Backfill de garantias no permite limitar por periodo; procesa todos los periodos.
- Backfills de garantias en `scripts\` y `firebase\functions\` son duplicados identicos; decidir fuente canonica.
- Backfills de instalaciones de abril difieren entre variantes y no incluyen los tipos nuevos del denominador (`WINBOX EN COMODATO`, `MESH + WINBOX EN COMODATO`, `PAGO ADELANTADO`).
- `bigquery_garantias_dashboard.sql` puede recrear `vw_pbi_instalacion_garantia` con denominador antiguo si se ejecuta despues del script actualizado.
- La vista SQL `vw_pbi_cruce_garantias` no modela `PROVEEDOR_REDES_PENDIENTE`; la API web si.
- Colecciones `garantias_cruce_*` no tienen reglas Firestore explicitas; cliente directo queda denegado por default y servidor/Admin SDK concentra acceso.

## Pendientes Detectados En Deep Dive Import/Preview Garantias

- Confirmar si `POST /preview` debe exigir permiso de edicion, porque devuelve muestras con nombres y codigos de clientes.
- `GERENCIA` y `SUPERVISOR` pueden importar por rol directo; validar si debe pasar solo por permiso explicito `ORDENES_GARANTIAS_EDIT`.
- `saveProviderImport` actualiza el doc padre `garantias_cruce_periods/{instYm}` antes de insertar rows; como `garantiasCruceSync` se dispara por el padre, revisar posible carrera de BigQuery.
- El import puede reemplazar varios periodos si el workbook trae varios meses; evaluar advertencia o seleccion explicita.
- El parser cae a segunda/primera hoja si no encuentra `Garantia`; validar si conviene exigir hoja exacta.

## Revision Incremental 2026-06-21 - Firebase Rules

- `firestore.rules` ahora declara `app_config/{docId}` con `allow get: if true`; esto cubre el force update Android antes de login.
- `firestore.rules` ahora declara `alertas_app/{id}` con `allow get, list: if signedIn()` y escrituras cliente denegadas; el listener web autenticado ya no queda bloqueado por default deny en fuente.
- No se verifico deploy de reglas ni emulador; validar que reglas publicadas coincidan con el archivo fuente.

## Pendientes Detectados En Deep Dive Firebase Rules/Indexes

- `StockCuadrillasMantClient.tsx` escucha `cuadrillas/{id}/stock` desde cliente, pero `firestore.rules` no permite `cuadrillas` ni subcoleccion `stock`.
- Decidir si el realtime directo de `cuadrillas/{id}/stock` debe tener regla explicita o migrarse a API/polling.
- `notificaciones_reads` autoriza por prefijo del document id; evaluar validar tambien `uid`/`notifId` en payload.
- Solo hay un indice compuesto versionado, para `notificaciones`; revisar indices compuestos de queries server/API criticas.
- Mantener politica default deny para colecciones operativas nuevas y documentar excepciones cliente.

## Pendientes Detectados En Deep Dive Rutas Web Protegidas

- Revisar 9 paginas sin guard propio no-alias bajo `home`: cuadrillas gestion, tecnicos gestion, instalaciones actas/asignacion/asistencia/detalle/materiales.
- Definir guard minimo para paginas de gestion/asistencia: area `INSTALACIONES`, rol `GESTOR` o permisos explicitos.
- Revisar si `requirePermission` debe redirigir a `/home` en rutas home en vez de `/admin`.
- Alinear `buildHomeNav` con guards reales para evitar rutas visibles sin permiso o rutas accesibles por URL directa.
- Validar server actions/API de paginas con guard laxo antes de marcarlas como seguras.

## Pendientes Detectados En Deep Dive Domain Services

- Profundizar por dominio critico antes de cambios: `transferencias/instalaciones`, `cuadrillas` y `ordenes`.
- Revisar si `equipos/service.ts` debe eliminarse o completarse; actualmente solo hace `export {}`.
- Decidir si listeners cliente como `alertas-app/repo.ts` deben vivir en `domain` o moverse a una capa cliente.
- Crear matriz coleccion -> dominio -> rules/indexes para conectar con Firebase rules.
- Validar duplicacion de reglas de negocio entre repos, server actions y API routes.
- Revisar cache local de cuadrilla en `ordenes/repo.ts` y su tolerancia a cambios de cuadrilla durante runtime.

## Pendientes Detectados En Deep Dive Cloud Run acta-engine

- Confirmar que produccion tiene `ENGINE_TOKEN` no vacio y que `ACTA_ENGINE_BEARER` coincide.
- Decidir si basta configurar `ACTA_ENGINE_URL` para activar modo `active`, o si debe exigirse `ACTA_ENGINE_MODE=active` explicito.
- Agregar limite de tamano/paginas o validacion temprana en `POST /extract`.
- Revisar `gunicorn --timeout 0` y definir timeout operativo.
- Crear smoke test controlado para `/health` y `/extract` con PDF sintetico/no sensible.
- Decidir si `cloudrun/acta-engine/__pycache__` debe eliminarse e ignorarse.
- Documentar rollback operativo: `ACTA_ENGINE_MODE=off` o retirar `ACTA_ENGINE_URL` y redeploy de web.

## Pendientes Detectados En Deep Dive UI Compartida, Notificaciones Y Presencia

- Validar en entorno desplegado que la regla nueva de `alertas_app` cubre el listener cliente esperado sin abrir escritura directa.
- Definir y probar reglas Firestore para `notificaciones_tecnico` si Android debe leer items por cuadrilla y marcar `leido=true` directo.
- Decidir si `AlertasAppBell` debe filtrar por `rolesDestino` o si basta con montar solo para roles permitidos.
- Retirar o condicionar logs de debug en notificaciones antes de produccion.
- Revisar mojibake/textos corruptos en `AlertasAppBell`, `alertas-app/repo.ts`, `OrdenesImportTicker` y rutas relacionadas.
- Evaluar invalidacion o refresh de `UserProvider` ante cambios de perfil/roles.
- Documentar criterio de offline por timeout para `usuarios_presencia`.
- Medir costo/latencia del patron `notificaciones` + N lecturas de `notificaciones_reads`.
- Confirmar si `notificaciones_tecnico` pertenece a unidad mobile/ordenes o debe integrarse al mapa global de notificaciones.

## Pendientes Detectados En Cruce Tecnico Mobile Alertas/Cierre 2026-06-18

- Confirmar si la API web `POST /api/alertas-app/{id}/responder` debe crear notificacion tambien para rechazos de `CERRAR_RUTA` o `REQUIERE_ATENCION`.
- Validar si Android debe leer `alertas_app` directamente por cuadrilla; la regla actual habilita lectura autenticada general. Definir ademas reglas para que `notificaciones_tecnico` solo pueda leerse/marcarse por la cuadrilla correspondiente.
- Decidir si aceptar cierre en web debe disparar algun mecanismo adicional para sincronizar estado mobile o basta con listener de `alertas_app`.
- Revisar si el modelo de cierre aprobable debe impedir que Android detenga tracking antes de que la alerta exista.

## Pendientes Detectados En Deep Dive Integracion Winbo

- Ejecutar tests locales del parser/mapper en una unidad de validacion controlada.
- Revisar mojibake en `client.ts`, `sync.ts` y `ordenes/repo.ts`.
- Confirmar que secrets/envs de WinBo y cron estan configurados en produccion y no aparecen en logs.
- Definir limite maximo de rango para import manual.
- Revisar si el lock debe bloquear tambien reentradas del mismo owner mientras este vigente.
- Evaluar si TTL 20 minutos cubre el peor caso real de WinBo/export/upsert.
- Validar si `WINBO_EXPORT_MAX_RETRIES` default 3 es suficiente para exports grandes.
- Confirmar si `downloadUrl` debe guardarse/devolverse completo o solo `nombreArchivo`.
- Validar con negocio la derivacion de `tipoOrden` desde `tipo`.
- Revisar indices/queries asociados a `ordenes_import_runs` y `system_locks` si se consultan en UI/reportes.

## Pendientes Detectados En Deep Dive Tipos Compartidos Y Contratos Usuario/Permisos

- Definir fuente canonica formal para `Permission`, `RoleDoc`, `UsuarioPerfil`, `AccessContext` y `ServerSession`.
- Revisar `types/permissions.ts` y decidir si el campo `permissions: string[]` es error/herencia.
- Resolver duplicacion `permisos` vs `permissions` en `RoleCreateSchema`.
- Documentar en comentarios o tipos la diferencia `session.access.permissions` vs `session.permissions`.
- Conectar `invalidateUserAccessContext` en acciones que cambian `usuarios_access` o roles/permisos.
- Validar si `ACTIVO` historico en `estadoAcceso` debe migrarse a `HABILITADO`.
- Separar prioridad de rol mobile de prioridad web o documentar decision.
- Revisar mojibake en schemas/menus/repos.
- Revisar consumidores de `lib/rbac.ts` antes de marcarlo como vigente o legado.

## Pendientes Detectados En Deep Dive API Mobile

- Revisar si `RemoteSupervisorRepository.iniciarJornada` debe existir: llama `/api/mobile/inicio-jornada`, pero el backend valida contexto tecnico.
- Decidir si conviene crear/renombrar endpoint para `COORDINADOR_CUADRILLAS_MAPA`, actualmente apuntando a `/api/mobile/tecnico/cuadrillas-mapa`.
- Normalizar errores de rol de helpers mobile para devolver 403 en vez de 500 cuando aplique.
- Actualizar mensajes Android de 404 que indican que endpoints existentes "aun no existen".
- `getUserAccessContextCached`, RBAC y permisos efectivos mobile ya fueron documentados el 2026-06-14; quedan en `Revisar` por las decisiones listadas abajo.

## Pendientes Detectados En Deep Dive Auth/RBAC Mobile

- Definir si `getDefaultRoleForRoles` debe tener variante mobile; la prioridad actual puede escoger roles web sin shell Android.
- Decidir si `getMobileAuthContext` debe distinguir token invalido, usuario sin `usuarios_access` y `estadoAcceso` inhabilitado.
- Normalizar errores de rol de helpers mobile para devolver 403 cuando aplique, no 500 generico.
- Confirmar si `/api/mobile/me` sigue vigente o debe documentarse como legado/fallback.
- Evaluar invalidacion explicita de `accessContext.cached` cuando cambien roles/permisos mobile.
- Revisar si backend debe devolver o validar metadata de version minima en bootstrap para reforzar force update; deep dive Android 2026-06-18 confirma que hoy depende solo de Firestore cliente `app_config/android`, cuya lectura ya esta permitida en fuente.
- Alinear permisos efectivos con UI mobile si se espera control fino por permisos.

## Pendientes Detectados En Deep Dive Cierre De Cuadrillas Winbo 2026-07-05

- Confirmar si `WINBO_USERNAME` (cuenta usada por `createWinboSession()` para el cierre) es la misma cuenta manual del usuario o una cuenta de sistema separada, y si tiene el mismo alcance de sectores operativos/cuadrillas visibles.
- Verificar manualmente en WinBo si la cuadrilla `K 37` existe; la grilla completa revisada solo llega hasta K28, por lo que puede no ser un bug de matching sino una cuadrilla inexistente.
- Ver detalle completo de hipotesis descartadas (caracter `&`, cuadrilla inactiva) y pendientes en `web/winbo-cierre-cuadrilla.md`.
- Falta implementar `POST /api/cuadrillas/winbo/cierres/verificar` (verificacion de aprobacion del proveedor), registrar permiso RBAC `CUADRILLAS_CIERRE_WINBO` en Firestore, agregar item en `buildHomeNav`, cierre por lotes y manejo de notificacion de rechazo.

## No Revisado En Profundidad

- Implementacion interna de API routes.
- Reglas Firestore linea por linea.
- Funciones Firebase exportadas en `index.ts`.
- Componentes UI y hooks.
- SQL y scripts de migracion.
- Archivos temporales, binarios, `node_modules`, `.next`, outputs y secretos locales.
