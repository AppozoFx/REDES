# Firebase Rules, Colecciones e Indexes - REDES

Actualizado: 2026-06-20.

Estado: **Revisar**. Deep dive focalizado en `firebase\firestore.rules`, `firebase\firestore.indexes.json`, configuracion Firebase y usos cliente/servidor observados. No se ejecuto deploy, emulador ni query contra datos reales.

## Alcance

Fuentes leidas:

- `firebase\firebase.json`
- `firebase\firestore.rules`
- `firebase\firestore.indexes.json`
- `apps\web\src\lib\firebase\client.ts`
- `apps\web\src\lib\firebaseClient.ts`
- `apps\web\src\lib\useAccess.ts`
- `apps\web\src\domain\notificaciones\repo.ts`
- `apps\web\src\domain\alertas-app\repo.ts`
- `apps\web\src\app\(protected)\home\transferencias\mantenimiento\stock-cuadrillas\ui\StockCuadrillasMantClient.tsx`
- Lectura por busqueda de usos `collection(...)` en `apps\web\src` y `firebase\functions\src`.

## Configuracion Firebase

`firebase\firebase.json` define:

- Firestore database `(default)`.
- Location `southamerica-west1`.
- Rules `firestore.rules`.
- Indexes `firestore.indexes.json`.
- Emuladores: Auth `9099`, Firestore `8080`, Functions `5001`, UI `4000`.
- Functions codebase `default` con source `functions`.

El `firebase.json` raiz del monorepo solo configura Hosting para `apps/web` con backend frameworks en `us-central1`. La configuracion Firestore/Functions activa para esta unidad esta en `firebase\firebase.json`.

## Reglas Firestore

Funciones auxiliares:

- `signedIn()`: exige `request.auth != null`.
- `accessDoc(uid)`: lee `usuarios_access/{uid}`.
- `isAdmin()`: exige usuario autenticado, `estadoAcceso == "HABILITADO"` y rol `ADMIN`.
- `denyDeletes()`: siempre `false`.

Reglas explicitas:

| Coleccion | Lectura cliente | Escritura cliente | Delete |
| --- | --- | --- | --- |
| `usuarios/{uid}` | Dueño o admin; list solo admin | Create/update admin | Denegado |
| `usuarios_access/{uid}` | Dueño o admin; list solo admin | Create/update admin | Denegado |
| `modulos/{modId}` | Cualquier autenticado | Create/update admin | Denegado |
| `roles/{roleId}` | Cualquier autenticado | Create/update admin | Denegado |
| `auditoria/{docId}` | Solo admin | Denegado | Denegado |
| `notificaciones/{id}` | Cualquier autenticado | Denegado | Denegado |
| `notificaciones_reads/{rid}` | Solo read propio por prefijo `{uid}_` | Create/update propio por prefijo `{uid}_` | Denegado |
| `app_config/{docId}` | Público sin auth (solo `get`) | Denegado | Denegado |
| `alertas_app/{id}` | Cualquier autenticado | Denegado | Denegado |
| Cualquier otra ruta | Denegado | Denegado | Denegado |

Implicacion: la mayor parte del backend web usa Admin SDK y no depende de estas reglas. Las reglas protegen principalmente accesos directos desde Firebase Web SDK en cliente.

## Usos Cliente Directo Observados

Usos que si encajan con reglas actuales:

- `useAccess` lee `usuarios_access/{uid}` del usuario autenticado.
- `notificaciones/repo.ts` escucha `notificaciones` y lee/escribe `notificaciones_reads/{uid}_{notifId}`.

Usos cliente directo que parecen bloqueados por reglas actuales:

- `StockCuadrillasMantClient.tsx` escucha `cuadrillas/{selectedId}/stock`; no existe regla para `cuadrillas` ni subcoleccion `stock`.

Usos cliente directo corregidos:

- `alertas-app/repo.ts` escucha `alertas_app` por `ymd` o por `estado`. Regla agregada 2026-06-20: `allow get, list: if signedIn()`.

Riesgo: estas suscripciones pueden caer con `permission-denied` en cliente si se ejecutan contra Firestore real con las reglas actuales. En varios casos hay fallback a APIs propias, pero el realtime directo podria no funcionar.

## Colecciones Cubiertas Por Reglas

Colecciones con contrato explicito:

