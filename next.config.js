/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const nextConfig = {
  reactStrictMode: true,
  env: {
    customKey: 'my-value',
    CLOUDINARY_CLOUD_NAME: "dwsenj1bp",
    CLOUDINARY_API_KEY: "853685646649433",
    CLOUDINARY_API_SECRET: "oZOXsiWgAcuYNqkYkV1PzmdKbAI",
    assetPrefix: isProd ? 'https://res.cloudinary.com' : 'https://res.cloudinary.com',
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback.fs = false;
    }
    return config;
  },
  crossOrigin: 'anonymous',
}

module.exports = nextConfig