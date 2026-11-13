import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { NetworkState, PublicDeploymentStatus, WalletState } from '../application'
import { FundingPanel } from './-funding'
import { app } from '../applicationInstance'
import { useNetworkState, useWalletState } from '../walletState'

export const Route = createFileRoute('/')({ component: Home })

function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function Home() {
  const home = app.readHome()
  const deployment = app.readDeployment()
  const walletState = useWalletState()
  const networkState = useNetworkState()
  const connectingRef = useRef(false)
  const [rpcStatus, setRpcStatus] = useState<PublicDeploymentStatus | null>(null)

  useEffect(() => {
    let active = true
    app.queryPublicDeployment().then((res) => {
      if (active) setRpcStatus(res)
    })
    return () => {
      active = false
    }
  }, [])

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

  async function handleSwitchNetwork() {
    await app.switchNetwork()
  }

  return (
    <div className="min-h-screen bg-page text-text-primary flex flex-col selection:bg-binance-yellow/20 selection:text-binance-yellow">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-card-border bg-page/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-card-border text-binance-yellow shadow-inner">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-text-primary">
                {home.title}
              </span>
              <span className="hidden sm:inline-block ml-2 rounded-full border border-card-border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                BNB Chain
              </span>
            </div>
          </div>

          {/* Header Action: Connect Wallet / Status */}
          <div className="flex items-center gap-2 sm:gap-3">
            {walletState.status === 'connected' ? (
              <div className="flex items-center gap-2">
                {/* Network Badge */}
                <div
                  className={`hidden sm:flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    networkState.status === 'matched'
                      ? 'border-status-success/30 bg-status-success/10 text-status-success'
                      : 'border-binance-yellow/30 bg-binance-yellow/10 text-binance-yellow'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      networkState.status === 'matched' ? 'bg-status-success' : 'bg-binance-yellow animate-pulse'
                    }`}
                  />
                  <span>
                    {networkState.status === 'matched'
                      ? networkState.configuredChainName
                      : 'Wrong Network'}
                  </span>
                </div>

                {/* Account Pill */}
                <div className="flex items-center gap-2 rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs font-mono text-text-primary shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-status-success" aria-hidden="true" />
                  <span title={walletState.account}>{shortenAddress(walletState.account)}</span>
                </div>

                {/* Disconnect button in header */}
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="rounded-lg border border-card-border bg-card p-1.5 text-text-secondary hover:border-card-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
                  title="Disconnect wallet"
                  aria-label="Disconnect wallet"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            ) : walletState.status === 'connecting' ? (
              <div className="flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-xs font-medium text-text-secondary">
                <svg
                  className="h-3.5 w-3.5 animate-spin text-binance-yellow"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span>Connecting…</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                className="inline-flex items-center gap-1.5 rounded-lg bg-binance-yellow px-4 py-2 text-xs sm:text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover active:bg-binance-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        {/* Hero Section */}
        <div className="text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card/80 px-3 py-1 text-xs font-medium text-binance-yellow mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-binance-yellow animate-ping" />
            <span>Binance Hackathon • BNB Smart Chain</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-text-primary">
            {home.title}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-text-secondary max-w-2xl leading-relaxed">
            {home.description}
          </p>

          {/* Quick Action Navigation Links */}
          <div className="mt-6 flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <Link
              to="/treasuries"
              className="inline-flex items-center gap-2 rounded-lg bg-binance-yellow px-5 py-2.5 text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover active:bg-binance-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              <span>Browse treasuries</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              to="/testusd"
              className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-5 py-2.5 text-sm font-semibold text-text-primary shadow-sm transition-all hover:border-text-secondary hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              <span>Mint TestUSD</span>
              <svg className="h-4 w-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </Link>
            <Link
              to="/proposals"
              className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-5 py-2.5 text-sm font-semibold text-text-primary shadow-sm transition-all hover:border-text-secondary hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              <span>Read proposals</span>
            </Link>
            <Link
              to="/proposals/new"
              className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-5 py-2.5 text-sm font-semibold text-text-primary shadow-sm transition-all hover:border-text-secondary hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              <span>Write a proposal</span>
              <svg className="h-4 w-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </Link>
            <Link
              to="/attendance"
              className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-5 py-2.5 text-sm font-semibold text-text-primary shadow-sm transition-all hover:border-text-secondary hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              <span>Attendance claims</span>
            </Link>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="mt-10 space-y-6">
          {/* Card 1: Deployment & Network Context */}
          <section
            aria-labelledby="deployment-title"
            className="rounded-xl border border-card-border bg-card p-6 sm:p-7 shadow-lg shadow-black/30 transition-all"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-page border border-card-border text-binance-yellow">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <h2 id="deployment-title" className="text-base sm:text-lg font-semibold text-text-primary">
                  Deployment context
                </h2>
              </div>
              <div>
                {deployment.daoAddress ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-status-success/30 bg-status-success/10 px-2.5 py-0.5 text-xs font-medium text-status-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                    Live Deployment
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-page px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-text-tertiary" />
                    No DAO Deployed
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="rounded-lg border border-card-border/60 bg-page/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Configured network
                </p>
                <p className="mt-1.5 font-medium text-text-primary flex items-center gap-2">
                  <span>{deployment.chainName}</span>
                  <span className="rounded bg-card px-1.5 py-0.5 text-xs font-normal text-text-secondary border border-card-border">
                    ID {deployment.chainId}
                  </span>
                </p>
              </div>

              <div className="rounded-lg border border-card-border/60 bg-page/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Canonical DAO
                </p>
                <p className="mt-1.5 font-mono text-sm text-text-primary break-all">
                  {deployment.daoAddress ?? (
                    <span className="font-sans text-xs text-text-secondary italic">
                      Not yet deployed
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-lg border border-card-border/60 bg-page/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  TestUSD token
                </p>
                <p className="mt-1.5 font-mono text-sm text-text-primary break-all">
                  {deployment.testUsdAddress ?? (
                    <span className="font-sans text-xs text-text-secondary italic">
                      Not yet deployed
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-lg border border-card-border/60 bg-page/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Public RPC status
                </p>
                <p className="mt-1.5 text-sm">
                  {!rpcStatus ? (
                    <span className="inline-flex items-center gap-2 text-text-secondary">
                      <span className="h-2 w-2 rounded-full bg-text-tertiary animate-pulse" />
                      Checking RPC…
                    </span>
                  ) : rpcStatus.status === 'available' ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-status-success">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      Reachable (Block #{rpcStatus.blockNumber.toString()})
                    </span>
                  ) : rpcStatus.status === 'rpc-unavailable' ? (
                    <span className="inline-flex items-center gap-1.5 text-status-error">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Unavailable ({rpcStatus.message})
                    </span>
                  ) : (
                    <span className="text-text-secondary">Unconfigured</span>
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* Card 2: Wallet & Network Management */}
          <section
            aria-labelledby="wallet-title"
            className="rounded-xl border border-card-border bg-card p-6 sm:p-7 shadow-lg shadow-black/30 transition-all"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-page border border-card-border text-binance-yellow">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </div>
                <h2 id="wallet-title" className="text-base sm:text-lg font-semibold text-text-primary">
                  Wallet &amp; Network
                </h2>
              </div>

              {/* Status Badge */}
              <div>
                {!app.isWalletAvailable() ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-status-error/30 bg-status-error/10 px-2.5 py-0.5 text-xs font-medium text-status-error">
                    No Extension
                  </span>
                ) : walletState.status === 'connected' ? (
                  networkState.status === 'matched' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-status-success/30 bg-status-success/10 px-2.5 py-0.5 text-xs font-medium text-status-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-binance-yellow/30 bg-binance-yellow/10 px-2.5 py-0.5 text-xs font-medium text-binance-yellow">
                      <span className="h-1.5 w-1.5 rounded-full bg-binance-yellow animate-pulse" />
                      Wrong network
                    </span>
                  )
                ) : walletState.status === 'connecting' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-binance-yellow/30 bg-binance-yellow/10 px-2.5 py-0.5 text-xs font-medium text-binance-yellow">
                    Connecting…
                  </span>
                ) : walletState.status === 'error' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-status-error/30 bg-status-error/10 px-2.5 py-0.5 text-xs font-medium text-status-error">
                    Error
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-page px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                    Not connected
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5">
              <WalletPanel
                state={walletState}
                networkState={networkState}
                isAvailable={app.isWalletAvailable()}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onSwitchNetwork={handleSwitchNetwork}
              />
            </div>
          </section>

          {/* Card 3: Funding Panel */}
          <FundingPanel app={app} />
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WalletPanel — pure presentational component
// ---------------------------------------------------------------------------

interface WalletPanelProps {
  state: WalletState
  networkState: NetworkState
  isAvailable: boolean
  onConnect: () => void
  onDisconnect: () => void
  onSwitchNetwork: () => void
}

function WalletPanel({
  state,
  networkState,
  isAvailable,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
}: WalletPanelProps) {
  if (!isAvailable) {
    return (
      <div className="rounded-lg border border-card-border bg-page/50 p-4 text-text-secondary">
        <div className="flex items-start gap-3">
          <svg className="h-5 w-5 text-status-error shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium text-text-primary">No wallet extension detected.</p>
            <p className="mt-1 text-sm text-text-secondary">
              Install a compatible wallet (e.g.{' '}
              <a
                href="https://metamask.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-binance-yellow underline hover:text-binance-yellow-hover"
              >
                MetaMask
              </a>{' '}
              or Trust Wallet) and reload this page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'disconnected') {
    return (
      <div className="rounded-lg border border-card-border bg-page/50 p-6 text-center sm:text-left">
        <p className="text-sm text-text-secondary">
          Connect your Web3 wallet to participate in club governance, create treasuries, and mint TestUSD tokens.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onConnect}
            className="inline-flex items-center gap-2 rounded-lg bg-binance-yellow px-5 py-2.5 text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover active:bg-binance-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Connect wallet</span>
          </button>
        </div>
      </div>
    )
  }

  if (state.status === 'connecting') {
    return (
      <div className="rounded-lg border border-card-border bg-page/50 p-5">
        <div className="flex items-center gap-3 text-text-secondary">
          <svg className="h-5 w-5 animate-spin text-binance-yellow" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span aria-live="polite" className="text-sm text-text-primary">
            Connecting — check your wallet…
          </span>
        </div>
      </div>
    )
  }

  if (state.status === 'connected') {
    return (
      <div className="space-y-4">
        {/* Connected Account Details */}
        <div className="rounded-lg border border-card-border bg-page/50 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Connected account
              </p>
              <p className="mt-1 font-mono text-sm text-text-primary break-all">
                {state.account}
              </p>
            </div>
            <button
              type="button"
              onClick={onDisconnect}
              className="shrink-0 inline-flex items-center justify-center rounded-lg border border-card-border bg-card px-3.5 py-1.5 text-xs font-medium text-text-secondary hover:border-text-secondary hover:text-text-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Network status within wallet */}
        {networkState.status === 'matched' && (
          <div className="rounded-lg border border-status-success/30 bg-status-success/10 p-4 text-sm text-status-success flex items-start gap-2.5">
            <svg className="h-5 w-5 shrink-0 text-status-success mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              Connected to supported network:{' '}
              <span className="font-semibold text-text-primary">{networkState.configuredChainName}</span> (Chain ID{' '}
              {networkState.walletChainId})
            </div>
          </div>
        )}

        {networkState.status === 'mismatched' && (
          <div role="alert" className="rounded-lg border border-binance-yellow/30 bg-binance-yellow/10 p-4">
            <div className="flex items-start gap-2.5">
              <svg className="h-5 w-5 shrink-0 text-binance-yellow mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-binance-yellow">Wrong network</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Your wallet is connected to{' '}
                  <span className="font-semibold text-text-primary">
                    {networkState.walletChainName ?? `Chain ID ${networkState.walletChainId}`}
                  </span>
                  , but this deployment is on{' '}
                  <span className="font-semibold text-text-primary">{networkState.configuredChainName}</span> (Chain ID{' '}
                  {networkState.configuredChainId}).
                </p>
              </div>
            </div>

            {networkState.canSwitch && (
              <button
                type="button"
                onClick={onSwitchNetwork}
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-binance-yellow px-4 py-2 text-xs font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
              >
                <span>Switch to {networkState.configuredChainName}</span>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            )}
          </div>
        )}

        {networkState.status === 'switching' && (
          <div className="rounded-lg border border-card-border bg-page/50 p-4 text-sm text-text-secondary flex items-center gap-2.5">
            <svg className="h-4 w-4 animate-spin text-binance-yellow shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span aria-live="polite">
              Switching network to Chain ID {networkState.targetChainId} — check your wallet…
            </span>
          </div>
        )}

        {networkState.status === 'switch-error' && (
          <div role="alert" className="space-y-3 rounded-lg border border-status-error/30 bg-status-error/10 p-4">
            <div className="flex items-start gap-2.5">
              <svg className="h-5 w-5 shrink-0 text-status-error mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-status-error">
                  {networkState.error.kind === 'network-switch-rejected'
                    ? 'Network switch rejected'
                    : 'Network switch error'}
                </p>
                <p className="mt-1 text-sm text-text-secondary">{networkState.error.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSwitchNetwork}
              className="rounded-lg bg-status-error px-4 py-1.5 text-xs font-semibold text-white hover:bg-status-error/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    )
  }

  // error state
  const { error } = state
  const isRetryable = error.kind !== 'wallet-unavailable'

  return (
    <div role="alert" className="space-y-3">
      <div className="rounded-lg border border-status-error/30 bg-status-error/10 p-4">
        <div className="flex items-start gap-2.5">
          <svg className="h-5 w-5 shrink-0 text-status-error mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-status-error">
              {error.kind === 'wallet-unavailable'
                ? 'Wallet unavailable'
                : error.kind === 'wallet-rejected'
                ? 'Connection rejected'
                : 'Connection error'}
            </p>
            <p className="mt-1 text-sm text-text-secondary">{error.message}</p>
          </div>
        </div>
      </div>
      {isRetryable && (
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex items-center gap-2 rounded-lg bg-binance-yellow px-5 py-2 text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
        >
          Try again
        </button>
      )}
    </div>
  )
}
