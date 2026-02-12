"use client";

import { useState } from "react";

export default function DevEmulatorsPage() {
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function bootstrapAdmin() {
    setLoading(true);
    setOut(null);
    try {
      const res = await fetch("/api/dev/bootstrap-admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
});



      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      setOut({ status: res.status, data });
    } catch (e: any) {
      setOut({ status: "FETCH_ERROR", data: { message: e?.message ?? String(e) } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Dev Emulators</h1>

      <button onClick={bootstrapAdmin} disabled={loading}>
        {loading ? "Bootstrap..." : "Bootstrap Admin (DEV)"}
      </button>

      <pre style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>
        {out ? JSON.stringify(out, null, 2) : "Sin ejecutar"}
      </pre>
    </div>
  );
}
