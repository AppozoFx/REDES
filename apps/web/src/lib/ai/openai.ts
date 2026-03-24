import OpenAI from "openai";

export function getOpenAIClient(apiKey = process.env.OPENAI_API_KEY_PREDESPACHO || process.env.OPENAI_API_KEY) {
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
