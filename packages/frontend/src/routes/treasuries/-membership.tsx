import { useCallback, useEffect, useState } from 'react'
import { isAddress } from 'viem'
import type { Application, BurnVotingNftResult, MintVotingNftResult, VotingMembershipResult } from '../../application'

type MembershipState = VotingMembershipResult | 'loading'

/**
 * Treasury-scoped voting membership: wallet-free live supply, the connected
 * holder's confirmed credentials, and the administrator's mint workflow.
 */
export function MembershipPanel({ app, treasuryAddress }: { app: Application; treasuryAddress: string }) {
  const [state, setState] = useState<MembershipState>('loading')
  const [holder, setHolder] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [burnResult, setBurnResult] = useState<BurnVotingNftResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<MintVotingNftResult | null>(null)
  const [wallet, setWallet] = useState(app.readWalletAccount())

  useEffect(() => app.onWalletStateChanged(setWallet), [app])

  const account = wallet.status === 'connected' ? wallet.account : undefined

  const load = useCallback(async () => {
    setState('loading')
    setState(await app.readVotingMembership(treasuryAddress, account))
  }, [app, treasuryAddress, account])

  useEffect(() => {
    void load()
  }, [load])

  async function handleMint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setResult(null)
    setSubmitting(true)
    try {
      const outcome = await app.mintVotingNft({ treasury: treasuryAddress, holder })
      setResult(outcome)
      if (outcome.status === 'success') await load()
    } finally {
      setSubmitting(false)
    }
  }

  const membership = state !== 'loading' && state.status === 'success' ? state.membership : null
  const isAdministrator =
    membership !== null && account !== undefined &&
    account.toLowerCase() === membership.administrator.toLowerCase()

  return (
    <section aria-labelledby="membership-title" className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
      <h2 id="membership-title" className="text-lg font-semibold">
        Voting membership
      </h2>

      {state === 'loading' && (
        <p role="status" className="mt-4 text-sm text-slate-600">
          Reading voting membership from the chain…
        </p>
      )}

      {state !== 'loading' && state.status === 'success' && (
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Live voting NFT supply
            </dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">
              {state.membership.totalSupply.toString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Your credentials
            </dt>
            {state.membership.holder === null ? (
              <dd className="mt-1 text-sm text-slate-600">Connect a wallet to inspect your voting NFTs.</dd>
            ) : state.membership.holder.tokenIds.length === 0 ? (
              <dd className="mt-1 text-sm text-slate-600">
                This wallet holds no voting NFTs in this treasury.
              </dd>
            ) : (
              <dd className="mt-1 text-sm text-slate-900">
                {state.membership.holder.balance.toString()} credential(s):{' '}
                <span className="font-mono">
                  #{state.membership.holder.tokenIds.map((id) => id.toString()).join(', #')}
                </span>
              </dd>
            )}
          </div>
        </dl>
      )}

      {state !== 'loading' && state.status !== 'success' && state.status !== 'not-found' && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.status === 'chain-mismatch'
            ? `This deployment requires chain ${state.expectedChainId}, but the RPC endpoint reported chain ${state.actualChainId}.`
            : state.message}
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 block rounded-lg bg-red-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
          >
            Try again
          </button>
        </div>
      )}

      {isAdministrator && (
        <form onSubmit={handleMint} className="mt-6 border-t border-slate-200 pt-6" aria-labelledby="mint-nft-title">
          <h3 id="mint-nft-title" className="text-base font-semibold">
            Mint a voting NFT
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            You are this treasury’s administrator. Minted voting NFTs are non-transferable and get
            fresh, never-reused token IDs.
          </p>
          <label htmlFor="nft-holder" className="mt-4 block text-sm font-medium text-slate-700">
            Holder address
          </label>
          <input
            id="nft-holder"
            name="holder"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={holder}
            onChange={(event) => setHolder(event.target.value)}
            placeholder="0x…"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          <button
            type="submit"
            disabled={submitting || !isAddress(holder.trim())}
            className="mt-4 rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? 'Waiting for confirmation…' : 'Mint voting NFT'}
          </button>
        </form>
      )}

      {isAdministrator && (
        <form className="mt-6 border-t pt-6" onSubmit={async (event) => {
          event.preventDefault()
          if (submitting) return
          setSubmitting(true)
          setBurnResult(null)
          try {
            const outcome = await app.burnVotingNft({ treasury: treasuryAddress, tokenId: tokenId.trim() })
            setBurnResult(outcome)
            if (outcome.status === 'success') await load()
          } finally { setSubmitting(false) }
        }}>
          <h3 className="font-semibold">Remove a voting credential</h3>
          <p className="text-sm">IDs are scoped to this treasury. Removal changes live supply, not historical ballots.</p>
          <label htmlFor="burn-token-id" className="mt-3 block">Token ID in this treasury</label>
          <input id="burn-token-id" value={tokenId} onChange={(event) => setTokenId(event.target.value)}
            inputMode="numeric" className="rounded border p-2" />
          <button disabled={submitting || !/^[1-9]\d*$/.test(tokenId.trim())}
            className="ml-3 rounded bg-red-700 p-2 text-white disabled:bg-slate-300">
            {submitting ? 'Waiting for confirmation…' : 'Burn voting NFT'}
          </button>
        </form>
      )}
      {burnResult && (
        <div role={burnResult.status === 'success' ? 'status' : 'alert'} className="mt-4 rounded border p-4">
          {burnResult.status === 'success'
            ? `Credential #${burnResult.tokenId} removed from ${burnResult.holder}. Live supply: ${burnResult.totalSupply}. Transaction: ${burnResult.hash}`
            : burnResult.status === 'transaction-failed'
              ? `Burn failed (${burnResult.stage}): ${burnResult.message} ${burnResult.hash ?? ''}`
              : burnResult.status === 'wallet-rejected'
                ? 'Wallet rejected the burn. No transaction was submitted.'
                : 'message' in burnResult ? burnResult.message : `Burn not submitted: ${burnResult.status}`}
        </div>
      )}
      {result && <MintVotingNftResultPanel result={result} />}
    </section>
  )
}

