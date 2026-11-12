import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { createApplication, type Application, type WalletState } from '../application'
import { createBrowserWalletAdapter } from '../wallet'

export const Route = createFileRoute('/')({ component: Home })

// Application instance is created once per page load, outside React, so that
// wallet state survives re-renders and hot-module replacement doesn't create
// duplicate listeners.
const app: Application = createApplication(createBrowserWalletAdapter())

function useWalletState(): WalletState {
  const [state, setState] = useState<WalletState>(() => app.readWalletAccount())
  useEffect(() => {
    // Sync in case state changed between render and effect.
    setState(app.readWalletAccount())
    return app.onWalletStateChanged(setState)
  }, [])
  return state
}

function Home() {
  const home = app.readHome()
  const walletState = useWalletState()
  const connectingRef = useRef(false)

  async function handleConnect() {
    if (connectingRef.current) return
    connectingRef.current = true
    try {
      await app.connect()
    } finally {
      connectingRef.current = false
    }
  }

  async function handleDisconnect() {
    await app.disconnect()
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-700">
        Browser foundation
      </p>
      <h1 className="text-4xl font-bold tracking-tight">{home.title}</h1>
      <p className="mt-6 text-lg text-slate-600">{home.description}</p>

      {/* Workspace status */}
      <section aria-labelledby="status-title" className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <h2 id="status-title" className="text-lg font-semibold">Workspace ready</h2>
        <p className="mt-2 text-slate-600">
          {home.deploymentMessage}
        </p>
      </section>

      {/* Wallet connection */}
      <section aria-labelledby="wallet-title" className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 id="wallet-title" className="text-lg font-semibold">Wallet</h2>
        <div className="mt-4">
          <WalletPanel
            state={walletState}
            isAvailable={app.isWalletAvailable()}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// WalletPanel — pure presentational component
// ---------------------------------------------------------------------------

interface WalletPanelProps {
  state: WalletState
  isAvailable: boolean
  onConnect: () => void
  onDisconnect: () => void
}

function WalletPanel({ state, isAvailable, onConnect, onDisconnect }: WalletPanelProps) {
  if (!isAvailable) {
    return (
      <div className="text-slate-600">
        <p>No wallet extension detected.</p>
        <p className="mt-1 text-sm">
          Install a compatible wallet (e.g.{' '}
          <a
            href="https://metamask.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 underline"
          >
            MetaMask
          </a>
          ) and reload this page.
        </p>
      </div>
    )
  }

  if (state.status === 'disconnected') {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        Connect wallet
      </button>
    )
  }

  if (state.status === 'connecting') {
    return (
      <p className="text-slate-600">
        <span aria-live="polite">Connecting — check your wallet…</span>
      </p>
    )
  }

  if (state.status === 'connected') {
    return (
      <div className="flex items-center gap-4">
        <div>
          <p className="text-sm text-slate-500">Connected account</p>
          <p className="font-mono text-sm text-slate-900 break-all">{state.account}</p>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
        >
          Disconnect
        </button>
      </div>
    )
  }

  // error state
  const { error } = state
  const isRetryable = error.kind !== 'wallet-unavailable'

  return (
    <div role="alert" className="space-y-3">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">
          {error.kind === 'wallet-unavailable'
            ? 'Wallet unavailable'
            : error.kind === 'wallet-rejected'
            ? 'Connection rejected'
            : 'Connection error'}
        </p>
        <p className="mt-1 text-sm text-red-700">{error.message}</p>
      </div>
      {isRetryable && (
        <button
          type="button"
          onClick={onConnect}
          className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          Try again
        </button>
      )}
    </div>
  )
}
