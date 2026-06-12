Crea una nueva API route en el proyecto REDES siguiendo el patrón real del proyecto.

El argumento es la ruta relativa dentro de `src/app/api/`, por ejemplo: `cuadrillas/estado` o `materiales/lista`.

## Instrucciones

1. Determiná el path completo: `apps/web/src/app/api/$ARGUMENTS/route.ts`
2. Si el directorio no existe, crealo.
3. Preguntá al usuario qué método HTTP necesita (GET, POST, o ambos) y qué hace el endpoint, si no lo especificó en $ARGUMENTS.
4. Generá el archivo `route.ts` siguiendo **exactamente** este patrón real del proyecto:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
// Importar z de zod solo si hay body que validar
// import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Permiso requerido — usar string del sistema RBAC existente
const PERM = "NOMBRE_PERMISO";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!session.isAdmin && !session.permissions.includes(PERM)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // Lógica del endpoint con adminDb()
    const db = adminDb();

    return NextResponse.json({ ok: true, items: [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
```

Para POST con body validado con Zod:
```typescript
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!session.isAdmin && !session.permissions.includes(PERM)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY", details: parsed.error.flatten() }, { status: 400 });
    }

    const db = adminDb();
    // usar parsed.data

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
```

## Reglas que SIEMPRE debes respetar
- `runtime = "nodejs"` y `dynamic = "force-dynamic"` van siempre al inicio
- Verificar sesión ANTES de cualquier lógica
- Verificar `estadoAcceso === "HABILITADO"` siempre
- `isAdmin` tiene bypass del permiso — siempre incluirlo en la condición
- Nunca usar Firebase client-side en routes — siempre `adminDb()`
- El bloque catch devuelve `{ ok: false, error: string }` con status 500
- No usar `console.log` — si hace falta debug, usar comentarios temporales
