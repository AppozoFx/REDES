import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  CuadrillaCreateSchema,
  CuadrillaMantCreateSchema,
  CuadrillaUpdateSchema,
  ZonaTipoSchema,
} from "./schemas";
import { ymdToTimestamp } from "@/lib/dates";

export const CUADRILLAS_COL = "cuadrillas";
export const CUADRILLAS_NUMBERS_COL = "cuadrillas_numbers"; // docId: INST_{categoria}_{numero}
export const CUADRILLAS_COUNTERS_COL = "cuadrillas_counters"; // docId: CATEGORIA

export function cuadrillasCol() {
  return adminDb().collection(CUADRILLAS_COL);
}

export function cuadrillasNumbersCol() { return adminDb().collection(CUADRILLAS_NUMBERS_COL); }

export function cuadrillasCountersCol() { return adminDb().collection(CUADRILLAS_COUNTERS_COL); }

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeUpper(s: string) {
  return normalizeSpaces(s).toUpperCase();
}

function normalizePlaca(s: string) {
  return normalizeUpper(s);
}

function computeVigencia(ts: Timestamp | null | undefined): "NO_CUENTA" | "VIGENTE" | "VENCIDA" {
  if (!ts) return "NO_CUENTA";
  const now = new Date();
  const d = ts.toDate();
  return now <= d ? "VIGENTE" : "VENCIDA";
}

export async function listCuadrillas() {
  const qs = await cuadrillasCol()
    .orderBy("categoria", "desc")
    .orderBy("numeroCuadrilla", "asc")
    .get();
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function getCuadrillaById(id: string) {
  const snap = await cuadrillasCol().doc(id).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as any) } as any) : null;
}

async function getZonaIfHabilitada(zonaId: string): Promise<{ id: string; tipo: string } | null> {
  const snap = await adminDb().collection("zonas").doc(zonaId).get();
  if (!snap.exists) return null;
  const z = snap.data() as any;
  if (z.estado !== "HABILITADO") return null;
  return { id: snap.id, tipo: z.tipo } as any;
}

async function getUsuariosAccessByUids(uids: string[]) {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  if (!unique.length) return new Map<string, any>();
  const refs = unique.map((uid) => adminDb().collection("usuarios_access").doc(uid));
  const snaps = await adminDb().getAll(...refs);
  return new Map(snaps.map((s) => [s.id, s.exists ? (s.data() as any) : null]));
}

function assertRole(access: any | null, role: string, label: string) {
  if (!access || !Array.isArray(access.roles) || !access.roles.includes(role)) {
    throw new Error(`${label}_ROL_INVALIDO`);
  }
}

function hasArea(access: any | null, area: string) {
  if (!access || !Array.isArray(access.areas)) return false;
  return access.areas.includes(area);
}

async function assertTecnicosNoAsignados(tecnicos: string[], exceptId?: string) {
  const db = adminDb();
  for (const uid of tecnicos) {
    const qs = await db
      .collection(CUADRILLAS_COL)
      .where("tecnicosUids", "array-contains", uid)
      .get();
    const conflict = qs.docs.find((d) => (exceptId ? d.id !== exceptId : true));
    if (conflict) {
      throw new Error("TECNICO_OCUPADO");
    }
  }
}

async function assertTecnicosNoAsignadosInArea(tecnicos: string[], area: string, exceptId?: string) {
  const db = adminDb();
  for (const uid of tecnicos) {
    const qs = await db
      .collection(CUADRILLAS_COL)
      .where("area", "==", area)
      .where("tecnicosUids", "array-contains", uid)
      .get();
    const conflict = qs.docs.find((d) => (exceptId ? d.id !== exceptId : true));
    if (conflict) {
      throw new Error("TECNICO_OCUPADO");
    }
  }
}

