/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Genera un build autocontenido en .next/standalone para una imagen Docker mínima.
  output: 'standalone',
};

export default nextConfig;