function MintVotingNftResultPanel({ result }: { result: MintVotingNftResult }) {
  if (result.status === 'success') {
    return (
      <section role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <h3 className="text-lg font-semibold text-emerald-900">Voting NFT minted</h3>
        <p className="mt-2 text-sm text-emerald-800">
          Token <span className="font-mono font-semibold">#{result.tokenId.toString()}</span> issued to
        </p>
        <p className="mt-1 break-all font-mono text-sm text-emerald-900">{result.holder}</p>
        <p className="mt-2 text-sm text-emerald-800">
          Live supply: {result.totalSupply.toString()} · Holder now has{' '}
          {result.holderBalance.toString()} credential(s):{' '}
          <span className="font-mono">#{result.holderTokenIds.map((id) => id.toString()).join(', #')}</span>
        </p>
        <p className="mt-2 break-all font-mono text-xs text-emerald-700">
          Transaction: {result.hash} · Chain {result.chainId} · Block {result.blockNumber.toString()}
        </p>
      </section>
    )
  }

  if (result.status === 'unauthorized') {
    return (
      <div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">Not this treasury’s administrator</p>
        <p className="mt-1 text-sm text-amber-700">{result.message}</p>
        <p className="mt-2 break-all font-mono text-xs text-amber-800">Connected: {result.account}</p>
        <p className="mt-1 break-all font-mono text-xs text-amber-800">Required: {result.administrator}</p>
        <p className="mt-2 text-sm text-amber-700">No transaction was sent.</p>
      </div>
    )
  }

  if (result.status === 'invalid-holder' || result.status === 'not-found') {
    return (
      <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">
          {result.status === 'invalid-holder' ? 'Invalid holder' : 'Treasury not found'}
        </p>
        <p className="mt-1 text-sm text-red-700">
          {result.status === 'invalid-holder'
            ? result.message
            : 'The DAO registry does not record a treasury at this address on the configured chain.'}
        </p>
      </div>
    )
  }

  if (result.status === 'transaction-failed') {
    return (
      <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">
          {result.stage === 'reverted'
            ? 'Mint reverted on-chain'
            : result.stage === 'confirmation'
              ? 'Mint could not be confirmed'
              : 'Mint could not be submitted'}
        </p>
        <p className="mt-1 text-sm text-red-700">{result.message}</p>
        <p className="mt-1 font-mono text-xs text-red-600">{result.error}</p>
        {result.hash && (
          <p className="mt-2 break-all font-mono text-xs text-red-700">Transaction: {result.hash}</p>
        )}
      </div>
    )
  }

  if (result.status === 'chain-mismatch') {
    return (
      <div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">Wrong chain</p>
        <p className="mt-1 text-sm text-amber-700">
          This deployment requires chain {result.expectedChainId}, but the wallet or RPC reported
          chain {result.actualChainId}. Nothing was minted.
        </p>
      </div>
    )
  }

  // wallet-not-connected, wallet-unavailable, wallet-rejected, stale-configuration,
  // unconfigured, rpc-unavailable
  return (
    <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-800">Mint not submitted</p>
      <p className="mt-1 text-sm text-red-700">{result.message}</p>
    </div>
  )
}
