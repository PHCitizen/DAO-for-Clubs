import { createPublicClient, erc20Abi, http, parseAbi, type Abi, type Hash, type Hex, type PublicClient, type TransactionReceipt } from 'viem'
import type { Address } from './wallet.js'
import type { ContractReadRequest } from './treasury.js'
import type { TestUsdTransactionReceipt } from './testusd.js'

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
  contracts?: FundingContractOperations
  getChainId(): Promise<number>
  getBlockNumber(): Promise<bigint>
  /**
   * Executes a public view/pure contract call without a wallet. Optional so
   * simple chain-status adapters remain valid; treasury reads report an
   * unconfigured state when no contract reader is available.
   */
  readContract?<T = unknown>(request: ContractReadRequest): Promise<T>
  /**
   * Waits for a submitted transaction to be included and returns its confirmed
   * status, block, and logs. Optional for read-only transport stubs.
   */
  waitForTransactionReceipt?(hash: Hex): Promise<TestUsdTransactionReceipt>
}

export interface FundingContractOperations {
  readDeployment(dao: Address, treasury: Address): Promise<{ shared: Address; registered: boolean; ownerDao: Address; fundingAsset: Address }>
  readBalances(asset: Address, sender: Address, treasury: Address): Promise<{ decimals: number; senderBalance: bigint; treasuryBalance: bigint }>
  waitForReceipt(hash: Hash): Promise<Pick<TransactionReceipt, 'status' | 'transactionHash' | 'logs'>>
}

const fundingDaoAbi = parseAbi(['function testUsd() view returns (address)', 'function isTreasury(address) view returns (bool)'])
const fundingTreasuryAbi = parseAbi(['function dao() view returns (address)', 'function fundingAsset() view returns (address)'])

async function withRpcError<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() }
  catch (error) { throw new RpcUnavailableError(error instanceof Error ? error.message : String(error)) }
}

/** Wrap the transport client once; callers receive only the operations funding needs. */
export function createRpcAdapter(client: Pick<PublicClient, 'getChainId' | 'getBlockNumber' | 'readContract' | 'waitForTransactionReceipt'>): RpcAdapter {
  return {
    getChainId: () => withRpcError(() => client.getChainId()),
    getBlockNumber: () => withRpcError(() => client.getBlockNumber()),
    waitForTransactionReceipt: hash => withRpcError(async () => {
      const receipt = await client.waitForTransactionReceipt({ hash })
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs.map(log => ({ address: log.address, data: log.data, topics: log.topics })),
      }
    }),
    readContract: <T = unknown>(request: ContractReadRequest): Promise<T> => withRpcError(async () =>
      await client.readContract(request as { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }) as T
    ),
    contracts: {
      readDeployment: (dao, treasury) => withRpcError(async () => {
        const [shared, registered, ownerDao, fundingAsset] = await Promise.all([
          client.readContract({ address: dao, abi: fundingDaoAbi, functionName: 'testUsd' }),
          client.readContract({ address: dao, abi: fundingDaoAbi, functionName: 'isTreasury', args: [treasury] }),
          client.readContract({ address: treasury, abi: fundingTreasuryAbi, functionName: 'dao' }),
          client.readContract({ address: treasury, abi: fundingTreasuryAbi, functionName: 'fundingAsset' }),
        ])
        return { shared, registered, ownerDao, fundingAsset }
      }),
      readBalances: (asset, sender, treasury) => withRpcError(async () => {
        const [decimals, senderBalance, treasuryBalance] = await Promise.all([
          client.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' }),
          client.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [sender] }),
          client.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [treasury] }),
        ])
        return { decimals, senderBalance, treasuryBalance }
      }),
      waitForReceipt: hash => withRpcError(() => client.waitForTransactionReceipt({ hash })),
    },
  }
}

/**
 * Returns the production RPC adapter that communicates with the network's JSON-RPC endpoint.
 */
export function createBrowserRpcAdapter(rpcUrl: string): RpcAdapter {
  const client = createPublicClient({
    transport: http(rpcUrl),
  })

  return createRpcAdapter(client)
}
