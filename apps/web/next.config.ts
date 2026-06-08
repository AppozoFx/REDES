import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/api/ordenes/garantias/cruce": ["../../BBDD_M&D_01-06-2026.xlsx"],
  },
  experimental: {
    serverActions: {
      // Permite subir archivos Excel en acciones de servidor sin romper por limite por defecto.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
