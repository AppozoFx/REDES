# Diagramas Iniciales - REDES

Estado: Fase 0, alto nivel.

## Arquitectura REDES

```mermaid
flowchart TD
  UserWeb[Usuarios web] --> Web[Next.js apps/web]
  Mobile[REDES-MOBILE Android] --> MobileApi[API routes /api/mobile]
  MobileApi --> Web
  Web --> FirebaseClient[Firebase Client/Admin]
  Web --> Firestore[(Firestore)]
  Web --> Storage[(Firebase Storage)]
  Web --> Functions[Firebase Functions]
  Functions --> Firestore
  Functions --> BigQuery[(BigQuery)]
  Functions --> Telegram[Telegram]
  Web --> Winbo[Integracion Winbo]
  Web --> OpenAI[OpenAI / AI routes]
  Web --> ActaEngine[Cloud Run acta-engine]
  ActaEngine --> PdfBarcode[Extraccion acta desde PDF]
  Scripts[Scripts operativos] --> Firestore
  Scripts --> BigQuery
```

## Relacion REDES / REDES-MOBILE

```mermaid
flowchart LR
  subgraph REDES_MOBILE[REDES-MOBILE]
    AndroidApp[Compose App]
    AuthRepo[FirebaseAuthRepository]
    ApiClient[RedesApiClient]
    TrackingSvc[LocationTrackingService]
    RoleScreens[Pantallas por rol]
  end

  subgraph REDES[REDES Web/Backend]
    MobileRoutes[apps/web/src/app/api/mobile]
    AuthRoutes[api/auth]
    Domain[domain + lib]
    Firestore[(Firestore)]
    Storage[(Storage)]
  end

  AndroidApp --> AuthRepo
  AndroidApp --> ApiClient
  AndroidApp --> TrackingSvc
  ApiClient --> MobileRoutes
  AuthRepo --> AuthRoutes
  MobileRoutes --> Domain
  Domain --> Firestore
  Domain --> Storage
  TrackingSvc --> MobileRoutes
  RoleScreens --> ApiClient
```

## Unidades Iniciales

```mermaid
flowchart TB
  Root[REDES] --> Web[apps/web]
  Root --> Firebase[firebase]
  Root --> CloudRun[cloudrun/acta-engine]
  Root --> Scripts[scripts]
  Web --> AppRouter[src/app]
  Web --> Domain[src/domain]
  Web --> Lib[src/lib]
  Web --> UI[src/ui]
  AppRouter --> Protected[(protected)]
  AppRouter --> Api[api routes]
  Api --> ApiMobile[api/mobile]
  Firebase --> Rules[firestore.rules]
  Firebase --> Indexes[firestore.indexes.json]
  Firebase --> Functions[functions/src]
```

## API Mobile REDES + REDES-MOBILE Network

Estado: deep dive 2026-06-13, unidad en **Revisar**.

```mermaid
flowchart LR
  subgraph Android[REDES-MOBILE]
    UI[ViewModels por rol]
    Repo[Repositorios remotos]
    Api[RedesApiClient]
    Interceptor[AuthTokenInterceptor]
    Token[FirebaseIdTokenProvider]
    Tracking[LocationTrackingService]
  end

  subgraph Backend[REDES apps/web]
    Routes[/api/mobile route.ts/]
    Auth[getMobileAuthContext]
    RoleCtx[mobileTecnico/mobileSupervisor/mobileCoordinador]
    Domain[helpers y servicios directos]
  end

  subgraph Firebase[Firebase]
    AuthFb[Firebase Auth]
    Store[(Firestore)]
    Storage[(Storage)]
  end

  UI --> Repo
  Repo --> Api
  Tracking --> Repo
  Api --> Interceptor
  Interceptor --> Token
  Token --> AuthFb
  Api --> Routes
  Routes --> Auth
  Auth --> AuthFb
  Auth --> RoleCtx
  RoleCtx --> Store
  Routes --> Domain
  Domain --> Store
  Domain --> Storage
```

## Flujo De Token Mobile

```mermaid
sequenceDiagram
  participant App as REDES-MOBILE
  participant Provider as FirebaseIdTokenProvider
  participant API as REDES /api/mobile
  participant Auth as Firebase Admin Auth
  participant Access as getUserAccessContextCached

  App->>Provider: getIdToken()
  Provider-->>App: Firebase ID token
  App->>API: Authorization: Bearer token
  API->>Auth: verifyIdToken(token, true)
  API->>Access: cargar roles, areas, permisos, estadoAcceso
  alt estadoAcceso HABILITADO
    API-->>App: JSON ok
  else sin token o acceso invalido
    API-->>App: 401 UNAUTHENTICATED
  end
```

## Grupos De Endpoints Por Rol

```mermaid
flowchart TB
  Common[Comun: bootstrap, me, presencia, comunicados, tracking]
  Tecnico[Tecnico: home, ordenes, stock, mapa, cuadrillas-mapa, inicio-jornada, alertas-app]
  Supervisor[Supervisor: home, ordenes, mapa, cuadrillas-mapa, supervision, jornada, garantias/update]
  Coordinador[Coordinador: inicio, cuadrillas, mapa, stock, auditoria, predespacho, ventas, plantillas]

  Common --> Auth[Mobile auth habilitado]
  Tecnico --> TecnicoCtx[getTecnicoContext]
  Supervisor --> SupervisorCtx[getSupervisorContext]
  Coordinador --> CoordCtx[getCoordinadorContext]
  TecnicoCtx --> Firestore[(Firestore)]
  SupervisorCtx --> Firestore
  CoordCtx --> Firestore
```

## Auth/RBAC Mobile Y Bootstrap

Estado: deep dive 2026-06-14, unidad en **Revisar**.

```mermaid
sequenceDiagram
  participant Android as REDES-MOBILE
  participant Bootstrap as /api/mobile/bootstrap
  participant Auth as getMobileAuthContext
  participant Access as getUserAccessContextCached
  participant Roles as roles repo
  participant Comunicados as comunicados service

  Android->>Bootstrap: Bearer Firebase ID token
  Bootstrap->>Auth: validar request
  Auth->>Auth: Firebase Admin verifyIdToken(token,true)
  Auth->>Access: uid
  Access->>Roles: getRolesByIds
  Roles-->>Access: permissions por rol activo
  Access-->>Auth: roles, areas, directPermissions, effectivePermissions, estadoAcceso
  Auth-->>Bootstrap: MobileAuthContext habilitado
  Bootstrap->>Comunicados: listPendingComunicadosForUser
  Comunicados-->>Bootstrap: comunicados aplicables
  Bootstrap-->>Android: session + gates + defaultRole
```

## Decision RBAC Mobile

```mermaid
flowchart TD
  Req[Request /api/mobile] --> Bearer{Bearer token?}
  Bearer -->|No| U401[401 UNAUTHENTICATED]
  Bearer -->|Si| Verify[Firebase Admin verifyIdToken]
  Verify -->|Falla| U401
  Verify -->|uid| Access[usuarios_access uid]
  Access -->|No existe| U401
  Access --> State{estadoAcceso HABILITADO?}
  State -->|No| U401
  State -->|Si| Effective[effectivePermissions]
  Effective --> Bootstrap{bootstrap/me?}
  Bootstrap -->|Si| Session[Responder session]
  Bootstrap -->|No| Role{helper por rol}
  Role -->|TECNICO| Tec[getTecnicoContext]
  Role -->|SUPERVISOR| Sup[getSupervisorContext]
  Role -->|COORDINADOR| Coord[getCoordinadorContext]
  Tec --> Data[Datos operativos]
  Sup --> Data
  Coord --> Data
```
