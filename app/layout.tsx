import '../styles/globals.css'
import type { Metadata } from 'next'
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'

const allowPublicProductionPageview = (event: BeforeSendEvent) => {
  let pathname: string;
  try {
    pathname = new URL(event.url, 'https://analytics.invalid').pathname;
  } catch {
    return event;
  }
  return pathname === '/admin' || pathname.startsWith('/admin/') ? null : event;
}

const isProductionDeployment = process.env.VERCEL_ENV === 'production';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: 'Yuji - Heal the person to your right',
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
        {isProductionDeployment ? <Analytics beforeSend={allowPublicProductionPageview} mode="production" /> : null}
      </body>
    </html>
  )
}
