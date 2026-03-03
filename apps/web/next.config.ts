import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Permite subir archivos Excel en acciones de servidor sin romper por limite por defecto.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
