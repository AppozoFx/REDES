"use client";

import { useState } from "react";

type Counts = { ONT: number; MESH: number; FONO: number; BOX: number };
type RowInput = {
  cuadrillaId: string;
  nombre: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
  stock: Counts;
  consumo: Counts;
  promedio: Counts;
  omitida: boolean;
};

type RequestBody = {
  anchor: string;
  modelFilter: "all" | "huawei" | "zte";
  objetivo: Counts;
  stockAlmacen: Counts;
  rows: RowInput[];
};

type ResponseBody =
  | {
      ok: true;
      requestId: string;
      status: "ok" | "fallback";
      recommendation: {
        byCuadrilla: Record<string, Counts>;
        total: Counts;
      };
      meta: {
        source: "openai" | "deterministic";
        model: string;
        scope: "all" | "coordinador" | "tecnico";
        latencyMs: number;
        generatedAt: string;
        cappedMaterials: Array<"ONT" | "MESH" | "FONO" | "BOX">;
        unknownIdsDropped: string[];
      };
    }
  | {
      ok: false;
      error: string;
    };

type AiStatus = "idle" | "loading" | "ok" | "fallback" | "denied" | "error";

export function usePredespachoAiRecommendation() {
  const [status, setStatus] = useState<AiStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Extract<ResponseBody, { ok: true }> | null>(null);

  async function requestRecommendation(payload: RequestBody) {
    setLoading(true);
    setError("");
    setStatus("loading");
    try {
      const res = await fetch("/api/ai/predespacho/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as ResponseBody;
      if (!res.ok || !body || body.ok !== true) {
        const msg = body && body.ok === false ? body.error : "AI_REQUEST_FAILED";
        if (res.status === 401 || res.status === 403) {
          setStatus("denied");
        } else {
          setStatus("error");
        }
        setData(null);
        setError(String(msg || "AI_REQUEST_FAILED"));
        return null;
      }

      setData(body);
      setStatus(body.status === "ok" ? "ok" : "fallback");
      return body;
    } catch (e: any) {
      setStatus("error");
      setData(null);
      setError(String(e?.message || "AI_REQUEST_FAILED"));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return {
    requestRecommendation,
    status,
    loading,
    error,
    data,
  };
}

