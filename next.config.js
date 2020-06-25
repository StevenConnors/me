
const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  env: {
    customKey: 'my-value',
    CLOUDINARY_CLOUD_NAME: "dwsenj1bp",
    CLOUDINARY_API_KEY: "853685646649433",
    CLOUDINARY_API_SECRET: "oZOXsiWgAcuYNqkYkV1PzmdKbAI",
    assetPrefix: isProd ? 'http://res.cloudinary.com' : 'http://res.cloudinary.com',
  },
  webpack: (config, { isServer }) => {
    // Fixes npm packages that depend on `fs` module
    if (!isServer) {
      config.node = {
        fs: 'empty'
      }
    }
    return config
  },
  crossOrigin: 'anonymous',
}
