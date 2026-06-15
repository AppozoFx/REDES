# API Mobile REDES

Actualizado: 2026-06-13.

Estado de la unidad: **Revisar**. La lectura cubre `C:\Proyectos\REDES\apps\web\src\app\api\mobile`, helpers directos en `C:\Proyectos\REDES\apps\web\src\core\auth` y consumidores Android en `C:\Proyectos\REDES-MOBILE\app\src\main\java\com\redes\app\network` y repositorios remotos directos.

## Alcance Leido

Backend:

- Rutas: `C:\Proyectos\REDES\apps\web\src\app\api\mobile\**\route.ts`.
- Auth y bootstrap: `C:\Proyectos\REDES\apps\web\src\core\auth\mobile.ts`, `mobileBootstrap.ts`.
- Contextos por rol: `mobileTecnico.ts`, `mobileSupervisor.ts`, `mobileCoordinador.ts`.
- Firebase Admin indirecto: `C:\Proyectos\REDES\apps\web\src\lib\firebase\admin`.

Android relacionado:

- Network: `C:\Proyectos\REDES-MOBILE\app\src\main\java\com\redes\app\network`.
- Repositorios directos: `data/session`, `data/tecnico`, `data/supervisor`, `data/coordinador`, `data/tracking`, `data/presence`, `data/alertas`.
- DTO/modelos directos: `network/dto`, `data/tecnico/*Models.kt`, `data/supervisor/*Models.kt`, `data/coordinador/*Models.kt`.

## Auth Mobile

Todas las rutas mobile revisadas usan `getMobileAuthContext(req)` o un helper que lo llama. El contrato base es:

- Header requerido: `Authorization: Bearer <Firebase ID token>`.
- Verificacion backend: `adminAuth().verifyIdToken(token, true)` en `C:\Proyectos\REDES\apps\web\src\core\auth\mobile.ts`.
- Acceso requerido: `getUserAccessContextCached(uid)` debe existir y `estadoAcceso` debe ser `HABILITADO`.
- Errores comunes: sin token o usuario no habilitado devuelve `401 UNAUTHENTICATED` en la mayoria de handlers; errores `auth/*` se traducen a `401` en `me`, `bootstrap`, `presencia` y `comunicados/[id]/seen`.
- El header Android `X-Mobile-Role` se envia desde `RedesApiClient`, pero el backend leido no lo usa para autorizar; la autorizacion real sale de roles en el contexto de acceso.

Roles directos:

- Tecnico: `getTecnicoContext` exige rol `TECNICO` o `ADMIN` y una cuadrilla con `tecnicosUids array-contains uid`; si no existe lanza `TECNICO_WITHOUT_CUADRILLA`.
- Supervisor: `getSupervisorContext` exige rol `SUPERVISOR` o `ADMIN`; valida config de supervisor y `SUPERVISOR_DISABLED`.
- Coordinador: `getCoordinadorContext` exige rol `COORDINADOR` o `ADMIN`; lista cuadrillas `HABILITADO` con `coordinadorUid == uid`.

## Contrato Endpoint Por Endpoint

