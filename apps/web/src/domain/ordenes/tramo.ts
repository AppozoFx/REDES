export const TRAMO_1 = "08:00";
export const TRAMO_2 = "12:00";
export const TRAMO_3 = "16:00";

export type TramoBase = typeof TRAMO_1 | typeof TRAMO_2 | typeof TRAMO_3;

function normalizeHm(v: unknown): string {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const m = /(\d{1,2}):(\d{1,2})(?::\d{1,2})?/.exec(raw);
  if (!m) return raw.slice(0, 5);
  const hh = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  return `${hh}:${mm}`;
}

function isValidHm(hm: string) {
  return /^\d{2}:\d{2}$/.test(hm);
}

export function tramoBaseFromHm(hmRaw: unknown): TramoBase | "" {
  const hm = normalizeHm(hmRaw);
  if (hm === TRAMO_1 || hm === TRAMO_2 || hm === TRAMO_3) return hm;
  if (!isValidHm(hm)) return "";

  const [hTxt, mTxt] = hm.split(":");
  const h = Number(hTxt);
  const m = Number(mTxt);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  if (h < 0 || h > 23 || m < 0 || m > 59) return "";
  if (h < 12) return TRAMO_1;
  if (h < 16) return TRAMO_2;
  return TRAMO_3;
}

export function resolveTramoBase(...hmCandidates: Array<unknown>): TramoBase | "" {
  for (const hm of hmCandidates) {
    const normalized = normalizeHm(hm);
    if (normalized === TRAMO_1 || normalized === TRAMO_2 || normalized === TRAMO_3) {
      return normalized;
    }
  }
  for (const hm of hmCandidates) {
    const base = tramoBaseFromHm(hm);
    if (base) return base;
  }
  return "";
}

export function tramoNombreFromBase(base: unknown) {
  if (base === TRAMO_1) return "Primer Tramo";
  if (base === TRAMO_2) return "Segundo Tramo";
  if (base === TRAMO_3) return "Tercer Tramo";
  return "Tramo no definido";
}

export function resolveTramoNombre(...hmCandidates: Array<unknown>) {
  return tramoNombreFromBase(resolveTramoBase(...hmCandidates));
}
