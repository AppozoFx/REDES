import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ maxInstances: 10 });

export { bootstrapAdmin } from "./bootstrapAdmin";
export { usersCreate } from "./usersCreate";
