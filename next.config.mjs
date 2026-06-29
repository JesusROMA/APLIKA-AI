/** @type {import('next').NextConfig} */
const nextConfig = {
  // Salida standalone para imagen Docker liviana (next start en VPS IONOS).
  output: 'standalone',
  reactStrictMode: true,
  // El frontend Claude Design (.dc.html) se sirve como assets estáticos desde /public/dc
  // y carga su propio React UMD; no participa del bundling de Next.
  poweredByHeader: false,
};

export default nextConfig;
