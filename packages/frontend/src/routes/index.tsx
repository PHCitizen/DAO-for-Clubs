import { createFileRoute } from '@tanstack/react-router'
import { createApplication } from '../application'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const home = createApplication().readHome()
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-700">
        Browser foundation
      </p>
      <h1 className="text-4xl font-bold tracking-tight">{home.title}</h1>
      <p className="mt-6 text-lg text-slate-600">{home.description}</p>
      <section aria-labelledby="status-title" className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <h2 id="status-title" className="text-lg font-semibold">Workspace ready</h2>
        <p className="mt-2 text-slate-600">
          Wallet connection and deployment selection are coming next.
          {' '}{home.deploymentMessage}
        </p>
      </section>
    </main>
  )
}
