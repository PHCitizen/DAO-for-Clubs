import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { app } from '../../applicationInstance'

export function TreasuryCreationPanel({ onCreated }: { onCreated: () => void }) {
  const [wallet, setWallet] = useState(app.readWalletAccount())
  const [network, setNetwork] = useState(app.readNetworkState())
  const [state, setState] = useState(app.readTreasuryCreationState())
  const deployment = app.readDeployment()
  useEffect(() => app.onWalletStateChanged(setWallet), [])
  useEffect(() => app.onNetworkStateChanged(setNetwork), [])
  useEffect(() => app.onTreasuryCreationStateChanged(setState), [])
  const busy = state.status === 'submitting' || state.status === 'pending'
  const buttonClass = 'mt-4 rounded-lg bg-binance-yellow px-4 py-2 text-sm font-semibold text-black hover:bg-binance-yellow-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow'

  return (
    <section aria-labelledby="create-treasury-title" className="mt-8 rounded-xl border border-card-border bg-card p-6">
      <h2 id="create-treasury-title" className="text-lg font-bold">Create a treasury</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Anyone can create a TestUSD funding pool. Your connected wallet becomes its administrator
        and controls its voting NFTs. Creation requires an on-chain transaction and network gas fees.
      </p>
      {!deployment.isDeployed || !deployment.isSupported ? (
        <p className="mt-4 text-sm text-text-secondary">A supported DAO deployment is required to create a treasury.</p>
      ) : wallet.status !== 'connected' ? (
        <button type="button" className={buttonClass} disabled={wallet.status === 'connecting' || busy} onClick={() => void app.connect()}>
          {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet to create'}
        </button>
      ) : network.status !== 'matched' ? (
        <button type="button" className={buttonClass} disabled={network.status === 'switching' || busy} onClick={() => void app.switchNetwork()}>
          {network.status === 'switching' ? 'Switching…' : `Switch to ${deployment.chainName}`}
        </button>
      ) : (
        <>
          <p className="mt-3 break-all text-xs text-text-secondary">Administrator: {wallet.account}</p>
          <button type="button" className={buttonClass} disabled={busy} onClick={async () => {
            const result = await app.createTreasury()
            if (result.status === 'confirmed') onCreated()
          }}>{busy ? 'Creating treasury…' : 'Create treasury'}</button>
        </>
      )}
      {wallet.status === 'error' && <p role="alert" className="mt-3 text-sm text-status-error">{wallet.error.message}</p>}
      {network.status === 'switch-error' && <p role="alert" className="mt-3 text-sm text-status-error">{network.error.message}</p>}
      <div aria-live="polite" className="mt-3 break-all text-sm">
        {state.status === 'submitting' && <p>Confirm treasury creation in your wallet…</p>}
        {state.status === 'pending' && <p>Waiting for on-chain confirmation…</p>}
        {'hash' in state && <p className="mt-2 font-mono text-xs text-text-secondary">Transaction: {state.hash}</p>}
        {state.status === 'failed' && <p role="alert" className="mt-2 text-status-error">{state.message}</p>}
        {state.status === 'confirmed' && (
          <Link to="/treasuries/$treasuryAddress" params={{ treasuryAddress: state.treasury }} className="mt-2 inline-block font-semibold text-binance-yellow">
            Treasury created. View treasury →
          </Link>
        )}
      </div>
    </section>
  )
}
