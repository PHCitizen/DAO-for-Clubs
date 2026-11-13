import { encodeFunctionData, stringToHex, type Abi, type Hex } from 'viem'
import { getSupportedChain } from './networks.js'

/**
 * WalletAdapter is the external seam between the application and the browser
 * wallet. The application never touches window.ethereum directly; it uses this
 * interface. Tests inject controlled stubs; production code uses the EIP-1193
 * adapter returned by createBrowserWalletAdapter().
 */
export type Address = `0x${string}`

export interface AccountChangedEvent {
  account: Address | null
}

export type AccountChangedListener = (event: AccountChangedEvent) => void

export interface ChainChangedEvent {
  chainId: number
}

export type ChainChangedListener = (event: ChainChangedEvent) => void

export interface ContractWriteRequest {
  from: Address
  to: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export interface WalletAdapter {
  /** Request the user to connect. Resolves with the first selected address. */
  connect(): Promise<Address>
  /** Disconnect / clear the session. */
  disconnect(): Promise<void>
  /** Return the currently connected address without prompting the user. */
  getAccount(): Promise<Address | null>
  /** Return the currently connected chain ID (or null if not connected/available). */
  getChainId(): Promise<number | null>
  /** Subscribe to account changes (switch or disconnect). Returns unsubscribe. */
  onAccountChanged(listener: AccountChangedListener): () => void
  /** Subscribe to chain/network changes. Returns unsubscribe. */
  onChainChanged(listener: ChainChangedListener): () => void
  /** Request the wallet to switch to the specified chain ID. */
  switchChain(chainId: number): Promise<void>
  /**
   * Ask the connected wallet to sign and submit a contract call.
   * Resolves with the transaction hash; never signs with an embedded key.
   */
  sendTransaction(request: ContractWriteRequest): Promise<Hex>
  /**
   * Ask the connected wallet to sign a UTF-8 message with EIP-191 personal_sign
   * and resolve with the 65-byte signature. Never requests a private key.
   */
  signMessage(account: Address, message: string): Promise<Hex>
  /** True when a compatible EIP-1193 provider is available in the browser. */
  isAvailable(): boolean
}

// ---------------------------------------------------------------------------
// Browser EIP-1193 adapter (viem-compatible, production path)
// ---------------------------------------------------------------------------

/** Narrows the EIP-1193 provider surface we actually use. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on(event: string, listener: (...args: unknown[]) => void): void
  removeListener(event: string, listener: (...args: unknown[]) => void): void
}

function getProvider(): Eip1193Provider | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { ethereum?: Eip1193Provider }
  return w.ethereum
}

/**
 * Returns the production wallet adapter that delegates to window.ethereum.
 * Call this once at application startup.
 */
export function createBrowserWalletAdapter(): WalletAdapter {
  return {
    isAvailable() {
      return getProvider() !== undefined
    },

    async connect(): Promise<Address> {
      const provider = getProvider()
      if (!provider) throw new WalletUnavailableError()
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[]
      if (!accounts || accounts.length === 0) throw new WalletConnectError('No accounts returned')
      return accounts[0] as Address
    },

    async disconnect(): Promise<void> {
      // EIP-1193 has no standard disconnect; we clear our own session state.
      // Some wallets expose wallet_revokePermissions — call it if present but
      // do not fail when absent.
      const provider = getProvider()
      if (provider) {
        try {
          await provider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          })
        } catch {
          // Not supported by this wallet — ignore.
        }
      }
    },

    async getAccount(): Promise<Address | null> {
      const provider = getProvider()
      if (!provider) return null
      const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
      return accounts && accounts.length > 0 ? (accounts[0] as Address) : null
    },

    async getChainId(): Promise<number | null> {
      const provider = getProvider()
      if (!provider) return null
      try {
        const hex = (await provider.request({ method: 'eth_chainId' })) as string
        return hex ? parseInt(hex, 16) : null
      } catch {
        return null
      }
    },

    onAccountChanged(listener: AccountChangedListener): () => void {
      const provider = getProvider()
      if (!provider) return () => {}
      const handler = (accounts: unknown) => {
        const list = accounts as string[]
        listener({ account: list && list.length > 0 ? (list[0] as Address) : null })
      }
      provider.on('accountsChanged', handler)
      return () => provider.removeListener('accountsChanged', handler)
    },

    onChainChanged(listener: ChainChangedListener): () => void {
      const provider = getProvider()
      if (!provider) return () => {}
      const handler = (chainIdHex: unknown) => {
        const parsed = parseInt(chainIdHex as string, 16)
        if (!isNaN(parsed)) {
          listener({ chainId: parsed })
        }
      }
      provider.on('chainChanged', handler)
      return () => provider.removeListener('chainChanged', handler)
    },

