import publicArtifacts from './generated/public-artifacts.json'
import {
  type WalletAdapter,
  type Address,
  type AccountChangedListener,
  WalletUnavailableError,
  normalizeWalletError,
} from './wallet'

// ---------------------------------------------------------------------------
// Wallet connection state
// ---------------------------------------------------------------------------

export type WalletState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; account: Address }
  | { status: 'error'; error: WalletUnavailableError | { kind: 'wallet-rejected' | 'wallet-connect-error'; message: string } }

export type WalletStateListener = (state: WalletState) => void

// ---------------------------------------------------------------------------
// Application factory
// ---------------------------------------------------------------------------

/**
 * createApplication returns the public action/read seam used by the UI and
 * behavioral tests. Pass a WalletAdapter to inject a controlled stub in tests
 * or the production browser adapter in the app entry point. When no adapter
 * is supplied the application runs read-only (no wallet actions available).
 */
export function createApplication(adapter?: WalletAdapter) {
  // Mutable wallet state kept inside the closure; listeners notify subscribers.
  let walletState: WalletState = { status: 'disconnected' }
  const listeners = new Set<WalletStateListener>()
  let unsubscribeAccountChanged: (() => void) | null = null

  function emit(next: WalletState) {
    walletState = next
    for (const l of listeners) l(next)
  }

  // Wire up the adapter's account-change events once.
  function attachAccountListener() {
    if (!adapter || unsubscribeAccountChanged) return
    const handler: AccountChangedListener = ({ account }) => {
      if (account === null) {
        // Wallet switched to no accounts — treat as disconnect.
        emit({ status: 'disconnected' })
      } else {
        // Account switched; update without re-requesting.
        emit({ status: 'connected', account })
      }
    }
    unsubscribeAccountChanged = adapter.onAccountChanged(handler)
  }

  function detachAccountListener() {
    if (unsubscribeAccountChanged) {
      unsubscribeAccountChanged()
      unsubscribeAccountChanged = null
    }
  }

  return {
    // -----------------------------------------------------------------------
    // Read actions
    // -----------------------------------------------------------------------

    readHome() {
      return {
        title: 'DAO for Clubs',
        description: 'Explore your organization. No wallet required to get started.',
        deploymentMessage:
          publicArtifacts.daoAddress === null
            ? 'No DAO has been deployed by this scaffold.'
            : 'Public deployment artifacts are available.',
      }
    },

    /** Returns a snapshot of the current wallet connection state. */
    readWalletAccount(): WalletState {
      return walletState
    },

    /** Whether a wallet provider is detectable in the browser environment. */
    isWalletAvailable(): boolean {
      return adapter?.isAvailable() ?? false
    },

    // -----------------------------------------------------------------------
    // Wallet actions
    // -----------------------------------------------------------------------

    /**
     * Request the user to connect their wallet.
     * Updates and emits wallet state; never throws — errors become state.
     */
    async connect(): Promise<void> {
      if (!adapter) {
        emit({ status: 'error', error: new WalletUnavailableError() })
        return
      }
      emit({ status: 'connecting' })
      try {
        const account = await adapter.connect()
        emit({ status: 'connected', account })
        attachAccountListener()
      } catch (err) {
        const domainError = normalizeWalletError(err)
        emit({ status: 'error', error: domainError })
        detachAccountListener()
      }
    },

    /**
     * Disconnect the wallet and clear all session state.
     * Subsequent actions cannot proceed with an obsolete account.
     */
    async disconnect(): Promise<void> {
      if (!adapter) return
      detachAccountListener()
      try {
        await adapter.disconnect()
      } catch {
        // Best-effort; session is cleared regardless.
      }
      emit({ status: 'disconnected' })
    },

    // -----------------------------------------------------------------------
    // State subscription
    // -----------------------------------------------------------------------

    /**
     * Subscribe to wallet state changes. Returns an unsubscribe function.
     * Call immediately after subscribe to read current state via readWalletAccount().
     */
    onWalletStateChanged(listener: WalletStateListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // -----------------------------------------------------------------------
    // Teardown (for tests and hot-module replacement)
    // -----------------------------------------------------------------------
    destroy() {
      detachAccountListener()
      listeners.clear()
    },
  }
}

export type Application = ReturnType<typeof createApplication>
