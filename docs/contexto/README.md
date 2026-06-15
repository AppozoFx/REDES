# Contexto Tecnico - REDES

Estado: Fase 0 completada el 2026-06-13.

Esta carpeta contiene documentacion viva de REDES para orientar trabajo tecnico sin releer todo el repositorio. En esta fase solo se hizo un mapa superficial: estructura top-level, manifests/configs de alto nivel, rutas evidentes y areas principales.

## Alcance De Fase 0

Fuentes revisadas:

- `C:\Proyectos\REDES\package.json`
- `C:\Proyectos\REDES\pnpm-workspace.yaml`
- `C:\Proyectos\REDES\firebase.json`
- `C:\Proyectos\REDES\turbo.json`
- `C:\Proyectos\REDES\apps\web\package.json`
- `C:\Proyectos\REDES\firebase\functions\package.json`
- `C:\Proyectos\REDES\cloudrun\acta-engine\README.md`
- estructura visible bajo `apps\web\src\app`, `apps\web\src\domain`, `apps\web\src\lib`, `firebase`, `cloudrun` y `scripts`

No se hizo deep dive de funciones ni de implementaciones internas.

## Mapa Rapido

REDES es un monorepo pnpm/turbo con:

- `apps\web`: aplicacion Next.js 15 / React 19 con App Router, rutas protegidas, API routes y dependencias de Firebase, OpenAI, Leaflet, Recharts, XLSX y Zod.
- `firebase`: configuracion Firebase, Firestore rules/indexes y Cloud Functions Node 22.
- `cloudrun\acta-engine`: servicio HTTP Python para extraccion de numero de acta desde PDF.
- `scripts`: migraciones, backfills, BigQuery SQL, smoke test e importaciones operativas.
- `docs`: documentacion existente y esta carpeta de contexto.

## Documentos De Contexto

- [INDEX.md](INDEX.md): mapa de unidades detectadas y estado documental.
- [PENDIENTES.md](PENDIENTES.md): backlog inicial de unidades por documentar.
- [CHANGELOG-CONTEXTO.md](CHANGELOG-CONTEXTO.md): cambios de contexto.
- [architecture/overview.md](architecture/overview.md): vision inicial de arquitectura.
- [architecture/diagrams.md](architecture/diagrams.md): diagramas Mermaid iniciales.
- [indexes/source-index.json](indexes/source-index.json): indice JSON superficial de Fase 0.

## Regla De Mantenimiento

RedesContext puede modificar Markdown, Mermaid e indices JSON dentro de `docs/contexto`. No debe modificar codigo fuente, configs, reglas Firebase, scripts, lockfiles, SQL, credenciales ni binarios.

## Siguiente Unidad Recomendada

Primera unidad para deep dive: `apps\web\src\app\api\mobile` junto con `REDES-MOBILE` network/repositorios. Es el contrato que conecta backend web con la app Android y desbloquea decisiones de programacion para mobile, roles y tracking.
