import publicArtifacts from './generated/public-artifacts.json' with { type: 'json' }
import type { Address } from './wallet.js'

export interface ChainDefinition {
  chainId: number
  name: string
  shortName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: readonly string[]
  blockExplorerUrls?: readonly string[]
}

export const BSC_TESTNET: ChainDefinition = {
  chainId: 97,
  name: 'BNB Smart Chain Testnet',
  shortName: 'BSC Testnet',
  nativeCurrency: {
    name: 'tBNB',
    symbol: 'tBNB',
    decimals: 18,
  },
  rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
  blockExplorerUrls: ['https://testnet.bscscan.com'],
}

export const LOCAL_CHAIN: ChainDefinition = {
  chainId: 31337,
  name: 'Local Development',
  shortName: 'Localhost',
  nativeCurrency: {
    name: 'Test BNB',
    symbol: 'tBNB',
    decimals: 18,
  },
  rpcUrls: ['http://127.0.0.1:8545'],
  blockExplorerUrls: [],
}

export const SUPPORTED_CHAINS: readonly ChainDefinition[] = [BSC_TESTNET, LOCAL_CHAIN]

export function getSupportedChain(chainId: number): ChainDefinition | undefined {
  return SUPPORTED_CHAINS.find((c) => c.chainId === chainId)
}

export function isSupportedChain(chainId: number): boolean {
  return getSupportedChain(chainId) !== undefined
}

export interface DeploymentConfig {
  chainId: number
  daoAddress: Address | null
  testUsdAddress?: Address | null
  rpcUrl?: string
}

export const DEFAULT_DEPLOYMENT_CONFIG: DeploymentConfig = {
  chainId: publicArtifacts.chainId ?? 31337,
  daoAddress: (publicArtifacts.daoAddress as Address | null) ?? null,
  testUsdAddress: (publicArtifacts.testUsdAddress as Address | null) ?? null,
}

export interface DeploymentContext {
  chainId: number
  chainName: string
  isSupported: boolean
  daoAddress: Address | null
  testUsdAddress: Address | null
  isDeployed: boolean
  rpcUrl?: string
  chain?: ChainDefinition
}

export function resolveDeploymentContext(overrides?: Partial<DeploymentConfig>): DeploymentContext {
  const chainId = overrides?.chainId ?? DEFAULT_DEPLOYMENT_CONFIG.chainId
  const daoAddress = overrides?.daoAddress !== undefined ? overrides.daoAddress : DEFAULT_DEPLOYMENT_CONFIG.daoAddress
  const testUsdAddress = overrides?.testUsdAddress !== undefined ? overrides.testUsdAddress : (DEFAULT_DEPLOYMENT_CONFIG.testUsdAddress ?? null)
  const chain = getSupportedChain(chainId)
  const isSupported = chain !== undefined
  const chainName = chain?.name ?? `Unsupported Chain (${chainId})`
  const rpcUrl = overrides?.rpcUrl ?? chain?.rpcUrls[0]

  return {
    chainId,
    chainName,
    isSupported,
    daoAddress,
    testUsdAddress,
    isDeployed: daoAddress !== null,
    rpcUrl,
    chain,
  }
}