| Endpoint | Metodo | Fuente backend | Input | Respuesta OK | Auth/permisos | Consumidor Android |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/mobile/bootstrap` | GET | `apps\web\src\app\api\mobile\bootstrap\route.ts` | Bearer token | `{ ok, session, comunicados, requiresComunicadosGate, roleSelectionRequired, defaultRole }` | Usuario mobile habilitado | `RemoteSessionRepository.fetchBootstrap` -> `RedesApiClient.fetchBootstrap` -> `MobileBootstrapDto` |
| `/api/mobile/me` | GET | `apps\web\src\app\api\mobile\me\route.ts` | Bearer token | `{ ok, uid, email, nombre, nombreCorto, roles, areas, permissions, estadoAcceso }` | Usuario mobile habilitado | Metodo `RedesApiClient.fetchCurrentSession`; no se encontro repositorio directo que lo use |
| `/api/mobile/comunicados/{id}/seen` | POST | `apps\web\src\app\api\mobile\comunicados\[id]\seen\route.ts` | Path `id` | `{ ok: true }` | Usuario mobile habilitado | `RemoteSessionRepository.markComunicadoSeen` |
| `/api/mobile/presencia` | POST | `apps\web\src\app\api\mobile\presencia\route.ts` | Sin body relevante | Marca `usuarios_presencia/{uid}` online | Usuario mobile habilitado | `BackendPresenceRepository.markOnline` |
| `/api/mobile/presencia` | DELETE | `apps\web\src\app\api\mobile\presencia\route.ts` | Sin body | Marca offline; si no hay auth responde OK | Best effort | `BackendPresenceRepository.markOffline` |
| `/api/mobile/tracking` | POST | `apps\web\src\app\api\mobile\tracking\route.ts` | JSON `{ lat, lng, accuracy?, speed? }` | `{ ok: true }` | Rol `TECNICO`, `SUPERVISOR` o `ADMIN`; tecnico requiere cuadrilla | `LocationTrackingService` -> `TrackingRepository.postLocation` -> `RedesApiClient.postTracking` |
| `/api/mobile/inicio-jornada` | POST | `apps\web\src\app\api\mobile\inicio-jornada\route.ts` | Sin body relevante | `{ ok, estadoRuta }` | `getTecnicoContext`: `TECNICO` o `ADMIN` con cuadrilla | `RemoteTecnicoRepository.iniciarJornada`; tambien declarado en `RemoteSupervisorRepository.iniciarJornada` pero backend no acepta supervisor |
| `/api/mobile/alertas-app` | POST | `apps\web\src\app\api\mobile\alertas-app\route.ts` | JSON `{ tipo }`, tipo `CERRAR_RUTA` o `REQUIERE_ATENCION` | `{ ok, alertaId }`; reutiliza alerta pendiente duplicada | Tecnico via `getTecnicoContext` | `RemoteAlertaRepository.postAlertaCerrarRuta`, `postRequiereAtencion` |
| `/api/mobile/tecnico/home` | GET | `apps\web\src\app\api\mobile\tecnico\home\route.ts` | Bearer token | `{ ok, cuadrilla, tecnico, fecha, kpis, equipmentSummary, cableado, plantillasPendientes }` | Tecnico/admin con cuadrilla | `RemoteTecnicoRepository.fetchHome` -> `TecnicoDtos.toTecnicoHomeData` |
| `/api/mobile/tecnico/ordenes?ymd=` | GET | `apps\web\src\app\api\mobile\tecnico\ordenes\route.ts` | Query `ymd`, default hoy Lima | `{ ok, ymd, cuadrilla, updateInfo, items }` | Tecnico/admin con cuadrilla | `RemoteTecnicoRepository.fetchOrders` -> `TecnicoOrdersData` |
| `/api/mobile/tecnico/ordenes/{id}` | GET | `apps\web\src\app\api\mobile\tecnico\ordenes\[id]\route.ts` | Path `id` | `{ ok, cuadrilla, item }` | Tecnico/admin; orden debe pertenecer a cuadrilla | `RemoteTecnicoRepository.fetchOrderDetail` |
| `/api/mobile/tecnico/stock` | GET | `apps\web\src\app\api\mobile\tecnico\stock\route.ts` | Bearer token | `{ ok, cuadrilla, equipos, materiales, bobinas }` | Tecnico/admin con cuadrilla | `RemoteTecnicoRepository.fetchStock` |
| `/api/mobile/tecnico/stock` | POST | `apps\web\src\app\api\mobile\tecnico\stock\route.ts` | FormData `sn`, `file`; Android tambien envia `cuadrillaId` y `marcarSustentado` pero backend no los usa | `{ ok, item }` | Tecnico/admin; sube evidencia a Storage y actualiza `equipos/{SN}.auditoria` | `RemoteTecnicoRepository.sustainStockEquipment` |
| `/api/mobile/tecnico/mapa?ymd=` | GET | `apps\web\src\app\api\mobile\tecnico\mapa\route.ts` | Query `ymd`, default hoy Lima | `{ ok, ymd, cuadrilla, items }` | Tecnico/admin con cuadrilla | `RemoteTecnicoRepository.fetchMap` |
| `/api/mobile/tecnico/cuadrillas-mapa` | GET | `apps\web\src\app\api\mobile\tecnico\cuadrillas-mapa\route.ts` | Sin query | `{ ok, items }` con cuadrillas habilitadas con geo | Roles `TECNICO`, `COORDINADOR` o `ADMIN` | `RemoteTecnicoRepository.fetchCuadrillasMapa` y `RemoteCoordinadorRepository.fetchCuadrillasMapa` |
| `/api/mobile/supervisor/home` | GET | `apps\web\src\app\api\mobile\supervisor\home\route.ts` | Sin query | `{ ok, ymd, supervisor, trackingHabilitado, regionesHoy, cuadrillasHoy, ordenesPorRegion, totales }` | Supervisor/admin habilitado | `RemoteSupervisorRepository.fetchHome` |
| `/api/mobile/supervisor/ordenes?ymd=&garantias=` | GET | `apps\web\src\app\api\mobile\supervisor\ordenes\route.ts` | Query `ymd`, `garantias=true` opcional | `{ ok, ymd, updateInfo, items }` | Supervisor/admin; usa asignaciones del dia | `RemoteSupervisorRepository.fetchOrders` |
| `/api/mobile/supervisor/ordenes/{id}` | GET | `apps\web\src\app\api\mobile\supervisor\ordenes\[id]\route.ts` | Path `id` | `{ ok, item }` | Supervisor/admin; orden debe estar en cuadrillas asignadas | `RemoteSupervisorRepository.fetchOrderDetail` |
| `/api/mobile/supervisor/mapa?ymd=&modo=` | GET | `apps\web\src\app\api\mobile\supervisor\mapa\route.ts` | Query `ymd`; `modo=ORDENES/GARANTIAS/CUADRILLAS` segun backend | `{ ok, ymd, modo, items }` | Supervisor/admin | `RemoteSupervisorRepository.fetchMapa`, envia enum `MIS_ORDENES`, `GARANTIAS` o `CUADRILLAS` |
| `/api/mobile/supervisor/cuadrillas-mapa` | GET | `apps\web\src\app\api\mobile\supervisor\cuadrillas-mapa\route.ts` | Sin query | `{ ok, items }` de cuadrillas instalaciones con geo | Supervisor/admin | `RemoteSupervisorRepository.fetchCuadrillasMapa` |
| `/api/mobile/supervisor/supervision` | POST | `apps\web\src\app\api\mobile\supervisor\supervision\route.ts` | JSON `{ orderId, notas, observaciones }` | `{ ok: true }` | Supervisor/admin; orden en cuadrillas asignadas | `RemoteSupervisorRepository.saveSupervision` |
| `/api/mobile/supervisor/jornada?ymd=` | GET | `apps\web\src\app\api\mobile\supervisor\jornada\route.ts` | Query `ymd`, default hoy Lima | `{ ok, jornada, oficina }` | Supervisor/admin | `RemoteSupervisorRepository.fetchJornada` |
| `/api/mobile/supervisor/jornada` | POST | `apps\web\src\app\api\mobile\supervisor\jornada\route.ts` | JSON `{ tipo, lat?, lng? }`, tipo `INICIO_RUTA`, `FIN_RUTA`, `INICIO_REFRIGERIO`, `FIN_REFRIGERIO` | `{ ok, jornada }` | Supervisor/admin; `INICIO_RUTA` puede requerir geofence de oficina | `RemoteSupervisorRepository.postJornadaEvento` |
| `/api/mobile/supervisor/garantias/update` | POST | `apps\web\src\app\api\mobile\supervisor\garantias\update\route.ts` | JSON `ordenId` y campos garantia | `{ ok, ordenId }` | Supervisor/admin; orden en cuadrillas asignadas | `RemoteSupervisorRepository.updateGarantia` |
| `/api/mobile/coordinador/inicio?ym=` | GET | `apps\web\src\app\api\mobile\coordinador\inicio\route.ts` | Query `ym` `YYYY-MM`, default mes Lima | `{ ok, ym, resumen, cuadrillas }` | Coordinador/admin | `RemoteCoordinadorRepository.fetchResumen` |
| `/api/mobile/coordinador/cuadrillas?ymd=` | GET | `apps\web\src\app\api\mobile\coordinador\cuadrillas\route.ts` | Query `ymd`, default hoy Lima | `{ ok, ymd, updateInfo, cuadrillas }` | Coordinador/admin | `RemoteCoordinadorRepository.fetchCuadrillas` |
| `/api/mobile/coordinador/mapa?ymd=` | GET | `apps\web\src\app\api\mobile\coordinador\mapa\route.ts` | Query `ymd`, default hoy Lima | `{ ok, ymd, items }` | Coordinador/admin | `RemoteCoordinadorRepository.fetchMapa` |
| `/api/mobile/coordinador/stock` | GET | `apps\web\src\app\api\mobile\coordinador\stock\route.ts` | Sin query | `{ ok, cuadrillas }` | Coordinador/admin | `RemoteCoordinadorRepository.fetchStock` |
| `/api/mobile/coordinador/auditoria` | GET | `apps\web\src\app\api\mobile\coordinador\auditoria\route.ts` | Sin query | `{ ok, cuadrillas }` | Coordinador/admin | `RemoteCoordinadorRepository.fetchAuditoria` |
| `/api/mobile/coordinador/auditoria/sustentar` | POST | `apps\web\src\app\api\mobile\coordinador\auditoria\sustentar\route.ts` | FormData `cuadrillaId`, `sn`, `file` | `{ ok, item }` | Coordinador/admin; cuadrilla debe pertenecer al coordinador | `RemoteCoordinadorRepository.sustainEquipo` |
| `/api/mobile/coordinador/predespacho?ymd=` | GET | `apps\web\src\app\api\mobile\coordinador\predespacho\route.ts` | Query `ymd`, default hoy Lima | `{ ok, tienePredespacho, ymd, rows }` | Coordinador/admin | `RemoteCoordinadorRepository.fetchPredespacho` |
| `/api/mobile/coordinador/ventas?year=&month=` | GET | `apps\web\src\app\api\mobile\coordinador\ventas\route.ts` | Query `year`, `month` opcionales | `{ ok, items }` | Coordinador/admin | `RemoteCoordinadorRepository.fetchVentas` |
| `/api/mobile/coordinador/plantillas?ym=` | GET | `apps\web\src\app\api\mobile\coordinador\plantillas\route.ts` | Query `ym` `YYYY-MM` | `{ ok, ym, pendientesByCuadrilla }` o `400 YM_INVALID` | Coordinador/admin | `RemoteCoordinadorRepository.fetchPlantillas` |

## Colecciones Y Efectos Directos

- `usuarios`: perfil mobile para nombres, supervisores/coordinadores/tecnicos.
- `usuarios_presencia`: online/offline desde `/presencia`.
- `cuadrillas`: contexto tecnico, coordinador, tracking de cuadrillas y stock.
- `cuadrillas/{id}/tracking`: historial de ubicacion de tecnicos/admin tratados como cuadrilla.
- `supervisores`: config y tracking de supervisores.
- `supervisores/{uid}/tracking`: historial de ubicacion de supervisores.
- `ordenes`: ordenes tecnico/supervisor/coordinador, supervision y campos de garantia.
- `instalaciones`: detalle tecnico para liquidacion, servicios, materiales y equipos.
- `equipos`: auditoria y sustento de equipos por SN.
- `materiales`: metadatos de stock tecnico.
- `cuadrilla_estado_diario`: estado de ruta tecnico/coordinador.
- `asistencia_supervisores`: jornada supervisor.
- `configuracion_app/supervisor_jornada`: oficina y radio geofence.
- `alertas_app`: solicitudes de cierre de ruta o atencion.
- `notificaciones`: metadata de ultima importacion de ordenes.
- `telegram_preliquidaciones` y `telegram_preliquidacion_retries`: estado de plantillas/preliquidacion.
- `instalaciones_predespacho_rows`: predespacho del coordinador.
- `ventas`: ventas asociadas a coordinador.
- Firebase Storage: evidencias de auditoria en `auditoria/{SN}.{ext}`.

## Validaciones Y Errores Relevantes

- Auth: `UNAUTHENTICATED` con 401 cuando no hay token valido o usuario habilitado.
- Roles: `ROLE_TECNICO_REQUIRED`, `ROLE_SUPERVISOR_REQUIRED`, `ROLE_COORDINADOR_REQUIRED`, `ROLE_REQUIRED`; algunos se devuelven como 500 porque el helper lanza `Error` y el handler no siempre traduce a 403.
- Tecnico sin cuadrilla: `TECNICO_WITHOUT_CUADRILLA`; en `/tracking` se traduce a 404, en otras rutas suele caer como 500.
- Formularios de evidencia: `FILE_REQUIRED`, `SN_REQUIRED`, `CUADRILLA_REQUIRED`.
- Ordenes: `ORDER_NOT_FOUND`, `ORDEN_NOT_FOUND`, `ORDER_NOT_IN_CUADRILLA`, `ORDER_NOT_IN_SUPERVISOR_CUADRILLAS`.
- Jornada supervisor: `TIPO_INVALIDO`, `UBICACION_REQUERIDA`, `FUERA_DE_RADIO`, `REFRIGERIO_YA_REGISTRADO`, `REFRIGERIO_NO_INICIADO`, `REFRIGERIO_YA_FINALIZADO`.
- Coordinador plantillas: `YM_INVALID`.
- Alertas app: `TIPO_REQUIRED`, `TIPO_INVALIDO`.

## Inconsistencias Para Revisar

1. `RemoteSupervisorRepository.iniciarJornada` llama `RedesApiClient.postInicioJornada`, que usa `/api/mobile/inicio-jornada`; ese backend exige `getTecnicoContext`, no supervisor. No se encontro uso UI directo salvo tecnico, pero el metodo queda expuesto en `SupervisorRepository`.
2. Android declara `COORDINADOR_CUADRILLAS_MAPA = "/api/mobile/tecnico/cuadrillas-mapa"` en `MobileEndpoints.kt`. El backend permite rol coordinador en esa ruta, por lo que funciona, pero el nombre puede confundir: no existe `/api/mobile/coordinador/cuadrillas-mapa`.
3. `RedesApiClient.fetchCurrentSession` consume `/api/mobile/me`, pero el flujo principal de sesion usa `/api/mobile/bootstrap`; no se encontro repositorio directo que invoque `fetchCurrentSession`.
4. `RedesApiClient.buildErrorMessage` todavia dice que algunos endpoints "aun no existen" para 404, aunque ya existen. Si un 404 real ocurre, el mensaje de usuario puede ser historico.
5. La mayoria de errores de rol lanzados por helpers llegan como 500 en handlers. Para UX/API estable conviene revisar si deben mapearse a 403.
6. En `local.properties` existe configuracion local de API base URL; se registro solo la existencia. No se debe copiar su valor a documentacion ni logs.

## Pendiente Directo

- Revisar formalmente el flujo `Sesion/bootstrap/auth` y seleccion de rol en REDES-MOBILE, porque esta unidad solo documento el contrato network/backend.
- Revisar permisos/RBAC y `getUserAccessContextCached` en una unidad separada.
- Revisar reglas Firestore para validar que las escrituras directas Android a `alertas_app` listener y `notificaciones_tecnico` update son coherentes con seguridad.

