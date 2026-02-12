import { cache } from "react";
import { getUserAccessContext } from "./accessContext";

// En desarrollo, evita cache para prevenir roles/estados obsoletos
export const getUserAccessContextCached =
  process.env.NODE_ENV === "production"
    ? cache(getUserAccessContext)
    : getUserAccessContext;
