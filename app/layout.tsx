import '../styles/globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
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
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
