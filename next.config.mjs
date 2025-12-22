/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    // Server-side modules like pdf-parse work natively in Turbopack
    // No special configuration needed - Turbopack handles server-side Node.js modules correctly by default
  },
}

export default nextConfig