export async function createCuadrilla(input: unknown, actorUid: string): Promise<{ id: string }> {
  const parsed = CuadrillaCreateSchema.parse(input);

  const categoria = parsed.categoria;
  const zonaId = parsed.zonaId?.trim() || undefined;
  const placa = parsed.placa ? normalizePlaca(parsed.placa) : undefined;
  const estado = parsed.estado ?? "HABILITADO";

  let zona: { id: string; tipo: string } | null = null;
  if (zonaId) {
    zona = await getZonaIfHabilitada(zonaId);
    if (!zona) throw new Error("ZONA_INVALIDA");
  }

  // Validación de roles y conductor
  const tecnicos = Array.isArray(parsed.tecnicosUids) ? parsed.tecnicosUids : [];
  const coordinador = parsed.coordinadorUid ?? undefined;
  const gestor = parsed.gestorUid ?? undefined;
  const conductor = parsed.conductorUid ?? undefined;

  if (conductor && !tecnicos.includes(conductor)) throw new Error("CONDUCTOR_NO_EN_TECNICOS");

  const allUids: string[] = [
    ...tecnicos,
    ...(coordinador ? [coordinador] : []),
    ...(gestor ? [gestor] : []),
    ...(conductor ? [conductor] : []),
  ];
  const accessMap = await getUsuariosAccessByUids(allUids);
  if (tecnicos.length) {
    tecnicos.forEach((uid) => {
      const access = accessMap.get(uid);
      assertRole(access, "TECNICO", "TECNICO");
      if (!hasArea(access, "INSTALACIONES")) throw new Error("TECNICO_AREA_INVALIDA");
    });
  }
  if (coordinador) assertRole(accessMap.get(coordinador), "COORDINADOR", "COORDINADOR");
  if (gestor) assertRole(accessMap.get(gestor), "GESTOR", "GESTOR");
  if (conductor) assertRole(accessMap.get(conductor), "TECNICO", "CONDUCTOR");

  // Evitar asignar técnicos ya ocupados en otras cuadrillas
  if (tecnicos.length) {
    await assertTecnicosNoAsignados(tecnicos);
  }

  // Derivados
  const r_c = categoria;
  const vehiculo = categoria === "CONDOMINIO" ? "MOTO" : "AUTO";
  // Fechas -> Timestamps y estados
  const licTs = parsed.licenciaVenceAt ? ymdToTimestamp(parsed.licenciaVenceAt) : null;
  const soatTs = parsed.soatVenceAt ? ymdToTimestamp(parsed.soatVenceAt) : null;
  const revTs = parsed.revTecVenceAt ? ymdToTimestamp(parsed.revTecVenceAt) : null;

  const licenciaEstado = computeVigencia(licTs ?? undefined);
  const soatEstado = computeVigencia(soatTs ?? undefined);
  const revTecEstado = computeVigencia(revTs ?? undefined);

  const db = adminDb();

      const result = await db.runTransaction(async (tx) => {
    const counterRef = cuadrillasCountersCol().doc(categoria);
    const counterSnap = await tx.get(counterRef);
    const lastNumero = (counterSnap.exists ? (counterSnap.data() as any)?.lastNumero : 0) || 0;
    const numero = Number(lastNumero) + 1;

    const id = categoria === "CONDOMINIO" ? `K${numero}_MOTO` : `K${numero}_RESIDENCIAL`;
    const nombre = categoria === "CONDOMINIO" ? `K${numero} MOTO` : `K${numero} RESIDENCIAL`;

    const lockId = `INST_${categoria}_${numero}`;
    const lockRef = cuadrillasNumbersCol().doc(lockId);
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists) throw new Error("CUADRILLA_NUMERO_DUPLICADO");

    const docRef = cuadrillasCol().doc(id);
    const docSnap = await tx.get(docRef);
    if (docSnap.exists) throw new Error("CUADRILLA_ID_CONFLICT");

    tx.set(counterRef, { lastNumero: numero }, { merge: true });
    tx.set(lockRef, { area: "INSTALACIONES", categoria, numero, createdAt: FieldValue.serverTimestamp(), createdBy: actorUid });

    const data: Record<string, any> = {
      nombre,
      area: "INSTALACIONES",
      categoria,
      r_c,
      numeroCuadrilla: numero,
      vehiculo,
      estado,
      audit: {
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actorUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
      },
    };

    if (parsed.vehiculoModelo !== undefined && parsed.vehiculoModelo !== "") data.vehiculoModelo = parsed.vehiculoModelo;
    if (parsed.vehiculoMarca !== undefined && parsed.vehiculoMarca !== "") data.vehiculoMarca = parsed.vehiculoMarca;
    if (zona) { data.zonaId = zona.id; data.tipoZona = zona.tipo; }
    if (placa) data.placa = placa;
    if (tecnicos.length) data.tecnicosUids = tecnicos;
    if (coordinador) data.coordinadorUid = coordinador;
    if (gestor) data.gestorUid = gestor;
    if (conductor) data.conductorUid = conductor;
    if (parsed.licenciaNumero !== undefined) data.licenciaNumero = parsed.licenciaNumero || null;
    if (licTs !== null && licTs !== undefined) data.licenciaVenceAt = licTs;
    data.licenciaEstado = licenciaEstado;
    if (soatTs !== null && soatTs !== undefined) data.soatVenceAt = soatTs;
    data.soatEstado = soatEstado;
    if (revTs !== null && revTs !== undefined) data.revTecVenceAt = revTs;
    data.revTecEstado = revTecEstado;
    if (parsed.credUsuario !== undefined) data.credUsuario = parsed.credUsuario || null;
    if (parsed.credPassword !== undefined) data.credPassword = parsed.credPassword || null;
    if (parsed.lat !== undefined) data.lat = parsed.lat;
    if (parsed.lng !== undefined) data.lng = parsed.lng;

    tx.set(docRef, data);
    return { id };
  });
  return result;
}

