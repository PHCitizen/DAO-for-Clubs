import { formatUnits, getAddress, isAddress, type Abi, type Address } from 'viem'

// ---------------------------------------------------------------------------
// Contract read seam
// ---------------------------------------------------------------------------
//
// Treasury discovery only needs authenticated public chain reads. Keeping the
// seam at "call this view function" lets the application use an RPC endpoint
// and lets behavioral tests run the exact same reader against a real local EVM.

export interface ContractReadRequest {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export interface ContractReader {
  getChainId(): Promise<number>
  readContract<T = unknown>(request: ContractReadRequest): Promise<T>
}

export interface TreasuryAbis {
  DAO: Abi
  Treasury: Abi
  TestUSD: Abi
}

export interface TreasuryReadConfig {
  /** Deployment identity; reads reject results from any other chain. */
  chainId: number
  daoAddress: Address
  abis: TreasuryAbis
}

// ---------------------------------------------------------------------------
// Treasury read results
// ---------------------------------------------------------------------------

export interface TreasurySnapshot {
  /** Checksummed treasury identity as registered by the DAO. */
  address: Address
  administrator: Address
  /** Shared TestUSD contract configured as the treasury's funding asset. */
  fundingAsset: Address
  fundingAssetSymbol: string
  fundingAssetDecimals: number
  /** Raw TestUSD balance in the asset's smallest unit. */
  balance: bigint
  /** Exact human-readable balance using the funding asset's decimals. */
  formattedBalance: string
}

export interface TreasuryReads {
  /** Returns registered treasury identities in registry order, without duplicates. */
  listTreasuries(): Promise<Address[]>
  /** Returns null when the address is not a treasury registered by this DAO. */
  readTreasury(address: string): Promise<TreasurySnapshot | null>
}

export class TreasuryChainMismatchError extends Error {
  readonly kind = 'treasury-chain-mismatch' as const
  constructor(
    readonly expectedChainId: number,
    readonly actualChainId: number
  ) {
    super(
      `Treasury reads require chain ${expectedChainId}, but the RPC endpoint reported chain ${actualChainId}.`
    )
    this.name = 'TreasuryChainMismatchError'
  }
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

async function assertDeploymentChain(
  reader: ContractReader,
  config: TreasuryReadConfig
): Promise<void> {
  const actualChainId = await reader.getChainId()
  if (actualChainId !== config.chainId) {
    throw new TreasuryChainMismatchError(config.chainId, actualChainId)
  }
}

function normalizeTreasuryAddress(address: string): Address | null {
  if (!isAddress(address)) return null
  return getAddress(address)
}

export function createTreasuryReads(
  reader: ContractReader,
  config: TreasuryReadConfig
): TreasuryReads {
  return {
    async listTreasuries(): Promise<Address[]> {
      await assertDeploymentChain(reader, config)

      const registered = await reader.readContract<readonly Address[]>({
        address: config.daoAddress,
        abi: config.abis.DAO,
        functionName: 'getTreasuries',
      })

      // The DAO registry already rejects duplicates; deduplicate defensively so
      // repeated refresh reads can never accumulate duplicate navigable records.
      const seen = new Set<string>()
      const treasuries: Address[] = []
      for (const address of registered) {
        const normalized = getAddress(address)
        const key = normalized.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        treasuries.push(normalized)
      }
      return treasuries
    },

    async readTreasury(address: string): Promise<TreasurySnapshot | null> {
      const normalized = normalizeTreasuryAddress(address)
      if (normalized === null) return null

      await assertDeploymentChain(reader, config)

      const isRegistered = await reader.readContract<boolean>({
        address: config.daoAddress,
        abi: config.abis.DAO,
        functionName: 'isTreasury',
        args: [normalized],
      })
      if (!isRegistered) return null

      const [administrator, fundingAsset] = await Promise.all([
        reader.readContract<Address>({
          address: normalized,
          abi: config.abis.Treasury,
          functionName: 'administrator',
        }),
        reader.readContract<Address>({
          address: normalized,
          abi: config.abis.Treasury,
          functionName: 'fundingAsset',
        }),
      ])

      const normalizedFundingAsset = getAddress(fundingAsset)
      const [symbol, decimals, balance] = await Promise.all([
        reader.readContract<string>({
          address: normalizedFundingAsset,
          abi: config.abis.TestUSD,
          functionName: 'symbol',
        }),
        reader.readContract<number>({
          address: normalizedFundingAsset,
          abi: config.abis.TestUSD,
          functionName: 'decimals',
        }),
        reader.readContract<bigint>({
          address: normalizedFundingAsset,
          abi: config.abis.TestUSD,
          functionName: 'balanceOf',
          args: [normalized],
        }),
      ])

      const fundingAssetDecimals = Number(decimals)
      return {
        address: normalized,
        administrator: getAddress(administrator),
        fundingAsset: normalizedFundingAsset,
        fundingAssetSymbol: symbol,
        fundingAssetDecimals,
        balance,
        formattedBalance: formatUnits(balance, fundingAssetDecimals),
      }
    },
  }
}
