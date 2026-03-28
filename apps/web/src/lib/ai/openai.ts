import OpenAI from "openai";

export function resolveOpenAiApiKey() {
  return (
    process.env.OPENAI_API_KEY_PREDESPACHO ||
    process.env.OPENAI_API_KEY_PRELIQUIDACION ||
    process.env.OPENAI_API_KEY ||
    ""
  );
}

export function getOpenAIClient(apiKey = resolveOpenAiApiKey()) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }
  return new OpenAI({ apiKey });
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getOpenAIClient(), prop, receiver);
  },
});
