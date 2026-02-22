import * as logger from "firebase-functions/logger";

type SendTelegramMessageInput = {
  token: string;
  chatId: string;
  text: string;
  replyMarkup?: Record<string, unknown>;
};

export async function sendTelegramMessage(input: SendTelegramMessageInput): Promise<boolean> {
  const url = `https://api.telegram.org/bot${encodeURIComponent(input.token)}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text,
        parse_mode: "Markdown",
        reply_markup: input.replyMarkup || undefined,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error("telegram sendMessage error", {
        status: response.status,
        body,
        chatId: input.chatId,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("telegram sendMessage exception", {
      error: String((error as Error)?.message || error),
      chatId: input.chatId,
    });
    return false;
  }
}

export async function answerTelegramCallbackQuery(input: {
  token: string;
  callbackQueryId: string;
  text?: string;
}): Promise<boolean> {
  const url =
    `https://api.telegram.org/bot${encodeURIComponent(input.token)}` +
    "/answerCallbackQuery";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        callback_query_id: input.callbackQueryId,
        text: input.text || undefined,
        show_alert: false,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error("telegram answerCallbackQuery error", {
        status: response.status,
        body,
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("telegram answerCallbackQuery exception", {
      error: String((error as Error)?.message || error),
    });
    return false;
  }
}
