/** @type {import('next').NextConfig} */
const nextConfig = {
  // Autoalojado en el VPS (§4.6): deploy.sh publica .next/standalone.
  output: "standalone",
  // El driver de PostgreSQL se carga con require nativo, sin empaquetar (§4.5).
  serverExternalPackages: ["pg"],
};

export default nextConfig;
