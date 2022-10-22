/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracing: false,
  staticPageGenerationTimeout: 300,
  images: {
    domains: ['res.cloudinary.com'],
  },
}

module.exports = nextConfig
