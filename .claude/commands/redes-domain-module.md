Crea un nuevo módulo de dominio en `src/domain/` siguiendo el patrón real del proyecto REDES.

El argumento es el nombre del módulo en kebab-case, por ejemplo: `garantias` o `equipos-stock`.

## Instrucciones

1. Creá el directorio `apps/web/src/domain/$ARGUMENTS/` si no existe.
2. Preguntá al usuario qué entidad principal maneja este módulo si no está claro por el nombre.
3. Creá los siguientes archivos:

### `schemas.ts`
Tipos e inferencia Zod. Patrón real del proyecto:

```typescript
import { z } from "zod";

export const [Entidad]DocSchema = z.object({
  // campos del documento Firestore
  id: z.string().min(1),
  // agregar campos según la entidad
});

export type [Entidad]Doc = z.infer<typeof [Entidad]DocSchema>;
```

### `repo.ts`
Acceso a Firestore con Firebase Admin. Patrón real del proyecto:

```typescript
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { [Entidad]Doc } from "./schemas";

export const [ENTIDAD]_COL = "[nombre-coleccion-firestore]";

export function [entidad]Col() {
  return adminDb().collection([ENTIDAD]_COL);
}

export async function get[Entidad]ById(id: string): Promise<[Entidad]Doc | null> {
  const snap = await [entidad]Col().doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as [Entidad]Doc;
}

export async function list[Entidades](): Promise<[Entidad]Doc[]> {
  const snap = await [entidad]Col().get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as [Entidad]Doc));
}
```

## Reglas que SIEMPRE debes respetar
- Nunca importar Firebase client en `repo.ts` — siempre `adminDb()` de `@/lib/firebase/admin`
- Los tipos se exportan desde `schemas.ts` usando `z.infer<>`
- El nombre de la colección Firestore va en una constante exportada (`[ENTIDAD]_COL`)
- Si el módulo necesita enviar notificaciones, crear archivo separado (ej: `notificaciones-tecnico.ts`) e importarlo desde `repo.ts`
- No poner lógica de negocio compleja en `repo.ts` — si hace falta, crear `service.ts` aparte
- Si la colección ya existe en Firestore (ver lista en CLAUDE.md), usar el nombre exacto — no inventar nombres nuevos
