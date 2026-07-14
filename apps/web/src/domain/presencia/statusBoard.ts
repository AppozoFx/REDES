import { adminDb } from "@/lib/firebase/admin";
import { listUsuariosAccess } from "@/domain/usuarios/service";
import type { Genero } from "@/types/usuarios";
import { isAvatarHairKey, isAvatarSkinKey } from "@/domain/presencia/avatarPalette";

export type StatusPersonState =
  | "online"
  | "en_gestion"
  | "refrigerio"
  | "llamada"
  | "finalizado"
  | "ausente_jornada"
  | "ausente_sin_ingreso"
  | "away";

export type StatusPerson = {
  uid: string;
  nombre: string;
  genero: Genero;
  avatarSkin?: string;
  avatarHair?: string;
  roles: string[];
  state: StatusPersonState;
  lastSeenAt: string | null;
};

export type StatusRoom = {
  id: string;
  title: string;
  roleLabel: string;
  people: StatusPerson[];
};

export type StatusBoardData = {
  generatedAt: string;
  rooms: StatusRoom[];
  campo: { title: string; roleLabel: string; online: number; total: number };
};

const ROOM_DEFS: Array<{ id: string; title: string; roleLabel: string; roles: string[] }> = [
  { id: "gestion", title: "Gestión", roleLabel: "GESTOR", roles: ["GESTOR"] },
  { id: "coordinacion", title: "Coordinación", roleLabel: "COORDINADOR", roles: ["COORDINADOR"] },
  { id: "supervision", title: "Supervisión", roleLabel: "SUPERVISOR", roles: ["SUPERVISOR"] },
  { id: "direccion", title: "Dirección · Jefatura", roleLabel: "GERENCIA / JEFATURA", roles: ["GERENCIA", "JEFATURA"] },
  { id: "soporte", title: "RRHH · Seguridad", roleLabel: "RRHH / SEGURIDAD", roles: ["RRHH", "SEGURIDAD"] },
  { id: "ti", title: "TI · Almacén", roleLabel: "TI / ALMACEN", roles: ["TI", "ALMACEN"] },
];

const CAMPO_ROLES = ["TECNICO"];
const ONLINE_GRACE_MS = 2 * 60 * 1000;
const LLAMADA_GRACE_MS = 30 * 1000;

function todayLimaYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  const anyV = v as any;
  if (typeof anyV?.toMillis === "function") return Number(anyV.toMillis()) || 0;
  if (typeof anyV?.toDate === "function") {
    const d = anyV.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

function shortName(nombres: unknown, apellidos: unknown, fallback: string): string {
  const n = String(nombres || "").trim().split(/\s+/).filter(Boolean);
  const a = String(apellidos || "").trim().split(/\s+/).filter(Boolean);
  const first = n[0] || "";
  const firstLast = a[0] || "";
  const out = `${first} ${firstLast}`.trim();
  return out || fallback;
}

export async function getStatusBoard(): Promise<StatusBoardData> {
  const rows = await listUsuariosAccess(600);
  const uids = rows.map((r) => String(r.uid || "")).filter(Boolean);
  const ymd = todayLimaYmd();

  const profileRefs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
  const presenceRefs = uids.map((uid) => adminDb().collection("usuarios_presencia").doc(uid));
  const [profileSnaps, presenceSnaps, jornadasSnap, llamadasSnap] = await Promise.all([
    profileRefs.length ? adminDb().getAll(...profileRefs) : Promise.resolve([] as any[]),
    presenceRefs.length ? adminDb().getAll(...presenceRefs) : Promise.resolve([] as any[]),
    adminDb().collection("gestor_jornadas").where("ymd", "==", ymd).get(),
    adminDb().collection("ordenes").where("llamadaUpdatedYmd", "==", ymd).limit(3000).get(),
  ]);

  const profileByUid = new Map<string, any>(profileSnaps.map((s: any) => [s.id, (s.data() as any) || {}]));
  const presenceByUid = new Map<string, any>(presenceSnaps.map((s: any) => [s.id, (s.data() as any) || {}]));
  const jornadaByUid = new Map<string, any>();
  for (const doc of jornadasSnap.docs) {
    const data = doc.data() as any;
    const uid = String(data?.uid || "");
    if (uid) jornadaByUid.set(uid, data);
  }
  const lastLlamadaByUid = new Map<string, number>();
  for (const doc of llamadasSnap.docs) {
    const data = doc.data() as any;
    const uid = String(data?.llamadaUpdatedBy || "");
    if (!uid) continue;
    const ms = toMillis(data?.llamadaUpdatedAt);
    if (ms > (lastLlamadaByUid.get(uid) || 0)) lastLlamadaByUid.set(uid, ms);
  }
  const now = Date.now();

  const people: StatusPerson[] = rows.map((r) => {
    const uid = String(r.uid || "");
    const profile = profileByUid.get(uid) || {};
    const presence = presenceByUid.get(uid) || {};
    const lastSeenMs = toMillis(presence?.lastSeenAt) || toMillis(presence?.updatedAt);
    const online = !!presence?.online && lastSeenMs > 0 && now - lastSeenMs <= ONLINE_GRACE_MS;
    const roles = Array.isArray(r.roles) ? r.roles.map((x: any) => String(x || "").toUpperCase()) : [];

    let state: StatusPersonState = online ? "online" : "away";
    if (roles.includes("GESTOR")) {
      const jornada = jornadaByUid.get(uid);
      const estadoTurno = String(jornada?.estadoTurno || "").toUpperCase();

      if (estadoTurno === "FINALIZADO") {
        // Gana siempre: el heartbeat general puede seguir marcando online=true
        // (pestaña abierta) aunque el gestor ya haya cerrado su turno.
        state = "finalizado";
      } else if (online) {
        const lastLlamadaMs = lastLlamadaByUid.get(uid) || 0;
        if (estadoTurno === "EN_REFRIGERIO") {
          state = "refrigerio";
        } else if (lastLlamadaMs > 0 && now - lastLlamadaMs <= LLAMADA_GRACE_MS) {
          state = "llamada";
        } else {
          state = "en_gestion";
        }
      } else if (jornada && (estadoTurno === "EN_TURNO" || estadoTurno === "EN_REFRIGERIO")) {
        // Marco ingreso hoy y no cerro turno, pero ahora esta desconectado.
        state = "ausente_jornada";
      } else {
        // Nunca marco ingreso hoy.
        state = "ausente_sin_ingreso";
      }
    }

    const avatarSkin = isAvatarSkinKey(profile?.avatar?.skin) ? profile.avatar.skin : undefined;
    const avatarHair = isAvatarHairKey(profile?.avatar?.hair) ? profile.avatar.hair : undefined;

    return {
      uid,
      nombre: shortName(profile?.nombres, profile?.apellidos, uid),
      genero: (profile?.genero as Genero) || "NO_ESPECIFICA",
      avatarSkin,
      avatarHair,
      roles,
      state,
      lastSeenAt: lastSeenMs > 0 ? new Date(lastSeenMs).toISOString() : null,
    };
  });

  const rooms: StatusRoom[] = ROOM_DEFS.map((def) => ({
    id: def.id,
    title: def.title,
    roleLabel: def.roleLabel,
    people: people.filter((p) => p.roles.some((role) => def.roles.includes(role))),
  })).filter((room) => room.people.length > 0);

  const campoPeople = people.filter((p) => p.roles.some((role) => CAMPO_ROLES.includes(role)));

  return {
    generatedAt: new Date().toISOString(),
    rooms,
    campo: {
      title: "Campo",
      roleLabel: "TECNICO",
      online: campoPeople.filter((p) => p.state === "online").length,
      total: campoPeople.length,
    },
  };
}