export async function createCuadrillaMantenimiento(input: unknown, actorUid: string): Promise<{ id: string }> {
  const parsed = CuadrillaMantCreateSchema.parse(input);
  const zona = normalizeUpper(parsed.zona);
  const turno = normalizeUpper(parsed.turno || "");
  const estado = parsed.estado ?? "HABILITADO";

  const turnoLabel = turno === "MANANA" ? "MAÑANA" : turno;
  const baseNombre = `MANTENIMIENTO ${zona}${turnoLabel ? ` ${turnoLabel}` : ""}`;
  const baseIdSource = `MANTENIMIENTO ${zona}${turno ? ` ${turno}` : ""}`;
  const baseId = baseIdSource.replace(/\s+/g, "_");

  const tecnicos = Array.isArray(parsed.tecnicosUids) ? parsed.tecnicosUids : [];
  const coordinador = parsed.coordinadorUid ?? undefined;
  const gestor = parsed.gestorUid ?? undefined;

  const allUids: string[] = [
    ...tecnicos,
    ...(coordinador ? [coordinador] : []),
    ...(gestor ? [gestor] : []),
  ];
  const accessMap = await getUsuariosAccessByUids(allUids);
  if (tecnicos.length) {
    tecnicos.forEach((uid) => {
      const access = accessMap.get(uid);
      assertRole(access, "TECNICO", "TECNICO");
      if (!hasArea(access, "MANTENIMIENTO")) {
        throw new Error("TECNICO_AREA_INVALIDA");
      }
    });
  }
  if (coordinador) {
    const access = accessMap.get(coordinador);
    assertRole(access, "COORDINADOR", "COORDINADOR");
    if (!hasArea(access, "MANTENIMIENTO")) throw new Error("COORDINADOR_AREA_INVALIDA");
  }
  if (gestor) {
    const access = accessMap.get(gestor);
    assertRole(access, "GESTOR", "GESTOR");
    if (!hasArea(access, "MANTENIMIENTO")) throw new Error("GESTOR_AREA_INVALIDA");
  }

  if (tecnicos.length) {
    await assertTecnicosNoAsignadosInArea(tecnicos, "MANTENIMIENTO");
  }

  const db = adminDb();

  const result = await db.runTransaction(async (tx) => {
    let suffix = 0;
    let id = baseId;
    let nombre = baseNombre;
    while (suffix < 25) {
      const docRef = cuadrillasCol().doc(id);
      const docSnap = await tx.get(docRef);
      if (!docSnap.exists) break;
      suffix += 1;
      id = `${baseId}_${suffix + 1}`;
      nombre = `${baseNombre} ${suffix + 1}`;
    }

    const docRef = cuadrillasCol().doc(id);
    const docSnap = await tx.get(docRef);
    if (docSnap.exists) throw new Error("CUADRILLA_ID_CONFLICT");

    const data: Record<string, any> = {
      nombre,
      area: "MANTENIMIENTO",
      zona,
      turno,
      estado,
      audit: {
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actorUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
      },
    };

    if (tecnicos.length) data.tecnicosUids = tecnicos;
    if (coordinador) data.coordinadorUid = coordinador;
    if (gestor) data.gestorUid = gestor;

    tx.set(docRef, data);
    return { id };
  });

  return result;
}

