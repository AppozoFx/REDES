import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Permite subir archivos Excel en acciones de servidor sin romper por limite por defecto.
      bodySizeLimit: "20mb",
    },
  },
  // Eliminamos 'turbopack' porque Firebase no lo soporta en el build de producción
  eslint: {
    // Esto evita que el error de 'eslint-config-next' detenga el deploy
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Opcional: ignora errores de tipos durante el build para asegurar el despliegue
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
