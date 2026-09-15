/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      encoding: false,
      'pino-pretty': false,
    }
    return config
  },
}

export default nextConfig
