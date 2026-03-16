import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { getAsignacionData } from "@/lib/gestorAsignacion";

export const runtime = "nodejs";

const BodySchema = z.object({
  fecha: z.string().min(1),
  gestorUid: z.string().optional(),
  forzar: z.boolean().optional(),
});

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

async function getProgramForDate(ymd: string) {
  const db = adminDb();
  const snap = await db
    .collection("asistencia_programada")
    .where("startYmd", "<=", ymd)
    .orderBy("startYmd", "desc")
    .limit(5)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs.find((d) => {
    const data = d.data() as any;
    const endYmd = String(data?.endYmd || "");
    return endYmd && endYmd >= ymd;
  });
  if (!doc) return null;
  return doc.data() as any;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");
    if (!canAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const { fecha, gestorUid, forzar } = parsed.data;
    let q: FirebaseFirestore.Query = adminDb()
      .collection("asistencia_borradores")
      .where("fecha", "==", fecha);
    if (gestorUid) q = q.where("gestorUid", "==", gestorUid);

    const db = adminDb();
    const snap = await q.get();
    if (snap.empty && gestorUid) {
      return NextResponse.json({ ok: false, error: "SIN_BORRADORES" }, { status: 404 });
    }
    const now = FieldValue.serverTimestamp();
    const batches: FirebaseFirestore.WriteBatch[] = [];
    let batch = db.batch();
    let ops = 0;
    let hasOps = false;
    let closedRows = 0;
    let autoDescansoRows = 0;
    const persistedCuadrillaIds = new Set<string>();

    const pushBatch = () => {
      batches.push(batch);
      batch = db.batch();
      ops = 0;
    };

    for (const docSnap of snap.docs) {
      const data = docSnap.data() as any;
      const estado = String(data?.estado || "ABIERTO");
      if (estado === "CERRADO") continue;
      if (estado !== "CONFIRMADO" && !forzar) continue;

      const cuadSnap = await docSnap.ref.collection("cuadrillas").get();
      for (const c of cuadSnap.docs) {
        const it = c.data() as any;
        const cuadrillaId = String(it.cuadrillaId || c.id);
        const rowId = `${fecha}_${cuadrillaId}`;
        const rowRef = db.collection("asistencia_cuadrillas").doc(rowId);
        batch.set(
          rowRef,
          {
            fecha,
            cuadrillaId,
            cuadrillaNombre: it.cuadrillaNombre || "",
            gestorUid: data?.gestorUid || "",
            gestorNombre: data?.gestorNombre || "",
            coordinadorUid: it.coordinadorUid || "",
            coordinadorNombre: it.coordinadorNombre || "",
            zonaId: it.zonaId || "",
            zonaNombre: it.zonaNombre || "",
            estadoAsistencia: it.estadoAsistencia || "asistencia",
            tecnicosIds: it.tecnicosIds || [],
            observacion: it.observacion || "",
            confirmadoAt: data?.confirmadoAt || null,
            confirmadoBy: data?.confirmadoBy || "",
            cerradoAt: now,
            cerradoBy: session.uid,
          },
          { merge: true }
        );
        ops++;
        hasOps = true;
        closedRows++;
        persistedCuadrillaIds.add(cuadrillaId);
        if (ops >= 450) pushBatch();

        const tecnicos = Array.isArray(it.tecnicosIds) ? it.tecnicosIds : [];
        for (const tId of tecnicos) {
          const tRef = db.collection("asistencia_tecnicos").doc(`${fecha}_${tId}`);
          batch.set(
            tRef,
            {
              fecha,
              tecnicoId: tId,
              cuadrillaId,
              estadoAsistencia: it.estadoAsistencia || "asistencia",
              confirmadoAt: data?.confirmadoAt || null,
              confirmadoBy: data?.confirmadoBy || "",
              cerradoAt: now,
              cerradoBy: session.uid,
            },
            { merge: true }
          );
          ops++;
          hasOps = true;
          if (ops >= 450) pushBatch();
        }
      }

      batch.set(
        docSnap.ref,
        {
          estado: "CERRADO",
          cerradoAt: now,
          cerradoBy: session.uid,
        },
        { merge: true }
      );
      ops++;
      hasOps = true;
      if (ops >= 450) pushBatch();
    }

    if (!gestorUid) {
      const [program, cuadrillasSnap, asignacion, usuariosSnap] = await Promise.all([
        getProgramForDate(fecha),
        db
          .collection("cuadrillas")
          .where("area", "==", "INSTALACIONES")
          .where("estado", "==", "HABILITADO")
          .get(),
        getAsignacionData(fecha),
        db.collection("usuarios").get(),
      ]);

      const progItems = (program?.items || {}) as Record<string, Record<string, string>>;
      const cuadrillas = cuadrillasSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const userMap = new Map(
        usuariosSnap.docs.map((d) => {
          const data = d.data() as any;
          const nombres = String(data?.nombres || "").trim();
          const apellidos = String(data?.apellidos || "").trim();
          const full = `${nombres} ${apellidos}`.trim() || d.id;
          return [d.id, shortName(full, d.id)];
        })
      );

      const assignedByCuadrilla = new Map<string, string>();
      const assignSource = Object.keys(asignacion.day || {}).length ? asignacion.day : asignacion.base;
      for (const [uid, cuadrillaIds] of Object.entries(assignSource || {})) {
        for (const cuadrillaId of Array.isArray(cuadrillaIds) ? cuadrillaIds : []) {
          const key = String(cuadrillaId || "").trim();
          if (key && !assignedByCuadrilla.has(key)) {
            assignedByCuadrilla.set(key, String(uid || "").trim());
          }
        }
      }

      for (const cuadrilla of cuadrillas) {
        const cuadrillaId = String(cuadrilla.id || "").trim();
        if (!cuadrillaId || persistedCuadrillaIds.has(cuadrillaId)) continue;

        const estadoProgramado = String(progItems?.[cuadrillaId]?.[fecha] || "")
          .trim()
          .toLowerCase();
        if (estadoProgramado !== "descanso") continue;

        const gestorAsignadoUid =
          assignedByCuadrilla.get(cuadrillaId) || String(cuadrilla?.gestorUid || "").trim();

        const rowRef = db.collection("asistencia_cuadrillas").doc(`${fecha}_${cuadrillaId}`);
        batch.set(
          rowRef,
          {
            fecha,
            cuadrillaId,
            cuadrillaNombre: cuadrilla?.nombre || cuadrillaId,
            gestorUid: gestorAsignadoUid,
            gestorNombre: gestorAsignadoUid ? userMap.get(gestorAsignadoUid) || gestorAsignadoUid : "",
            coordinadorUid: cuadrilla?.coordinadorUid || "",
            coordinadorNombre: cuadrilla?.coordinadorUid
              ? userMap.get(String(cuadrilla.coordinadorUid)) || cuadrilla.coordinadorUid
              : "",
            zonaId: cuadrilla?.zonaId || "",
            zonaNombre: cuadrilla?.zonaNombre || cuadrilla?.zona || "",
            estadoAsistencia: "descanso",
            tecnicosIds: [],
            observacion: "",
            confirmadoAt: null,
            confirmadoBy: "",
            cerradoAt: now,
            cerradoBy: session.uid,
            origen: "AUTO_BACKFILL_DESCANSO",
          },
          { merge: true }
        );
        ops++;
        hasOps = true;
        autoDescansoRows++;
        persistedCuadrillaIds.add(cuadrillaId);
        if (ops >= 450) pushBatch();
      }
    }

    if (!hasOps) {
      return NextResponse.json({ ok: false, error: "SIN_BORRADORES" }, { status: 404 });
    }

    if (hasOps) batches.push(batch);
    for (const b of batches) {
      await b.commit();
    }

    return NextResponse.json({
      ok: true,
      resumen: {
        cerradasDesdeBorrador: closedRows,
        descansoAutocompletado: autoDescansoRows,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
