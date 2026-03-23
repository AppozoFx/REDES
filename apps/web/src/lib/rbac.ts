import { UserAccess } from "@/types/auth";

export function canAccess(
  user: UserAccess,
  opts: { roles?: string[]; areas?: string[] }
) {
  if (user.isAdmin) return true;

  if (opts.roles?.length) {
    if (!opts.roles.some(r => user.roles.includes(r))) return false;
  }

  if (opts.areas?.length) {
    if (!opts.areas.some(a => user.areas.includes(a))) return false;
  }

  return true;
}
