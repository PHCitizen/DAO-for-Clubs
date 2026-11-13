import type { TreasuryReadFailure } from '../../application'

/** Shared presentation of a failed on-chain proposal read, including chain mismatch. */
export function ReadFailure({
  failure,
  title,
  onRetry,
}: {
  failure: TreasuryReadFailure
  title: string
  onRetry: () => void
}) {
  const message =
    failure.status === 'chain-mismatch'
      ? `This deployment requires chain ${failure.expectedChainId}, but the RPC endpoint reported chain ${failure.actualChainId}.`
      : failure.message
  return (
    <div role="alert" className="mt-10 rounded-xl border border-status-error/30 bg-status-error/10 p-6">
      <p className="font-semibold text-status-error">{title}</p>
      <p className="mt-1 text-sm text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg bg-status-error px-4 py-1.5 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  )
}