    async switchChain(chainId: number): Promise<void> {
      const provider = getProvider()
      if (!provider) throw new WalletUnavailableError()
      const hexChainId = `0x${chainId.toString(16)}`
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hexChainId }],
        })
      } catch (err: unknown) {
        if (err && typeof err === 'object') {
          const code = 'code' in err ? (err as { code: number }).code : undefined
          // EIP-1193 4001: User rejected
          if (code === 4001) {
            throw new NetworkSwitchRejectedError()
          }
          // EIP-1193 4902: Unrecognized chain — attempt to add if supported
          if (code === 4902) {
            const chain = getSupportedChain(chainId)
            if (chain) {
              try {
                await provider.request({
                  method: 'wallet_addEthereumChain',
                  params: [
                    {
                      chainId: hexChainId,
                      chainName: chain.name,
                      nativeCurrency: chain.nativeCurrency,
                      rpcUrls: chain.rpcUrls,
                      blockExplorerUrls: chain.blockExplorerUrls,
                    },
                  ],
                })
                return
              } catch (addErr: unknown) {
                if (addErr && typeof addErr === 'object' && 'code' in addErr && (addErr as { code: number }).code === 4001) {
                  throw new NetworkSwitchRejectedError()
                }
                throw new NetworkSwitchError(addErr instanceof Error ? addErr.message : String(addErr))
              }
            }
          }
        }
        throw new NetworkSwitchError(err instanceof Error ? err.message : String(err))
      }
    },

    async signMessage(account: Address, message: string): Promise<Hex> {
      const provider = getProvider()
      if (!provider) throw new WalletUnavailableError()
      try {
        const signature = await provider.request({
          method: 'personal_sign',
          params: [stringToHex(message), account],
        })
        return signature as Hex
      } catch (err: unknown) {
        throw normalizeWalletError(err)
      }
    },

    async sendTransaction(request: ContractWriteRequest): Promise<Hex> {
      const provider = getProvider()
      if (!provider) throw new WalletUnavailableError()

      const data = encodeFunctionData({
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
      })

      try {
        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: request.from,
              to: request.to,
              data,
            },
          ],
        })
        return hash as Hex
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 4001) {
          throw new TransactionRejectedError()
        }
        throw new TransactionSubmissionError(err instanceof Error ? err.message : String(err))
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export class WalletUnavailableError extends Error {
  readonly kind = 'wallet-unavailable' as const
  constructor() {
    super('No wallet extension detected. Install a compatible wallet to connect.')
    this.name = 'WalletUnavailableError'
  }
}

export class WalletConnectError extends Error {
  readonly kind = 'wallet-connect-error' as const
  constructor(message: string) {
    super(message)
    this.name = 'WalletConnectError'
  }
}

export class WalletRejectedError extends Error {
  readonly kind = 'wallet-rejected' as const
  constructor() {
    super('Connection request was rejected. You can try again.')
    this.name = 'WalletRejectedError'
  }
}

export class NetworkSwitchRejectedError extends Error {
  readonly kind = 'network-switch-rejected' as const
  constructor() {
    super('Network switch request was rejected. You can try again.')
    this.name = 'NetworkSwitchRejectedError'
  }
}

export class NetworkSwitchError extends Error {
  readonly kind = 'network-switch-error' as const
  constructor(message: string) {
    super(message)
    this.name = 'NetworkSwitchError'
  }
}

export class TransactionRejectedError extends Error {
  readonly kind = 'transaction-rejected' as const
  constructor() {
    super('Transaction request was rejected. You can try again.')
    this.name = 'TransactionRejectedError'
  }
}

export class TransactionSubmissionError extends Error {
  readonly kind = 'transaction-submission-error' as const
  constructor(message: string) {
    super(message)
    this.name = 'TransactionSubmissionError'
  }
}

export class UnsupportedChainError extends Error {
  readonly kind = 'unsupported-chain' as const
  readonly chainId: number
  constructor(chainId: number) {
    super(`Chain ID ${chainId} is not supported by this deployment.`)
    this.name = 'UnsupportedChainError'
    this.chainId = chainId
  }
}

export type DomainWalletError =
  | WalletUnavailableError
  | WalletRejectedError
  | WalletConnectError
  | NetworkSwitchRejectedError
  | NetworkSwitchError
  | UnsupportedChainError
  | TransactionRejectedError
  | TransactionSubmissionError

/** Normalize raw wallet errors to domain errors. */
export function normalizeWalletError(err: unknown): DomainWalletError {
  if (
    err instanceof WalletUnavailableError ||
    err instanceof WalletRejectedError ||
    err instanceof WalletConnectError ||
    err instanceof NetworkSwitchRejectedError ||
    err instanceof NetworkSwitchError ||
    err instanceof UnsupportedChainError ||
    err instanceof TransactionRejectedError ||
    err instanceof TransactionSubmissionError
  ) {
    return err
  }
  if (err instanceof Error) {
    // EIP-1193 user rejected: code 4001
    if ('code' in err && (err as { code: number }).code === 4001) {
      return new WalletRejectedError()
    }
    return new WalletConnectError(err.message)
  }
  return new WalletConnectError(String(err))
}
