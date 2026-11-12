import { createPublicClient, http, type Abi } from 'viem'
import type { Address } from './wallet'
import type { ContractReadRequest } from './treasury'

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export class WalletNotConnectedError extends Error {
  readonly kind = 'wallet-not-connected' as const
  constructor(message = 'A connected wallet is required to prepare a deployment action.') {
    super(message)
    this.name = 'WalletNotConnectedError'
  }
}

export class DeploymentNotDeployedError extends Error {
  readonly kind = 'deployment-not-deployed' as const
  readonly chainId: number
  constructor(chainId: number, message?: string) {
    super(message ?? `Cannot prepare action: DAO has not been deployed on chain ${chainId}.`)
    this.name = 'DeploymentNotDeployedError'
    this.chainId = chainId
  }
}

export class DeploymentNotConfiguredError extends Error {
  readonly kind = 'deployment-not-configured' as const
  constructor(message = 'Cannot prepare action: Deployment configuration is missing or invalid.') {
    super(message)
    this.name = 'DeploymentNotConfiguredError'
  }
}

export class ChainMismatchError extends Error {
  readonly kind = 'chain-mismatch' as const
  readonly expectedChainId: number
  readonly actualChainId: number
  constructor(expectedChainId: number, actualChainId: number, message?: string) {
    super(
      message ??
        `Cannot prepare action: Wallet is on chain ${actualChainId}, but deployment requires chain ${expectedChainId}.`
    )
    this.name = 'ChainMismatchError'
    this.expectedChainId = expectedChainId
    this.actualChainId = actualChainId
  }
}

export class StaleActionConfigurationError extends Error {
  readonly kind = 'stale-configuration' as const
  constructor(
    message = 'Network or account changed during action preparation. Please prepare the action again.'
  ) {
    super(message)
    this.name = 'StaleActionConfigurationError'
  }
}

export class RpcUnavailableError extends Error {
  readonly kind = 'rpc-unavailable' as const
  constructor(message = 'The configured RPC endpoint is unavailable.') {
    super(message)
    this.name = 'RpcUnavailableError'
  }
}

// ---------------------------------------------------------------------------
// RPC Adapter Seam
// ---------------------------------------------------------------------------

export interface RpcAdapter {
  getChainId(): Promise<number>
  getBlockNumber(): Promise<bigint>
  /**
   * Executes a public view/pure contract call without a wallet. Optional so
   * simple chain-status adapters remain valid; treasury reads report an
   * unconfigured state when no contract reader is available.
   */
  readContract?<T = unknown>(request: ContractReadRequest): Promise<T>
}

/**
 * Returns the production RPC adapter that communicates with the network's JSON-RPC endpoint.
 */
export function createBrowserRpcAdapter(rpcUrl: string): RpcAdapter {
  const client = createPublicClient({
    transport: http(rpcUrl),
  })

  return {
    async getChainId(): Promise<number> {
      try {
        return await client.getChainId()
      } catch (err) {
        throw new RpcUnavailableError(err instanceof Error ? err.message : String(err))
      }
    },

    async getBlockNumber(): Promise<bigint> {
      try {
        return await client.getBlockNumber()
      } catch (err) {
        throw new RpcUnavailableError(err instanceof Error ? err.message : String(err))
      }
    },

    async readContract<T = unknown>(request: ContractReadRequest): Promise<T> {
      try {
        return (await client.readContract(request as {
          address: Address
          abi: Abi
          functionName: string
          args?: readonly unknown[]
        })) as T
      } catch (err) {
        throw new RpcUnavailableError(err instanceof Error ? err.message : String(err))
      }
    },
  }
}
