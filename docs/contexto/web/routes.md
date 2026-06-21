# Rutas Web Protegidas - REDES

Actualizado: 2026-06-20.

Estado: **Revisar**. Deep dive focalizado en `apps\web\src\app\(protected)` como mapa de acceso por dominio. No se modifico codigo fuente ni se ejecuto la app.

## Alcance

Fuentes leidas:

- `apps\web\src\app\(protected)\admin\layout.tsx`
- `apps\web\src\app\(protected)\home\layout.tsx`
- `apps\web\src\app\(protected)\home\page.tsx`
- `apps\web\src\core\auth\guards.ts`
- `apps\web\src\core\rbac\homeRoute.ts`
- `apps\web\src\core\rbac\buildHomeNav.ts`
- `apps\web\src\core\rbac\menu.ts`
- Inventario de `page.tsx` bajo `apps\web\src\app\(protected)`.
- Lectura focalizada de paginas sin guard propio aparente.

Conteo observado:

- 110 paginas `page.tsx` bajo `(protected)`.
- 20 paginas bajo `admin`.
- 90 paginas bajo `home`.
- 13 paginas sin guard propio en su archivo `page.tsx`; algunas son aliases/re-export.

## Layouts Protegidos

`admin/layout.tsx`:

- Ejecuta `requireAdmin()`.
- Requiere sesion valida, `estadoAcceso = HABILITADO` y `session.isAdmin`.
- Si no es admin, redirige a `/home`.
- Monta `AdminSidebar`, `AdminTopbar`, `TabSessionGuard`, `UserPresenceHeartbeat` y `NotificationsRealtime`.

`home/layout.tsx`:

- Ejecuta `requireAuth()`.
- Requiere sesion valida y `estadoAcceso = HABILITADO`.
- Monta `HomeSidebar`, `HomeTopbar`, `TabSessionGuard`, `UserPresenceHeartbeat` y `NotificationsRealtime`.
- La autorizacion fina de cada dominio puede venir de la pagina, server action, API o navegacion.

`home/page.tsx`:

- Ejecuta `requireAuth()`.
- Si hay comunicado obligatorio pendiente, redirige a `/home/comunicados`.
- En caso contrario redirige segun `getHomeRouteForSession`.

## Guards

`guards.ts` define:

| Guard | Conducta |
| --- | --- |
| `requireAuth()` | Si no hay sesion o acceso habilitado, redirige a `/login`. |
| `requireAdmin()` | Usa `requireAuth`; si no es admin, redirige a `/home`. |
| `requireArea(area)` | Admin pasa; si no, exige `session.access.areas.includes(area)`, si falla redirige a `/home`. |
| `requirePermission(permission)` | Admin pasa; si no, exige permiso efectivo; si falla redirige a `/admin`. |

Observacion: `requirePermission` usa `/admin` como fallback aunque la ruta este bajo `/home`; para usuarios no admin, esto puede terminar en rebote por `admin/layout`.

## Home Por Rol

`getHomeRouteForSession` prioriza roles asi:

1. `TI` -> `/home/ti`
2. `RRHH` -> `/home/rrhh`
3. `SUPERVISOR` -> `/home/supervisor`
4. `SEGURIDAD` -> `/home/seguridad`
5. `GERENCIA` -> `/home/gerencia`
6. `JEFATURA` -> `/home/jefatura`
7. `ALMACEN` -> `/home/almacen`
8. `GESTOR` -> `/home/gestor`
9. `COORDINADOR` -> `/home/coordinador`
10. `TECNICO` -> `/home/tecnico`

Si no encuentra rol conocido, cae a `/home/tecnico`.

Pendiente heredado de mobile/auth: esta prioridad es web y tambien se reutiliza en bootstrap mobile.

## Navegacion

`buildHomeNav` arma el menu por combinacion de:

- Admin.
- Roles (`GERENCIA`, `JEFATURA`, `ALMACEN`, `RRHH`, `SUPERVISOR`, `SEGURIDAD`, `GESTOR`, `COORDINADOR`, etc.).
- Areas (`INSTALACIONES`, `MANTENIMIENTO`).
- Permisos efectivos (`ORDENES_*`, `MATERIALES_*`, `EQUIPOS_*`, `VENTAS_*`, `GERENCIA_*`, etc.).

Importante: la navegacion no es control de acceso suficiente. Algunas paginas tienen guard propio; otras parecen depender solo del layout `requireAuth()` y de que no aparezcan en menu.

## Dominios Principales

| Dominio | Rutas base | Acceso observado |
| --- | --- | --- |
| Admin | `/admin/*` | Layout admin + guards por pagina/action. |
| Home shell | `/home`, `/home/{rol}` | Auth + redireccion por rol y comunicado obligatorio. |
| Garantias | `/home/garantias/*` y `/home/ordenes/garantias/*` | Guard manual por rol/permiso en rutas origen; aliases en `/home/garantias/*`. |
| Instalaciones | `/home/instalaciones/*` | Mezcla de `requireAuth`, `requireArea("INSTALACIONES")`, checks por rol/permiso y paginas sin guard propio. |
| Ordenes | `/home/ordenes/*` | Permisos `ORDENES_*` y roles puntuales como coordinador. |
| Transferencias | `/home/transferencias/*` | Permisos de equipos/materiales y areas `INSTALACIONES`/`MANTENIMIENTO`. |
| Mantenimiento | `/home/mantenimiento/*` | `requireArea("MANTENIMIENTO")` y permisos de cuadrillas/materiales donde aplica. |
| Gerencia | `/home/gerencia/*` | Roles `GERENCIA`/`JEFATURA`, admin y permisos `GERENCIA_*`. |
| RRHH/Supervision | `/home/rrhh/*`, `/home/supervisores/*` | Roles privilegiados y permisos de supervisores/asistencia. |
| Inventario/catalogos | materiales, equipos, zonas, cuadrillas, usuarios | Permisos especificos `*_VIEW`, `*_CREATE`, `*_EDIT`, `*_MANAGE`. |
| Ventas | `/home/ventas/*` | Permisos `VENTAS_*`. |

