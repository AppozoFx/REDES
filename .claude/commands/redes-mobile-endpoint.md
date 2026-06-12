Crea un nuevo endpoint de API para ser consumido por REDES-MOBILE siguiendo el patrón real del proyecto.

El argumento es la ruta relativa dentro de `src/app/api/mobile/`, por ejemplo: `stock` o `cuadrilla/estado`.

## Instrucciones

1. Creá el path: `apps/web/src/app/api/mobile/$ARGUMENTS/route.ts`
2. Preguntá al usuario qué método HTTP y qué rol móvil puede acceder (TECNICO, SUPERVISOR, COORDINADOR, o varios), si no lo especificó.
3. Generá el archivo `route.ts` siguiendo **exactamente** este patrón real del proyecto:

```typescript
import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // 1. Autenticación móvil (Bearer token Firebase + X-Mobile-Role)
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    // 2. Validación de rol
    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const isAdmin = roles.includes("ADMIN");
    const isTecnico = roles.includes("TECNICO");
    // const isSupervisor = roles.includes("SUPERVISOR");
    // const isCoordinador = roles.includes("COORDINADOR");

    if (!isAdmin && !isTecnico) {
      return NextResponse.json({ ok: false, error: "ROLE_REQUIRED" }, { status: 403 });
    }

    // 3. Parsear body
    const body = await req.json().catch(() => ({}));
    // validar campos requeridos del body

    const db = adminDb();
    // lógica del endpoint

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
```

Para GET sin body:
```typescript
export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const isAdmin = roles.includes("ADMIN");
    // validar rol requerido

    const db = adminDb();
    // lógica del endpoint

    return NextResponse.json({ ok: true, data: null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
```

## Diferencia clave con API routes web
- Usar `getMobileAuthContext(req)` en lugar de `getServerSession()`
- El token viene como Bearer en Authorization header (Firebase ID token)
- El rol viene en el header `X-Mobile-Role` — lo resuelve `getMobileAuthContext` internamente
- No hay cookie de sesión — la identidad es 100% por token Firebase
- Si el endpoint es solo para TECNICO usar `getTecnicoContext(mobile)` de `@/core/auth/mobileTecnico`
- Si es para SUPERVISOR usar `getSupervisorContext(mobile)` de `@/core/auth/mobileSupervisor`
- Si es para COORDINADOR usar `getCoordinadorContext(mobile)` de `@/core/auth/mobileCoordinador`

## Reglas que SIEMPRE debes respetar
- `runtime = "nodejs"` y `dynamic = "force-dynamic"` van siempre
- Verificar `mobile` antes de cualquier lógica
- Mapear roles a uppercase antes de comparar
- `isAdmin` siempre tiene acceso — incluirlo en la condición de rol
- Nunca leer Firestore sin `adminDb()` — nunca Firebase client
- El catch devuelve `{ ok: false, error: string }` con status 500
