export function resolveSiteUrl(): URL {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return new URL(configuredUrl || (productionHost ? `https://${productionHost}` : 'http://localhost:3000'));
}