## Paginas Sin Guard Propio Detectado

Estas paginas no contienen llamada directa a `requireAuth`, `requireArea`, `requirePermission` o `requireAdmin` en su propio `page.tsx`.

Aliases/re-export:

- `home\garantias\page.tsx`
- `home\garantias\cruce\page.tsx`
- `home\garantias\cruce\cargas\page.tsx`
- `home\garantias\dashboard\page.tsx`

Estas reexportan paginas de `home\ordenes\garantias\...`, donde si hay guard manual por rol/permiso.

Paginas que parecen depender solo del `home/layout.tsx`, navegacion o APIs internas:

- `home\cuadrillas\gestion\page.tsx`
- `home\tecnicos\gestion\page.tsx`
- `home\instalaciones\actas\page.tsx`
- `home\instalaciones\asignacion-gestores\page.tsx`
- `home\instalaciones\asistencia\resumen\page.tsx`
- `home\instalaciones\asistencia-programada\page.tsx`
- `home\instalaciones\detalle\page.tsx`
- `home\instalaciones\materiales\page.tsx`

`home\instalaciones\asistencia\page.tsx` tiene `requireAuth()` y calcula `modoAdmin` en servidor (ver patron a continuacion).

Riesgo: un usuario autenticado y habilitado podria entrar por URL directa a la pagina. Si el cliente/API interno bloquea las acciones, el riesgo queda en exposicion de UI o errores; si no, puede haber acceso funcional no deseado.

## Patrones De Acceso Observados

- Admin global: layout `admin` y paginas `roles`, `modulos`, `permissions`, `usuarios`, `temporal`.
- Admin con excepciones por permisos: algunas paginas admin como comunicados usan `requirePermission(COMUNICADOS_MANAGE)` y usuarios new/edit usan `USERS_CREATE`/`USERS_EDIT`.
- Area gates: instalaciones/mantenimiento usan `requireArea`.
- Permisos finos: materiales, equipos, transferencias, ordenes, ventas, zonas y usuarios.
- Checks manuales: varias paginas usan `requireAuth()` y luego roles/permisos con `redirect()`.
- Actions/API como segunda frontera: server actions y API routes suelen repetir permisos, pero esta unidad no valida cada action/API.

## Riesgos Y Observaciones

- Existen paginas sin guard propio fuera de aliases, sobre todo en instalaciones/gestion.
- `requirePermission` redirige a `/admin` ante falta de permiso; para no admin puede ser confuso o generar rebote indirecto.
- La ruta `/home/garantias/*` es alias de `/home/ordenes/garantias/*`; conviene mantener ambos mapas sincronizados.
- `buildHomeNav` contiene bastante logica de autorizacion visual; puede divergir del guard real de paginas.
- Algunos roles privilegiados (`RRHH`, `SUPERVISOR`, `SEGURIDAD`) tienen filtrado especial de menu, pero eso no sustituye page guards.

## Patron Server-Side Role Passing

Algunas paginas necesitan saber el rol del usuario para decidir que APIs llamar en el cliente. En lugar de dejar que el cliente haga llamadas de prueba que generan 403, la pagina server-side calcula el flag y lo pasa como prop:

```tsx
// page.tsx (server component)
export default async function SomePage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const modoAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("JEFATURA");
  return <SomeClient initialModoAdmin={modoAdmin} />;
}

// SomeClient.tsx (client component)
export default function SomeClient({ initialModoAdmin }: { initialModoAdmin: boolean }) {
  const [modoAdmin, setModoAdmin] = useState(initialModoAdmin);
  useEffect(() => {
    if (initialModoAdmin) fetchAdminData(); // solo llama APIs de admin si corresponde
    fetchCommonData();
  }, [deps]);
}
```

Beneficio: elimina llamadas API que devuelven 403 innecesarios para usuarios sin rol admin (reduce ruido en Cloud Logging).

Implementado en: `home/instalaciones/asistencia/page.tsx` + `ui/AsistenciaClient.tsx`.

## Archivos Publicos

- `apps/web/public/robots.txt` — existe. Deniega `/api/` y `/admin/`, permite todo lo demas.
- Favicon: configurado en `src/app/layout.tsx` via `metadata.icons.icon = "/img/logo.png"`.

## Pendientes

- Revisar las 8 paginas sin guard propio no-alias y decidir guard minimo esperado.
- Definir si las paginas de gestion/asistencia deben exigir area `INSTALACIONES`, rol `GESTOR` o permisos explicitos.
- Alinear fallback de `requirePermission` para rutas `/home` si `/admin` no es buen destino para usuarios no admin.
- Generar matriz final ruta -> guard -> permiso/rol -> API consumidor cuando se profundice dominio por dominio.
- Validar que server actions/API de paginas con guard laxo repiten permisos suficientes.
