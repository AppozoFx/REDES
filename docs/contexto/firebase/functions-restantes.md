# Firebase Functions restantes - Telegram, tramos y usuarios

Actualizado: 2026-06-16.

Estado: **Revisar**. Unidad focalizada en las funciones exportadas que no pertenecen al cruce de garantias ni al scheduler WinBo.

## Alcance

Fuentes leidas:

- `firebase\functions\src\index.ts`
- `firebase\functions\package.json`
- `firebase\functions\tsconfig.json`
- `firebase\functions\src\bootstrapAdmin.ts`
- `firebase\functions\src\usersCreate.ts`
- `firebase\functions\src\schemas\usersCreate.schema.ts`
- `firebase\functions\src\lib\admin.ts`
- `firebase\functions\src\lib\security.ts`
- `firebase\functions\src\lib\audit.ts`
- `firebase\functions\src\utils\authz.ts`
- `firebase\functions\src\tramoAlertas.ts`
- `apps\web\src\app\api\cron\tramo-alertas\route.ts`
- `firebase\functions\src\telegram\webhook.ts`
- `firebase\functions\src\telegram\parser.ts`
- `firebase\functions\src\telegram\aiParser.ts`
- `firebase\functions\src\telegram\telegramApi.ts`

No se ejecutaron deploys, emuladores, llamadas Telegram, llamadas OpenAI, cron jobs ni escrituras contra Firestore.

## Mapa De Exports

`firebase\functions\src\index.ts` aplica `setGlobalOptions({ maxInstances: 10 })` y exporta:

- Admin/usuarios: `bootstrapAdmin`, `usersCreate`.
- Telegram: `telegramWebhook`, `telegramPendientesReminder`, `telegramPreliqRetryWorker`, `telegramCleanupWorker`.
- Cron web delegado: `tramoAlerta1`, `tramoAlerta2`, `tramoAlerta3`, `tramoAlertaCierreRuta`.
- Otros ya documentados: `winboOrdenesAutoSync`, `garantiasCruceSync`.

El runtime es Node 22 con TypeScript `NodeNext`, `strict`, `noUnusedLocals` y build por `tsc`.

## Helpers Compartidos

`lib\admin.ts` inicializa Firebase Admin una vez y exporta `db`, `auth` y `FieldValue`.

`lib\security.ts` provee:

- `requireAuth(req)`: exige `Authorization: Bearer <idToken>` y verifica el token con revocation check.
- `requireAdmin(req)`: ademas lee `usuarios_access/{uid}` y exige `estadoAcceso = HABILITADO` y rol `ADMIN`.

`lib\audit.ts` escribe documentos en `auditoria` con `ts`, `actorUid`, `action`, `target` y `meta`.

`utils\authz.ts` duplica parte de esa frontera para `usersCreate`: verifica Bearer token y valida `ADMIN` en `usuarios_access`, pero no usa el mismo helper ni el mismo revocation check de `lib\security.ts`.

## `bootstrapAdmin`

Ruta: `firebase\functions\src\bootstrapAdmin.ts`.

Tipo: `onRequest`.

Contrato observado:

- Solo acepta `POST`.
- Exige usuario autenticado por Firebase Auth.
- Solo corre si `ENABLE_ADMIN_BOOTSTRAP === "true"` o si esta en emulador.
- Bloquea el bootstrap si ya existe algun `usuarios_access` habilitado con rol `ADMIN`.
- Escribe `usuarios_access/{uid}` con rol `ADMIN`, areas `INSTALACIONES` y `MANTENIMIENTO`, `estadoAcceso: HABILITADO` y campos de auditoria.
- Registra auditoria `BOOTSTRAP_ADMIN`.

Riesgo principal: es una funcion sensible por diseno. Debe mantenerse deshabilitada en produccion normal y la variable `ENABLE_ADMIN_BOOTSTRAP` debe tratarse como interruptor temporal, no permanente.

## `usersCreate`

Ruta: `firebase\functions\src\usersCreate.ts`.

Tipo: `onRequest`, region `us-central1`.

Contrato observado:

- Solo acepta `POST`.
- Exige Bearer token y rol `ADMIN` en `usuarios_access`.
- Valida payload con `UsersCreateSchema`.
- Crea usuario en Firebase Auth con `email`, `password` opcional y `disabled` segun `estadoAcceso`.
- En batch crea:
  - `usuarios/{newUid}` con datos de perfil y campos historicos como `dni_ce`, `rol`, `area`, `f_ingreso`, `f_nacimiento`.
  - `usuarios_access/{newUid}` con `roles`, `areas`, `permissions: []` y `estadoAcceso`.
  - documento `auditoria` con accion `USERS_CREATE`.

La schema permite areas `INSTALACIONES` y `MANTENIMIENTO`, roles libres como strings y `estadoAcceso` `HABILITADO`/`INHABILITADO`.

Pendiente de contrato: comparar esta schema con `apps\web\src\domain\usuarios\schema.ts`, porque el dominio web usa campos y validaciones mas amplios como `tipoDoc`/`nroDoc`, roles/areas dinamicos y contratos Zod separados.

## Alertas De Tramo

Ruta Firebase: `firebase\functions\src\tramoAlertas.ts`.

Funcionamiento: las functions no contienen la logica de negocio; delegan por HTTP al endpoint web `POST /api/cron/tramo-alertas`.

Configuracion:

- Param `WEB_APP_BASE_URL`.
- Secret `CRON_TOKEN`.
- Header enviado: `x-cron-token`.
- Region `us-central1`.
- Timezone `America/Lima`.

Schedules:

| Export | Schedule | Objetivo |
| --- | --- | --- |
| `tramoAlerta1` | `0 8 * * *` | Tramo 08:00 |
| `tramoAlerta2` | `0 12 * * *` | Tramo 12:00 |
| `tramoAlerta3` | `0 16 * * *` | Tramo 16:00 |
| `tramoAlertaCierreRuta` | `0 17 * * *` | Cierre de ruta |

Endpoint web relacionado: `apps\web\src\app\api\cron\tramo-alertas\route.ts`.

Conducta del endpoint:

- Exige `CRON_TOKEN` por header.
- Calcula fecha/hora en Lima al momento de ejecucion.
- A las 08/12/16 consulta `ordenes` por `fSoliYmd` y `fSoliHm`, omite estados finales y agrupa por cuadrilla para enviar `TRAMO_ALERTA`.
- A las 17 revisa cuadrillas con ordenes del dia que no tienen pendientes, pero no cerraron ruta, y envia `CIERRE_RUTA_RECORDATORIO`.
- Usa limites de lectura de 2000 ordenes por tramo y 3000 ordenes en cierre.

Riesgos:

- La function delega todo al web app; si `WEB_APP_BASE_URL` o `CRON_TOKEN` no coinciden, no hay fallback.
- El endpoint decide el tramo por hora actual Lima, no por el nombre de la function. Reintentos fuera de hora podrian caer en tramo inesperado o no soportado.
- Hay mojibake en comentarios/mensajes del endpoint, lo que complica soporte operativo.

## Telegram Webhook Y Preliquidacion

Rutas:

- `firebase\functions\src\telegram\webhook.ts`
- `firebase\functions\src\telegram\parser.ts`
- `firebase\functions\src\telegram\aiParser.ts`
- `firebase\functions\src\telegram\telegramApi.ts`

Secrets/params observados:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `TELEGRAM_ALLOWED_USER_IDS`
- `OPENAI_API_KEY_PRELIQUIDACION`
- `OPENAI_PRELIQ_MODEL`, default `gpt-4.1-mini`

Colecciones principales:

- `telegram_updates`
- `telegram_preliquidaciones`
- `telegram_preliquidacion_retries`
- `telegram_cuadrilla_responsables`
- `ordenes`
- `telegram_found_guards`
- `auditoria`

Entrada principal: `telegramWebhook`, `onRequest` en `us-central1`.

Flujo observado:

1. Solo acepta `POST`.
2. Valida `x-telegram-bot-api-secret-token` contra `TELEGRAM_WEBHOOK_SECRET`.
3. Exige `TELEGRAM_BOT_TOKEN` y al menos un chat permitido.
4. Procesa callbacks, comandos de consulta y mensajes de texto/caption.
5. Rechaza fotos para forzar plantilla en texto.
6. Deduplica updates por `telegram_updates/{chatId}_{messageId || updateId}`.
7. Parsea plantilla por reglas (`parser.ts`).
8. Si las reglas no alcanzan y existe `OPENAI_API_KEY_PRELIQUIDACION`, intenta enriquecer con OpenAI Responses API (`aiParser.ts`).
9. Busca la orden por `codiSeguiClien == pedido` en `ordenes`.
10. Si no encuentra orden, encola `telegram_preliquidacion_retries/{pedido}`.
11. Si encuentra orden, usa `telegram_found_guards/{chatId}_{pedido}_{ymd}` como guard contra duplicados temporales.
12. Escribe/mergea `telegram_preliquidaciones/{pedido}_{ymd}`, limpia retry y registra auditoria.

Comandos visibles en el flujo:

- `miid`.
- Resumen/pendientes/liquidadas por fecha.
- Retry de un pedido, retry all/procesar cola.
- Vista de cola.
- Consulta por cuadrilla.

Workers:

| Export | Schedule | Conducta |
| --- | --- | --- |
| `telegramPreliqRetryWorker` | `*/30 * * * *` | Reprocesa hasta 50 retries `PENDING_ORDER` con `nextRetryAt <= now`. |
| `telegramPendientesReminder` | `0 10,12,14,16,18,20 * * *` | Envia recordatorios y resumen mensual de pendientes a chats permitidos. |
| `telegramCleanupWorker` | `0 3 * * 0` | Borra `telegram_updates` antiguos de 30 dias y `telegram_found_guards` mayores a 2 horas, max 500 por corrida. |

Constantes de retry:

- Max attempts: 10.
- Intervalo: 30 minutos.
- Ventana maxima: 24 horas.

Riesgos y decisiones:

- `TELEGRAM_ALLOWED_USER_IDS` limita comandos/callbacks, pero el procesamiento normal de plantillas depende principalmente del chat permitido. Validar si esto es intencional.
- `telegram_preliquidacion_retries` usa doc por pedido; si hay multiples chats o dias para el mismo pedido, revisar colisiones operativas.
- El guard de duplicados `chatId_pedido_ymd` se limpia a las 2 horas por worker; validar ventana real de duplicados.
- El webhook concentra parser, comandos, reportes, retry y escritura en un archivo grande; conviene extraer modulos antes de cambios funcionales.
- `sendTelegramMessage` usa Markdown y muchos textos incluyen datos de usuario/orden; revisar escape de caracteres especiales para evitar mensajes rotos.
- El parser contiene patrones amplios y textos con mojibake; validar plantillas reales antes de endurecer reglas.
- El fallback IA depende de un secreto OpenAI y de un modelo externo; debe observarse costo, latencia y manejo de datos operativos.
- Varias consultas Firestore pueden requerir indices no versionados en `firestore.indexes.json`.

## Cierre De Unidad

Esta unidad deja documentadas las functions restantes que estaban pendientes. La siguiente revision recomendada pasa a dominios criticos web, empezando por `mantenimientoLiquidaciones`, porque concentra reglas de negocio y probablemente toca inventario, ordenes, tecnicos y liquidaciones.
