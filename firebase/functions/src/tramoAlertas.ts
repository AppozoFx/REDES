import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

const WEB_APP_BASE_URL = defineString("WEB_APP_BASE_URL", { default: "" });
const CRON_TOKEN = defineSecret("CRON_TOKEN");

async function callTramoAlertas(baseUrl: string, token: string): Promise<void> {
  const url = `${baseUrl}/api/cron/tramo-alertas`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-cron-token": token },
  });
  const text = await response.text();
  if (!response.ok) {
    logger.error("tramoAlertas failed", { status: response.status, body: text });
    throw new Error(`TRAMO_ALERTAS_HTTP_${response.status}`);
  }
  logger.info("tramoAlertas completed", { body: text });
}

const scheduleOpts = (schedule: string) => ({
  region: "us-central1" as const,
  schedule,
  timeZone: "America/Lima",
  secrets: [CRON_TOKEN],
});

export const tramoAlerta1 = onSchedule(scheduleOpts("0 8 * * *"), async () => {
  const baseUrl = String(WEB_APP_BASE_URL.value() || "").replace(/\/$/, "");
  if (!baseUrl) { logger.error("WEB_APP_BASE_URL not configured"); return; }
  await callTramoAlertas(baseUrl, CRON_TOKEN.value());
});

export const tramoAlerta2 = onSchedule(scheduleOpts("0 12 * * *"), async () => {
  const baseUrl = String(WEB_APP_BASE_URL.value() || "").replace(/\/$/, "");
  if (!baseUrl) { logger.error("WEB_APP_BASE_URL not configured"); return; }
  await callTramoAlertas(baseUrl, CRON_TOKEN.value());
});

export const tramoAlerta3 = onSchedule(scheduleOpts("0 16 * * *"), async () => {
  const baseUrl = String(WEB_APP_BASE_URL.value() || "").replace(/\/$/, "");
  if (!baseUrl) { logger.error("WEB_APP_BASE_URL not configured"); return; }
  await callTramoAlertas(baseUrl, CRON_TOKEN.value());
});

export const tramoAlertaCierreRuta = onSchedule(scheduleOpts("0 17 * * *"), async () => {
  const baseUrl = String(WEB_APP_BASE_URL.value() || "").replace(/\/$/, "");
  if (!baseUrl) { logger.error("WEB_APP_BASE_URL not configured"); return; }
  await callTramoAlertas(baseUrl, CRON_TOKEN.value());
});
