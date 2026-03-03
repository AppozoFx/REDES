import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ maxInstances: 10 });

export { bootstrapAdmin } from "./bootstrapAdmin";
export { usersCreate } from "./usersCreate";
export { telegramWebhook } from "./telegram/webhook";
export { telegramPendientesReminder } from "./telegram/webhook";
export { telegramPreliqRetryWorker } from "./telegram/webhook";