export async function updateCuadrilla(id: string, patchInput: unknown, actorUid: string) {
  const patch = CuadrillaUpdateSchema.parse(patchInput);
  const snap = await cuadrillasCol().doc(id).get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const curr = snap.data() as any;

  // Construir estado resultante para validaciones de consistencia
  const next: any = { ...curr };

  if (patch.placa !== undefined) next.placa = normalizePlaca(patch.placa);
  if (patch.tecnicosUids !== undefined) next.tecnicosUids = patch.tecnicosUids;
  if (patch.coordinadorUid !== undefined) next.coordinadorUid = patch.coordinadorUid;
  if (patch.gestorUid !== undefined) next.gestorUid = patch.gestorUid;
  if (patch.conductorUid !== undefined) next.conductorUid = patch.conductorUid;
  if (patch.estado !== undefined) next.estado = patch.estado;

  // Fechas convertidas desde strings (nullable permitida)
  const licTs = patch.licenciaVenceAt === undefined
    ? (curr.licenciaVenceAt ?? null)
    : (patch.licenciaVenceAt ? ymdToTimestamp(patch.licenciaVenceAt) : null);
  const soatTs = patch.soatVenceAt === undefined
    ? (curr.soatVenceAt ?? null)
    : (patch.soatVenceAt ? ymdToTimestamp(patch.soatVenceAt) : null);
  const revTs = patch.revTecVenceAt === undefined
    ? (curr.revTecVenceAt ?? null)
    : (patch.revTecVenceAt ? ymdToTimestamp(patch.revTecVenceAt) : null);

  next.licenciaVenceAt = licTs ?? undefined;
  next.soatVenceAt = soatTs ?? undefined;
  next.revTecVenceAt = revTs ?? undefined;

  next.licenciaNumero = patch.licenciaNumero === undefined ? curr.licenciaNumero : (patch.licenciaNumero || undefined);
  next.credUsuario = patch.credUsuario === undefined ? curr.credUsuario : (patch.credUsuario || undefined);
  next.credPassword = patch.credPassword === undefined ? curr.credPassword : (patch.credPassword || undefined);
  next.vehiculoModelo = patch.vehiculoModelo === undefined ? curr.vehiculoModelo : (patch.vehiculoModelo || undefined);
  next.vehiculoMarca = patch.vehiculoMarca === undefined ? curr.vehiculoMarca : (patch.vehiculoMarca || undefined);
  next.lat = patch.lat === undefined ? curr.lat : (patch.lat ?? undefined);
  next.lng = patch.lng === undefined ? curr.lng : (patch.lng ?? undefined);

  // Validaciones de roles
  const tecnicos: string[] = Array.isArray(next.tecnicosUids) ? next.tecnicosUids : [];
  const coord: string = next.coordinadorUid;
  const gest: string = next.gestorUid;
  const cond: string = next.conductorUid;

  if (!tecnicos.includes(cond)) throw new Error("CONDUCTOR_NO_EN_TECNICOS");
  const accessMap = await getUsuariosAccessByUids([...(tecnicos ?? []), coord, gest, cond]);
  tecnicos.forEach((uid) => {
    const access = accessMap.get(uid);
    assertRole(access, "TECNICO", "TECNICO");
    const area = String(curr.area || "").toUpperCase();
    if (area === "INSTALACIONES" && !hasArea(access, "INSTALACIONES")) {
      throw new Error("TECNICO_AREA_INVALIDA");
    }
    if (area === "MANTENIMIENTO" && !hasArea(access, "MANTENIMIENTO")) {
      throw new Error("TECNICO_AREA_INVALIDA");
    }
  });
  if (coord) {
    const access = accessMap.get(coord);
    assertRole(access, "COORDINADOR", "COORDINADOR");
    const area = String(curr.area || "").toUpperCase();
    if (area === "INSTALACIONES" && !hasArea(access, "INSTALACIONES")) {
      throw new Error("COORDINADOR_AREA_INVALIDA");
    }
    if (area === "MANTENIMIENTO" && !hasArea(access, "MANTENIMIENTO")) {
      throw new Error("COORDINADOR_AREA_INVALIDA");
    }
  }
  if (gest) {
    const access = accessMap.get(gest);
    assertRole(access, "GESTOR", "GESTOR");
    const area = String(curr.area || "").toUpperCase();
    if (area === "INSTALACIONES" && !hasArea(access, "INSTALACIONES")) {
      throw new Error("GESTOR_AREA_INVALIDA");
    }
    if (area === "MANTENIMIENTO" && !hasArea(access, "MANTENIMIENTO")) {
      throw new Error("GESTOR_AREA_INVALIDA");
    }
  }
  assertRole(accessMap.get(cond), "TECNICO", "CONDUCTOR");

  // Evitar asignar técnicos ya ocupados en otras cuadrillas (excepto esta misma)
  if (tecnicos.length) {
    await assertTecnicosNoAsignados(tecnicos, id);
  }

  const toSet: Record<string, any> = {};
  if (patch.placa !== undefined) toSet.placa = next.placa;
  if (patch.tecnicosUids !== undefined) toSet.tecnicosUids = next.tecnicosUids;
  if (patch.coordinadorUid !== undefined) toSet.coordinadorUid = next.coordinadorUid;
  if (patch.gestorUid !== undefined) toSet.gestorUid = next.gestorUid;
  if (patch.conductorUid !== undefined) toSet.conductorUid = next.conductorUid;
  if (patch.estado !== undefined) toSet.estado = next.estado;
  if (patch.licenciaNumero !== undefined) toSet.licenciaNumero = next.licenciaNumero ?? null;
  if (patch.licenciaVenceAt !== undefined) toSet.licenciaVenceAt = next.licenciaVenceAt; // puede ser null
  toSet.licenciaEstado = computeVigencia(next.licenciaVenceAt ?? undefined);
  if (patch.soatVenceAt !== undefined) toSet.soatVenceAt = next.soatVenceAt; // puede ser null
  toSet.soatEstado = computeVigencia(next.soatVenceAt ?? undefined);
  if (patch.revTecVenceAt !== undefined) toSet.revTecVenceAt = next.revTecVenceAt; // puede ser null
  toSet.revTecEstado = computeVigencia(next.revTecVenceAt ?? undefined);
  if (patch.credUsuario !== undefined) toSet.credUsuario = next.credUsuario ?? null;
  if (patch.credPassword !== undefined) toSet.credPassword = next.credPassword ?? null;
  if (patch.vehiculoModelo !== undefined) toSet.vehiculoModelo = next.vehiculoModelo ?? null;
  if (patch.vehiculoMarca !== undefined) toSet.vehiculoMarca = next.vehiculoMarca ?? null;
  if (patch.lat !== undefined) toSet.lat = next.lat;
  if (patch.lng !== undefined) toSet.lng = next.lng;

  if (Object.keys(toSet).length === 0) return; // nada que actualizar

  await cuadrillasCol().doc(id).set(
    {
      ...toSet,
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": actorUid,
    },
    { merge: true }
  );
}

export async function disableCuadrilla(id: string, actorUid: string) {
  await cuadrillasCol().doc(id).set(
    {
      estado: "INHABILITADO",
      "audit.deletedAt": FieldValue.serverTimestamp(),
      "audit.deletedBy": actorUid,
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": actorUid,
    },
    { merge: true }
  );
}

export async function enableCuadrilla(id: string, actorUid: string) {
  await cuadrillasCol().doc(id).set(
    {
      estado: "HABILITADO",
      "audit.deletedAt": FieldValue.delete(),
      "audit.deletedBy": FieldValue.delete(),
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": actorUid,
    },
    { merge: true }
  );
}

