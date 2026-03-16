import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH") || roles.includes("SUPERVISOR") || roles.includes("SEGURIDAD");
    if (!canAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const fecha = String(searchParams.get("fecha") || "").trim();
    const desde = String(searchParams.get("desde") || "").trim();
    const hasta = String(searchParams.get("hasta") || "").trim();
    const gestorUid = String(searchParams.get("gestorUid") || "").trim();
    const coordinadorUid = String(searchParams.get("coordinadorUid") || "").trim();
    const zonaId = String(searchParams.get("zonaId") || "").trim();

    if (!fecha && !(desde && hasta)) {
      return NextResponse.json({ ok: false, error: "FECHA_REQUIRED" }, { status: 400 });
    }

    const db = adminDb();

    const buildQuery = (col: string) => {
      let q: FirebaseFirestore.Query = db.collection(col);
      if (desde && hasta) {
        q = q.where("fecha", ">=", desde).where("fecha", "<=", hasta);
      } else {
        q = q.where("fecha", "==", fecha);
      }
      return q;
    };

    const [cuadSnap, tecSnap] = await Promise.all([
      buildQuery("asistencia_cuadrillas").get(),
      buildQuery("asistencia_tecnicos").get(),
    ]);

    const cuadrillasRaw = cuadSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const cuadrillaMap = new Map(
      cuadrillasRaw.map((c: any) => [String(c.cuadrillaId || ""), c])
    );

    const tecnicosRaw = tecSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const uidSet = new Set<string>();
    cuadrillasRaw.forEach((c: any) => {
      if (c.gestorUid) uidSet.add(String(c.gestorUid));
      if (c.coordinadorUid) uidSet.add(String(c.coordinadorUid));
      if (c.confirmadoBy) uidSet.add(String(c.confirmadoBy));
      if (c.cerradoBy) uidSet.add(String(c.cerradoBy));
    });
    tecnicosRaw.forEach((t: any) => {
      if (t.tecnicoId) uidSet.add(String(t.tecnicoId));
    });

    const uids = Array.from(uidSet);
    const userRefs = uids.map((uid) => db.collection("usuarios").doc(uid));
    const userSnaps = uids.length ? await db.getAll(...userRefs) : [];
    const userMap = new Map(
      userSnaps.map((s, i) => {
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const full = `${nombres} ${apellidos}`.trim() || uids[i] || s.id;
        return [uids[i] || s.id, shortName(full, s.id)];
      })
    );

    const decorateCuadrilla = (c: any) => {
      const gestorNombre = c.gestorUid ? userMap.get(String(c.gestorUid)) || c.gestorUid : "";
      const coordinadorNombre = c.coordinadorUid
        ? userMap.get(String(c.coordinadorUid)) || c.coordinadorUid
        : "";
      const confirmadoPorNombre = c.confirmadoBy
        ? userMap.get(String(c.confirmadoBy)) || c.confirmadoBy
        : "";
      const cerradoPorNombre = c.cerradoBy
        ? userMap.get(String(c.cerradoBy)) || c.cerradoBy
        : "";
      return {
        ...c,
        gestorNombre,
        coordinadorNombre,
        confirmadoPorNombre,
        cerradoPorNombre,
      };
    };

    let cuadrillas = cuadrillasRaw.map(decorateCuadrilla);

    if (gestorUid) cuadrillas = cuadrillas.filter((c: any) => String(c.gestorUid || "") === gestorUid);
    if (coordinadorUid)
      cuadrillas = cuadrillas.filter((c: any) => String(c.coordinadorUid || "") === coordinadorUid);
    if (zonaId) cuadrillas = cuadrillas.filter((c: any) => String(c.zonaId || "") === zonaId);

    const cuadrillaIdsFiltered = new Set(cuadrillas.map((c: any) => String(c.cuadrillaId || "")));

    const tecnicos = tecnicosRaw
      .map((t: any) => {
        const cuad = cuadrillaMap.get(String(t.cuadrillaId || ""));
        const gestorNombre = cuad?.gestorUid ? userMap.get(String(cuad.gestorUid)) || cuad.gestorUid : "";
        const coordinadorNombre = cuad?.coordinadorUid
          ? userMap.get(String(cuad.coordinadorUid)) || cuad.coordinadorUid
          : "";
        return {
          ...t,
          tecnicoNombre: t.tecnicoId ? userMap.get(String(t.tecnicoId)) || t.tecnicoId : "",
          cuadrillaNombre: cuad?.cuadrillaNombre || "",
          gestorUid: cuad?.gestorUid || "",
          gestorNombre,
          coordinadorUid: cuad?.coordinadorUid || "",
          coordinadorNombre,
          zonaId: cuad?.zonaId || "",
          zonaNombre: cuad?.zonaNombre || "",
          confirmadoBy: cuad?.confirmadoBy || "",
          confirmadoPorNombre: cuad?.confirmadoPorNombre || "",
          cerradoBy: cuad?.cerradoBy || "",
          cerradoPorNombre: cuad?.cerradoPorNombre || "",
        };
      })
      .filter((t: any) => {
        if (!gestorUid && !coordinadorUid && !zonaId) return true;
        const id = String(t.cuadrillaId || "");
        return cuadrillaIdsFiltered.has(id);
      });

    return NextResponse.json({ ok: true, fecha, desde, hasta, cuadrillas, tecnicos });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
