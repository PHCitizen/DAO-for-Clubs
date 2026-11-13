import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { NetworkState, PublicDeploymentStatus, WalletState } from '../application'
import { FundingPanel } from './-funding'
import { app } from '../applicationInstance'
import { useNetworkState, useWalletState } from '../walletState'

export const Route = createFileRoute('/')({ component: Home })

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
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-700">
        Browser foundation
      </p>
      <h1 className="text-4xl font-bold tracking-tight">{home.title}</h1>
      <p className="mt-6 text-lg text-slate-600">{home.description}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/treasuries"
          className="inline-flex rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          Browse treasuries
        </Link>
        <Link
          to="/testusd"
          className="inline-flex rounded-lg border border-emerald-700 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          Mint TestUSD
        </Link>
      </div>

      {/* Deployment & Network Context */}
      <section
        aria-labelledby="deployment-title"
        className="mt-10 rounded-xl border border-slate-200 bg-white p-6"
      >
        <h2 id="deployment-title" className="text-lg font-semibold">
          Deployment context
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Configured network
            </p>
            <p className="mt-1 font-medium text-slate-900">
              {deployment.chainName}{' '}
              <span className="text-sm font-normal text-slate-500">
                (Chain ID {deployment.chainId})
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Canonical DAO
            </p>
            <p className="mt-1 font-mono text-sm text-slate-900">
              {deployment.daoAddress ?? (
                <span className="font-sans text-slate-500 italic">Not yet deployed</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              TestUSD
            </p>
            <p className="mt-1 font-mono text-sm text-slate-900">
              {deployment.testUsdAddress ?? (
                <span className="font-sans text-slate-500 italic">Not yet deployed</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Public RPC status
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {!rpcStatus ? (
                'Checking RPC…'
              ) : rpcStatus.status === 'available' ? (
                <span className="text-emerald-700 font-medium">
                  Reachable (Block #{rpcStatus.blockNumber.toString()})
                </span>
              ) : rpcStatus.status === 'rpc-unavailable' ? (
                <span className="text-amber-700">Unavailable ({rpcStatus.message})</span>
              ) : (
                <span className="text-slate-500">Unconfigured</span>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Wallet & Network Management */}
      <section
        aria-labelledby="wallet-title"
        className="mt-6 rounded-xl border border-slate-200 bg-white p-6"
      >
        <h2 id="wallet-title" className="text-lg font-semibold">
          Wallet &amp; Network
        </h2>
        <div className="mt-4">
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
      <FundingPanel app={app} />
    </main>
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
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
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

        {/* Network status within wallet */}
        {networkState.status === 'matched' && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Connected to supported network:{' '}
            <span className="font-semibold">{networkState.configuredChainName}</span> (Chain ID{' '}
            {networkState.walletChainId})
          </div>
        )}

        {networkState.status === 'mismatched' && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">Wrong network</p>
            <p className="mt-1 text-sm text-amber-700">
              Your wallet is connected to{' '}
              <span className="font-semibold">
                {networkState.walletChainName ?? `Chain ID ${networkState.walletChainId}`}
              </span>
              , but this deployment is on{' '}
              <span className="font-semibold">{networkState.configuredChainName}</span> (Chain ID{' '}
              {networkState.configuredChainId}).
            </p>
            {networkState.canSwitch && (
              <button
                type="button"
                onClick={onSwitchNetwork}
                className="mt-3 rounded-lg bg-amber-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
              >
                Switch to {networkState.configuredChainName}
              </button>
            )}
          </div>
        )}

        {networkState.status === 'switching' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <span aria-live="polite">
              Switching network to Chain ID {networkState.targetChainId} — check your wallet…
            </span>
          </div>
        )}

        {networkState.status === 'switch-error' && (
          <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <div>
              <p className="text-sm font-semibold text-red-800">
                {networkState.error.kind === 'network-switch-rejected'
                  ? 'Network switch rejected'
                  : 'Network switch error'}
              </p>
              <p className="mt-1 text-sm text-red-700">{networkState.error.message}</p>
            </div>
            <button
              type="button"
              onClick={onSwitchNetwork}
              className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
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
