/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the v0 preview iframe (served from *.vusercontent.net) to load
  // Next.js dev resources (/_next/*, HMR) cross-origin. Without this, the
  // client JS bundles are blocked and the app never becomes interactive.
  allowedDevOrigins: ["*.vusercontent.net"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
