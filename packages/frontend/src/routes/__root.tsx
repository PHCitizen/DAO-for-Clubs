import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'DAO for Clubs' },
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
