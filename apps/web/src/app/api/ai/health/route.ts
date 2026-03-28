import { NextResponse } from "next/server";
import { getOpenAIClient, resolveOpenAiApiKey } from "@/lib/ai/openai";

export async function GET() {
  const model = "gpt-4.1-mini";
  const keyPredespacho = process.env.OPENAI_API_KEY_PREDESPACHO || "";
  const keyPreliquidacion = process.env.OPENAI_API_KEY_PRELIQUIDACION || "";
  const keyGeneric = process.env.OPENAI_API_KEY || "";
  const resolvedKey = resolveOpenAiApiKey();
  const keyPrefix = resolvedKey ? resolvedKey.slice(0, 6) : "missing";
  const usingEnvVar = keyPredespacho
    ? "OPENAI_API_KEY_PREDESPACHO"
    : keyPreliquidacion
    ? "OPENAI_API_KEY_PRELIQUIDACION"
    : keyGeneric
    ? "OPENAI_API_KEY"
    : "missing";

  try {
    const openai = getOpenAIClient();
    const response = await openai.responses.create({
      model,
      input: "Responde solo: OK",
    });

    console.log("[ai/health] env verification", {
      usingEnvVar,
      hasPredespachoKey: !!keyPredespacho,
      predespachoKeyPrefix: keyPrefix,
      hasPreliquidacionKey: !!keyPreliquidacion,
      hasGenericOpenAiKey: !!keyGeneric,
      model,
    });

    return NextResponse.json({
      success: true,
      output: response.output_text,
    });
  } catch (error) {
    console.log("[ai/health] env verification (error path)", {
      usingEnvVar,
      hasPredespachoKey: !!keyPredespacho,
      predespachoKeyPrefix: keyPrefix,
      hasPreliquidacionKey: !!keyPreliquidacion,
      hasGenericOpenAiKey: !!keyGeneric,
      model,
    });
    console.error(error);
    return NextResponse.json(
      { success: false },
      
      { status: 500 }
      
    );
  }
}
