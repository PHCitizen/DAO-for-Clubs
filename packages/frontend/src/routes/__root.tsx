import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'DAO for Clubs' },
      { name: 'theme-color', content: '#0B0E11' },
      { name: 'application-name', content: 'DAO for Clubs' },
      { name: 'apple-mobile-web-app-title', content: 'DAO for Clubs' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
  }),
  component: Root,
})

function Root() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-page text-text-primary antialiased selection:bg-binance-yellow/20 selection:text-binance-yellow">
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