- `usuarios`
- `usuarios_access`
- `modulos`
- `roles`
- `auditoria`
- `notificaciones`
- `notificaciones_reads`
- `alertas_app` (lectura cliente habilitada 2026-06-20)
- `app_config` (lectura pública sin auth habilitada 2026-06-21 — necesaria para force update Android antes de login)

## Colecciones Sensibles Usadas Por Servidor/Admin SDK

Estas colecciones aparecen en rutas web, domain services o functions, pero no tienen regla cliente explicita y caen en deny default. Acceso esperado: servidor/Admin SDK.

Ejemplos observados:

- `ordenes`
- `instalaciones`
- `cuadrillas`
- `equipos`
- `materiales`
- `almacen_stock`
- `movimientos_inventario`
- `ventas`
- `actas`
- `actas_guias`
- `usuarios_presencia`
- `asignacion_supervisores_*`
- `asignacion_gestores_*`
- `garantias_cruce_imports`
- `garantias_cruce_periods`
- `garantias_cruce_periods/{instYm}/rows`
- `ordenes_import_runs`
- `telegram_*`
- `mantenimiento_*`
- `transfer_marks`
- `sequences`

Este deny-by-default es coherente para datos operativos sensibles, pero hay que alinear cualquier listener cliente directo con reglas o migrarlo a API.

## Garantias Cruce

Las colecciones del flujo de garantias no tienen reglas explicitas:

- `garantias_cruce_imports`
- `garantias_cruce_periods`
- `garantias_cruce_periods/{instYm}/rows`

Consecuencia:

- Cliente Firestore directo no puede leer ni escribir.
- `/api/ordenes/garantias/cruce/*` opera por Admin SDK y es la frontera de acceso real.
- `garantiasCruceSync` opera por Admin SDK y tampoco depende de reglas.

Esto es seguro para exposicion directa, pero hace mas importante que las rutas API validen permisos correctamente.

## Indexes

`firebase\firestore.indexes.json` solo define un indice compuesto:

| Collection group | Campos |
| --- | --- |
| `notificaciones` | `scope ASC`, `estado ASC`, `createdAt DESC` |

Este indice corresponde al query cliente:

```ts
collection(db, "notificaciones")
where("scope", "==", "ALL")
where("estado", "==", "ACTIVO")
orderBy("createdAt", "desc")
```

No hay indexes compuestos declarados para las rutas server/API que usan Admin SDK. Eso no evita que Firestore requiera indices para queries compuestas en produccion; solo indica que no estan versionados en `firestore.indexes.json`.

Queries a revisar por posible indice no versionado:

- `alertas_app` por `ymd` o `estado` si se habilita cliente directo.
- `ordenes` con combinaciones de `cuadrillaId`, `fSoliYmd`, `fechaFinVisiYmd`, `estado`.
- `garantias_cruce_periods` ordenado por `instYm`.
- `garantias_cruce_periods/{instYm}/rows` ordenado por `fechaAtencionYmd`.
- `cuadrillas` por `area`, `estado`, `coordinadorUid`.
- `usuarios_access` por `roles array-contains`.

## Riesgos Y Observaciones

- `isAdmin()` llama `accessDoc(request.auth.uid)` varias veces; funcionalmente sirve, pero puede repetirse dentro de una misma evaluacion de reglas.
- Si `usuarios_access/{uid}` no existe, `isAdmin()` no habilita nada; el usuario queda sin privilegios admin aunque este autenticado.
- Las reglas no validan campos permitidos en updates admin. El control fino vive en las APIs/server actions, no en Firestore rules.
- `notificaciones_reads` protege por prefijo del document id, no por validar que `request.resource.data.uid == request.auth.uid`.
- Hay mojibake en comentarios de reglas; no afecta ejecucion, pero dificulta lectura.
- Algunas rutas cliente usan Firebase Web SDK directo contra colecciones no permitidas por reglas actuales.

## Pendientes

- Decidir si `cuadrillas/{id}/stock` necesita regla cliente para realtime o si debe reemplazarse por polling/API.
- Validar si `notificaciones_reads` debe reforzarse con validacion de campos (`uid`, `notifId`) ademas del prefijo del doc id.
- Versionar indices necesarios para queries server/API criticas o documentar que se gestionan manualmente desde Firebase Console.
- Crear una politica explicita para colecciones nuevas: default deny + acceso solo por API salvo excepcion documentada.
