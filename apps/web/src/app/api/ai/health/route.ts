import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/openai";

export async function GET() {
  const model = "gpt-4.1-mini";
  const keyPredespacho = process.env.OPENAI_API_KEY_PREDESPACHO || "";
  const keyPreliquidacion = process.env.OPENAI_API_KEY_PRELIQUIDACION || "";
  const keyGeneric = process.env.OPENAI_API_KEY || "";
  const keyPrefix = keyPredespacho ? keyPredespacho.slice(0, 6) : "missing";

  try {
    const response = await openai.responses.create({
      model,
      input: "Responde solo: OK",
    });

    console.log("[ai/health] env verification", {
      usingEnvVar: "OPENAI_API_KEY_PREDESPACHO",
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
      usingEnvVar: "OPENAI_API_KEY_PREDESPACHO",
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
