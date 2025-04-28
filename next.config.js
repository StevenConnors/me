/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  staticPageGenerationTimeout: 300,
  transpilePackages: ['react-tweet'],
  images: {
    domains: ['res.cloudinary.com'],
    // loader: 'cloudinary',
    // path: 'https://res.cloudinary.com/dwsenj1bp/',
  },
  //https://res.cloudinary.com/dwsenj1bp/image/upload/v1666357791/new/IMG_6981_tawkhn.jpg
  // image/upload/v1666357791/new/IMG_6981_tawkhn.jpg supposedly i can just pass this in the src if i set the above
}

module.exports = nextConfig
