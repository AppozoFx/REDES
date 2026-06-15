# Arquitectura Inicial - REDES

Estado: Fase 0, mapa superficial.

## Vision General

REDES combina una aplicacion web/backend Next.js, Firebase y un servicio Cloud Run puntual:

- Web/backend: `C:\Proyectos\REDES\apps\web`.
- Firebase project assets: `C:\Proyectos\REDES\firebase`.
- Cloud Run: `C:\Proyectos\REDES\cloudrun\acta-engine`.
- Automatizaciones operativas: `C:\Proyectos\REDES\scripts`.

La app web parece ser el centro funcional: contiene pantallas protegidas por rol, API routes, servicios de dominio, integraciones y endpoints consumidos por REDES-MOBILE.

## Areas Detectadas

### Web

Fuente principal: `apps\web`.

Indicadores:

- Next.js 15 con App Router.
- React 19 y TypeScript.
- Rutas publicas: login, politica de privacidad, dev pages y temporales.
- Rutas protegidas bajo `app\(protected)\admin` y `app\(protected)\home`.
- API routes bajo `app\api`, incluyendo un grupo `api\mobile`.

Areas funcionales visibles por rutas/carpetas:

- admin, usuarios, roles, permissions, modulos
- instalaciones, mantenimiento, ordenes, garantias
- transferencias, materiales, equipos, cuadrillas
- gerencia, ventas, rrhh, seguridad, jefatura, supervision
- comunicados, alertas, presencia, tracking
- integraciones: Telegram, Winbo, OpenAI/AI

### Firebase

Fuente principal: `firebase`.

Elementos visibles:

- `firestore.rules`
- `firestore.indexes.json`
- `functions\src`
- funciones relacionadas con bootstrap admin, usuarios, alertas por tramo, Winbo, garantias y Telegram.

### Cloud Run

Fuente principal: `cloudrun\acta-engine`.

Servicio HTTP para extraer numero de acta desde PDF. Endpoints documentados en README:

- `GET /health`
- `POST /extract`

### Scripts

Fuente principal: `scripts`.

Familias visibles:

- importacion/migracion de equipos e instalaciones
- remapeo de coordinadores
- permisos y materiales
- BigQuery garantias/dashboard
- backfills
- smoke API

## Riesgos y Unknowns

- Las reglas Firestore aun no fueron leidas en profundidad; no se puede afirmar el modelo de permisos.
- Las rutas API son numerosas; falta confirmar metodos, esquemas, efectos y dependencias.
- La relacion exacta con REDES-MOBILE debe validarse leyendo `api\mobile` y los clientes Android.
- Hay archivos temporales y outputs que deben excluirse de indices profundos.
- `local.properties`, keystore, envs y otros secretos no deben abrirse ni copiarse.

## Primera Unidad Para Deep Dive

`apps\web\src\app\api\mobile` + consumidores de REDES-MOBILE (`network`, `data`, `ui\navigation`).

Motivo: define el contrato backend-mobile y afecta autenticacion, roles, tracking, pantallas y decisiones de programacion.
