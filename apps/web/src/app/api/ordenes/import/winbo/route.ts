import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/core/auth/session";
import { acquireWinboSyncLock, syncWinboOrdenes } from "@/lib/winbo/sync";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    dryRun: z.boolean().default(true),
    mode: z.enum(["manual"]).default("manual"),
    scope: z.enum(["today", "range"]).default("today"),
    fechaVisiDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fechaVisiHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nombreArchivo: z.string().optional().default(""),
    filtros: z
      .object({
        pagActu: z.number().int().positive().optional(),
        zona: z.string().optional(),
        region: z.string().optional(),
        estado: z.string().optional(),
        tipoOrden: z.string().optional(),
        tipoTrabajo: z.string().optional(),
        cuadrilla: z.string().optional(),
        codigoCliente: z.string().optional(),
        documento: z.string().optional(),
      })
      .optional()
      .default({}),
  })
  .superRefine((input, ctx) => {
    if (input.fechaVisiDesde > input.fechaVisiHasta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INVALID_DATE_RANGE",
        path: ["fechaVisiHasta"],
      });
    }
  });

export async function POST(req: Request) {
  let lock: { release: () => Promise<void> } | null = null;
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const allowed = session.isAdmin || session.permissions.includes("ORDENES_IMPORT");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY", details: parsedBody.error.flatten() }, { status: 400 });
    }

    const actor = { uid: session.uid, kind: "user" as const };
    lock = await acquireWinboSyncLock(actor, "manual");
    const responseBody = await syncWinboOrdenes(parsedBody.data, actor);
    return NextResponse.json(responseBody);
  } catch (error: any) {
    const message = String(error?.message || "ERROR");
    if (message === "IMPORT_IN_PROGRESS") {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (lock) await lock.release();
  }
}
