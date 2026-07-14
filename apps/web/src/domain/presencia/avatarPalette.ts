export const AVATAR_SKINS: Record<string, string> = {
  S1: "#e8b487",
  S2: "#c98a58",
  S3: "#8a5a35",
};

export const AVATAR_HAIRS: Record<string, string> = {
  H1: "#2b2338",
  H2: "#5c3a21",
  H3: "#1c1c1c",
  H4: "#7a4a2b",
};

export const AVATAR_SKIN_KEYS = Object.keys(AVATAR_SKINS);
export const AVATAR_HAIR_KEYS = Object.keys(AVATAR_HAIRS);

export function isAvatarSkinKey(v: unknown): v is string {
  return typeof v === "string" && v in AVATAR_SKINS;
}

export function isAvatarHairKey(v: unknown): v is string {
  return typeof v === "string" && v in AVATAR_HAIRS;
}

function hashCode(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

/** Elige un tono/color determinístico a partir del uid, para usuarios que aún no personalizaron su avatar. */
export function fallbackAvatarKeys(uid: string): { skin: string; hair: string } {
  return {
    skin: AVATAR_SKIN_KEYS[hashCode(uid) % AVATAR_SKIN_KEYS.length],
    hair: AVATAR_HAIR_KEYS[hashCode(`${uid}-hair`) % AVATAR_HAIR_KEYS.length],
  };
}

export function resolveAvatarHex(
  uid: string,
  avatarSkin?: string | null,
  avatarHair?: string | null
): { skin: string; hair: string } {
  const fallback = fallbackAvatarKeys(uid);
  const skinKey = isAvatarSkinKey(avatarSkin) ? avatarSkin : fallback.skin;
  const hairKey = isAvatarHairKey(avatarHair) ? avatarHair : fallback.hair;
  return { skin: AVATAR_SKINS[skinKey], hair: AVATAR_HAIRS[hairKey] };
}
