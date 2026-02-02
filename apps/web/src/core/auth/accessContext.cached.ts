import { cache } from "react";
import { getUserAccessContext } from "./accessContext";

export const getUserAccessContextCached = cache(getUserAccessContext);
