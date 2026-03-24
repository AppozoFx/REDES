import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  experimental: {
    serverActions: {
      // Permite subir archivos Excel en acciones de servidor sin romper por limite por defecto.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
