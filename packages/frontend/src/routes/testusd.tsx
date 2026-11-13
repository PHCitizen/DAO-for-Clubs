import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isAddress } from 'viem'
import type { MintTestUsdResult, NetworkState, TestUsdInfoResult, WalletState } from '../application'
import { app } from '../applicationInstance'
import { parseTestUsdAmount } from '../testusd'
import { useNetworkState, useWalletState } from '../walletState'

export const Route = createFileRoute('/testusd')({ component: TestUsdMintPage })

type InfoState = TestUsdInfoResult | 'loading'

function TestUsdMintPage() {
  const [infoState, setInfoState] = useState<InfoState>('loading')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<MintTestUsdResult | null>(null)
  const walletState = useWalletState()
  const networkState = useNetworkState()
  const connectingRef = useRef(false)

  const loadInfo = useCallback(async () => {
    setInfoState('loading')
    setInfoState(await app.readTestUsd())
  }, [])

  useEffect(() => {
    void loadInfo()
  }, [loadInfo])

  const info = infoState !== 'loading' && infoState.status === 'success' ? infoState.testUsd : null

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setResult(null)
    setSubmitting(true)
    try {
      setResult(await app.mintTestUsd({ recipient, amount }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-14 text-text-primary sm:px-6 lg:py-20">
      <Link
        to="/"
        className="text-sm font-semibold text-binance-yellow hover:text-binance-yellow-hover"
      >
        ← DAO for Clubs
      </Link>

      <header className="mt-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-binance-yellow">TestUSD</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">
          Mint test currency
        </h1>
        <p className="mt-3 text-text-secondary">
          The designated currency administrator signs the mint with a connected wallet. The wallet
          must match the administrator recorded on the shared token; treasury administrators cannot
          mint.
        </p>
      </header>

      <TestUsdIdentityCard state={infoState} onRetry={() => void loadInfo()} />

      <section
        aria-labelledby="mint-wallet-title"
        className="mt-6 rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30"
      >
        <h2 id="mint-wallet-title" className="text-lg font-semibold text-text-primary">
          Signing wallet
        </h2>
        <div className="mt-4">
          <MintWalletPanel
            walletState={walletState}
            networkState={networkState}
            info={info}
            isAvailable={app.isWalletAvailable()}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSwitchNetwork={handleSwitchNetwork}
          />
        </div>
      </section>

      <MintForm
        info={info}
        recipient={recipient}
        amount={amount}
        submitting={submitting}
        canSubmit={
          info !== null &&
          walletState.status === 'connected' &&
          networkState.status === 'matched'
        }
        onRecipientChange={setRecipient}
        onAmountChange={setAmount}
        onSubmit={handleSubmit}
      />

      {result && <MintResultPanel result={result} />}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function TestUsdIdentityCard({ state, onRetry }: { state: InfoState; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <p role="status" className="mt-10 text-text-secondary">
        Reading the shared TestUSD deployment…
      </p>
    )
  }

  if (state.status === 'unconfigured') {
    return (
      <div role="alert" className="mt-10 rounded-xl border border-card-border bg-card p-6">
        <p className="font-semibold text-text-primary">TestUSD is not configured</p>
        <p className="mt-1 text-sm text-text-secondary">{state.message}</p>
      </div>
    )
  }

  if (state.status === 'chain-mismatch') {
    return (
      <div
        role="alert"
        className="mt-10 rounded-xl border border-binance-yellow/30 bg-binance-yellow/10 p-6"
      >
        <p className="font-semibold text-binance-yellow">Wrong chain</p>
        <p className="mt-1 text-sm text-text-secondary">
          This deployment requires chain {state.expectedChainId}, but the RPC endpoint reported
          chain {state.actualChainId}.
        </p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  if (state.status === 'rpc-unavailable') {
    return (
      <div
        role="alert"
        className="mt-10 rounded-xl border border-status-error/30 bg-status-error/10 p-6"
      >
        <p className="font-semibold text-status-error">TestUSD could not be read</p>
        <p className="mt-1 text-sm text-text-secondary">{state.message}</p>
        <p className="mt-1 font-mono text-xs text-status-error">{state.error}</p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }

  const info = state.testUsd
  return (
    <section
      aria-labelledby="testusd-identity-title"
      className="mt-10 rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30"
    >
      <h2 id="testusd-identity-title" className="text-lg font-semibold text-text-primary">
        Shared currency
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Symbol
          </dt>
          <dd className="mt-1 text-lg font-semibold text-text-primary">{info.symbol}</dd>
          <dd className="mt-1 text-xs text-text-tertiary">{info.decimals} decimals</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Token address
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-text-primary">{info.address}</dd>
          <dd className="mt-1 text-xs text-text-tertiary">Chain {state.chainId}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Designated currency administrator
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-text-primary">
            {info.currencyAdmin}
          </dd>
        </div>
      </dl>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

interface MintWalletPanelProps {
  walletState: WalletState
  networkState: NetworkState
  info: { currencyAdmin: string } | null
  isAvailable: boolean
  onConnect: () => void
  onDisconnect: () => void
  onSwitchNetwork: () => void
}

function MintWalletPanel({
  walletState,
  networkState,
  info,
  isAvailable,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
}: MintWalletPanelProps) {
  if (!isAvailable) {
    return (
      <div className="rounded-lg border border-card-border bg-page/50 p-4">
        <p className="text-sm font-semibold text-text-primary">No wallet extension detected</p>
        <p className="mt-1 text-sm text-text-secondary">
          Install a compatible wallet and reload this page to sign the mint.
        </p>
      </div>
    )
  }

  if (walletState.status === 'disconnected') {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="inline-flex items-center gap-2 rounded-lg bg-binance-yellow px-5 py-2.5 text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page"
      >
        Connect wallet
      </button>
    )
  }

  if (walletState.status === 'connecting') {
    return (
      <p className="text-text-secondary">
        <span aria-live="polite">Connecting — check your wallet…</span>
      </p>
    )
  }

  if (walletState.status === 'error') {
    return (
      <div
        role="alert"
        className="space-y-3 rounded-lg border border-status-error/30 bg-status-error/10 p-4"
      >
        <div>
          <p className="text-sm font-semibold text-status-error">Wallet connection failed</p>
          <p className="mt-1 text-sm text-text-secondary">{walletState.error.message}</p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          className="rounded-lg bg-status-error px-4 py-1.5 text-sm font-semibold text-white hover:bg-status-error/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error"
        >
          Try again
        </button>
      </div>
    )
  }

  const isAdministrator =
    info !== null && walletState.account.toLowerCase() === info.currencyAdmin.toLowerCase()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-card-border bg-page/50 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Connected account
          </p>
          <p className="mt-1 break-all font-mono text-sm text-text-primary">
            {walletState.account}
          </p>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="shrink-0 rounded-lg border border-card-border bg-card px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
        >
          Disconnect
        </button>
      </div>

      {info !== null && (
        <p
          className={
            isAdministrator
              ? 'rounded-lg border border-status-success/30 bg-status-success/10 p-3 text-sm text-status-success'
              : 'rounded-lg border border-binance-yellow/30 bg-binance-yellow/10 p-3 text-sm text-binance-yellow'
          }
        >
          {isAdministrator
            ? 'This wallet is the designated TestUSD currency administrator.'
            : 'This wallet is not the designated TestUSD currency administrator. The token will reject a mint from it.'}
        </p>
      )}

      {networkState.status === 'mismatched' && (
        <div
          role="alert"
          className="rounded-lg border border-binance-yellow/30 bg-binance-yellow/10 p-4"
        >
          <p className="text-sm font-semibold text-binance-yellow">Wrong network</p>
          <p className="mt-1 text-sm text-text-secondary">
            Your wallet is connected to chain {networkState.walletChainId}, but this deployment is
            on {networkState.configuredChainName} (Chain ID {networkState.configuredChainId}).
          </p>
          {networkState.canSwitch && (
            <button
              type="button"
              onClick={onSwitchNetwork}
              className="mt-3 rounded-lg bg-binance-yellow px-4 py-2 text-xs font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow"
            >
              Switch to {networkState.configuredChainName}
            </button>
          )}
        </div>
      )}

      {networkState.status === 'switching' && (
        <p aria-live="polite" className="text-sm text-text-secondary">
          Switching network — check your wallet…
        </p>
      )}

      {networkState.status === 'switch-error' && (
        <div
          role="alert"
          className="rounded-lg border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error"
        >
          {networkState.error.message}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mint form
// ---------------------------------------------------------------------------

interface MintFormProps {
  info: { symbol: string; decimals: number } | null
  recipient: string
  amount: string
  submitting: boolean
  canSubmit: boolean
  onRecipientChange: (value: string) => void
  onAmountChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

function MintForm({
  info,
  recipient,
  amount,
  submitting,
  canSubmit,
  onRecipientChange,
  onAmountChange,
  onSubmit,
}: MintFormProps) {
  const trimmedRecipient = recipient.trim()
  const recipientError =
    trimmedRecipient.length > 0 && !isAddress(trimmedRecipient)
      ? 'Enter a valid recipient address.'
      : null

  const parsedAmount =
    info !== null && amount.trim().length > 0 ? parseTestUsdAmount(amount, info.decimals) : null
  const amountError = parsedAmount !== null && !parsedAmount.ok ? parsedAmount.message : null

  const isValid = trimmedRecipient.length > 0 && recipientError === null && parsedAmount?.ok === true

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 rounded-xl border border-card-border bg-card p-6 shadow-lg shadow-black/30"
      aria-labelledby="mint-form-title"
    >
      <h2 id="mint-form-title" className="text-lg font-semibold text-text-primary">
        Mint amount
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Amounts use the token's {info?.decimals ?? '—'} decimals and are parsed as exact base units.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="mint-recipient"
            className="block text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            Recipient address
          </label>
          <input
            id="mint-recipient"
            name="recipient"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={recipient}
            onChange={(event) => onRecipientChange(event.target.value)}
            placeholder="0x…"
            className="mt-1.5 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-tertiary transition-colors focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow"
          />
          {recipientError && (
            <p role="alert" className="mt-1 text-sm text-status-error">
              {recipientError}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="mint-amount"
            className="block text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            Amount {info && <span className="normal-case text-text-tertiary">({info.symbol})</span>}
          </label>
          <input
            id="mint-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            placeholder="0.00"
            className="mt-1.5 block w-full rounded-lg border border-card-border bg-page px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-colors focus:border-binance-yellow focus:outline-none focus:ring-1 focus:ring-binance-yellow"
          />
          {amountError && (
            <p role="alert" className="mt-1 text-sm text-status-error">
              {amountError}
            </p>
          )}
          {parsedAmount?.ok && (
            <p className="mt-1 font-mono text-xs text-text-tertiary">
              Exact amount: {parsedAmount.amount.toString()} base units (
              {parsedAmount.formattedAmount} {info?.symbol})
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || !isValid || submitting}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-binance-yellow px-5 py-2.5 text-sm font-semibold text-binance-black shadow-sm transition-all hover:bg-binance-yellow-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binance-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:cursor-not-allowed disabled:bg-card-hover disabled:text-text-tertiary disabled:shadow-none"
      >
        {submitting ? 'Waiting for confirmation…' : 'Mint TestUSD'}
      </button>
      {!canSubmit && (
        <p className="mt-2 text-xs text-text-tertiary">
          Connect an authorized wallet on the configured network to enable minting.
        </p>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function MintResultPanel({ result }: { result: MintTestUsdResult }) {
  if (result.status === 'success') {
    return (
      <section
        role="status"
        className="mt-6 rounded-xl border border-status-success/30 bg-status-success/10 p-6"
      >
        <h2 className="text-lg font-semibold text-status-success">Mint confirmed</h2>
        <p className="mt-2 text-2xl font-bold text-text-primary">
          {result.formattedAmount}{' '}
          <span className="text-base font-semibold text-status-success">{result.symbol}</span>
        </p>
        <p className="mt-1 text-sm text-text-secondary">minted to</p>
        <p className="mt-1 break-all font-mono text-sm text-text-primary">{result.recipient}</p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Updated recipient balance
            </dt>
            <dd className="mt-1 font-semibold text-text-primary">
              {result.formattedRecipientBalance} {result.symbol}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Transaction
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-text-primary">{result.hash}</dd>
            <dd className="mt-1 text-xs text-text-tertiary">
              Chain {result.chainId} · Block {result.blockNumber.toString()}
            </dd>
          </div>
        </dl>
      </section>
    )
  }

  if (result.status === 'invalid-recipient' || result.status === 'invalid-amount') {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl border border-status-error/30 bg-status-error/10 p-4"
      >
        <p className="text-sm font-semibold text-status-error">
          {result.status === 'invalid-recipient' ? 'Invalid recipient' : 'Invalid amount'}
        </p>
        <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
      </div>
    )
  }

  if (result.status === 'unauthorized') {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl border border-binance-yellow/30 bg-binance-yellow/10 p-4"
      >
        <p className="text-sm font-semibold text-binance-yellow">Not the currency administrator</p>
        <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
        <p className="mt-2 break-all font-mono text-xs text-text-primary">
          Connected: {result.account}
        </p>
        <p className="mt-1 break-all font-mono text-xs text-text-primary">
          Required: {result.currencyAdmin}
        </p>
        <p className="mt-2 text-sm text-text-secondary">No transaction was sent.</p>
      </div>
    )
  }

  if (result.status === 'wallet-rejected') {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl border border-status-error/30 bg-status-error/10 p-4"
      >
        <p className="text-sm font-semibold text-status-error">Mint not submitted</p>
        <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
      </div>
    )
  }

  if (result.status === 'transaction-failed') {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl border border-status-error/30 bg-status-error/10 p-4"
      >
        <p className="text-sm font-semibold text-status-error">
          {result.stage === 'reverted'
            ? 'Mint reverted on-chain'
            : result.stage === 'confirmation'
              ? 'Mint could not be confirmed'
              : 'Mint could not be submitted'}
        </p>
        <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
        <p className="mt-1 font-mono text-xs text-status-error">{result.error}</p>
        {result.hash && (
          <p className="mt-2 break-all font-mono text-xs text-text-secondary">
            Transaction: {result.hash}
          </p>
        )}
      </div>
    )
  }

  if (result.status === 'chain-mismatch') {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl border border-binance-yellow/30 bg-binance-yellow/10 p-4"
      >
        <p className="text-sm font-semibold text-binance-yellow">Wrong chain</p>
        <p className="mt-1 text-sm text-text-secondary">
          This deployment requires chain {result.expectedChainId}, but the wallet or RPC reported
          chain {result.actualChainId}. Nothing was minted.
        </p>
      </div>
    )
  }

  if (result.status === 'rpc-unavailable') {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl border border-status-error/30 bg-status-error/10 p-4"
      >
        <p className="text-sm font-semibold text-status-error">Minting unavailable</p>
        <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
        <p className="mt-1 font-mono text-xs text-status-error">{result.error}</p>
      </div>
    )
  }

  if (result.status === 'unconfigured') {
    return (
      <div role="alert" className="mt-6 rounded-xl border border-card-border bg-card p-4">
        <p className="text-sm font-semibold text-text-primary">Minting is not configured</p>
        <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
      </div>
    )
  }

  // wallet-not-connected, wallet-unavailable, stale-configuration
  return (
    <div
      role="alert"
      className="mt-6 rounded-xl border border-status-error/30 bg-status-error/10 p-4"
    >
      <p className="text-sm font-semibold text-status-error">Mint not submitted</p>
      <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
    </div>
  )
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="mt-4 rounded-lg bg-status-error px-4 py-1.5 text-sm font-semibold text-white hover:bg-status-error/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error"
    >
      Try again
    </button>
  )
}
