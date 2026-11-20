import '../styles/globals.css'
import type { Metadata } from 'next'

import { PublicAnalytics } from '@/components/analytics/PublicAnalytics'
import { resolveSiteUrl } from '@/lib/site-url'

const isProductionDeployment = process.env.VERCEL_ENV === 'production';

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: {
    default: 'Yuji - Heal the person to your right',
    template: '%s | Yuji',
  },
  description: 'Travel stories and photography by Yuji',
  keywords: ['photography', 'travel', 'stories', 'blog'],
  authors: [{ name: 'Yuji' }],
  openGraph: {
    title: 'Yuji - Heal the person to your right',
    description: 'Travel stories and photography by Yuji',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        {isProductionDeployment ? <PublicAnalytics /> : null}
      </body>
    </html>
  )
}
