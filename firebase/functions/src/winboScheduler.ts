import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

const WEB_APP_BASE_URL = defineString("WEB_APP_BASE_URL", {
  default: "",
});
const WINBO_CRON_TOKEN = defineSecret("WINBO_CRON_TOKEN");

function isWithinWindowLima(scheduleDate: Date) {
  const hh = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      hour: "2-digit",
      hour12: false,
    }).format(scheduleDate)
  );
  const mm = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      minute: "2-digit",
    }).format(scheduleDate)
  );
  const totalMinutes = hh * 60 + mm;
  return totalMinutes >= 7 * 60 + 30 && totalMinutes <= 22 * 60;
}

export const winboOrdenesAutoSync = onSchedule(
  {
    region: "us-central1",
    schedule: "every 15 minutes",
    timeZone: "America/Lima",
    secrets: [WINBO_CRON_TOKEN],
  },
  async (event) => {
    const scheduleDate = new Date(event.scheduleTime || Date.now());
    if (!isWithinWindowLima(scheduleDate)) {
      logger.info("winboOrdenesAutoSync skipped: outside window");
      return;
    }

    const baseUrl = String(WEB_APP_BASE_URL.value() || "").replace(/\/$/, "");
    const token = WINBO_CRON_TOKEN.value();
    if (!baseUrl) {
      logger.error("WEB_APP_BASE_URL is not configured");
      return;
    }

    const url = `${baseUrl}/api/ordenes/import/winbo/cron`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-winbo-cron-token": token,
      },
    });

    const text = await response.text();
    if (!response.ok) {
      logger.error("winboOrdenesAutoSync failed", {
        status: response.status,
        body: text,
      });
      throw new Error(`WINBO_CRON_HTTP_${response.status}`);
    }

    logger.info("winboOrdenesAutoSync completed", { body: text });
  }
);
