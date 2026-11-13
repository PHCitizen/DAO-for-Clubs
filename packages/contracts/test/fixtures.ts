import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  custom,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
  type EIP1193Provider,
  type Abi,
} from 'viem'
import { hardhat } from 'viem/chains'

const currentDir = dirname(fileURLToPath(import.meta.url))
const artifactsDir = resolve(currentDir, '../artifacts/contracts')

export interface ContractArtifact {
  abi: Abi
  bytecode: Hex
}

export async function loadArtifact(contractName: string, solFile: string): Promise<ContractArtifact> {
  const filePath = resolve(artifactsDir, `${solFile}/${contractName}.json`)
  const raw = await readFile(filePath, 'utf8')
  const json = JSON.parse(raw)
  return {
    abi: json.abi as Abi,
    bytecode: json.bytecode as Hex,
  }
}

export interface DeploymentFixture {
  testUsdAddress: Address
  daoAddress: Address
  attendanceClaimsAddress: Address
  publicClient: PublicClient
  walletClients: WalletClient[]
  accounts: Address[]
  daoArtifact: ContractArtifact
  testUsdArtifact: ContractArtifact
  treasuryArtifact: ContractArtifact
  attendanceClaimsArtifact: ContractArtifact
}

export async function deployTestFixture(provider: EIP1193Provider): Promise<DeploymentFixture> {
  const daoArtifact = await loadArtifact('DAO', 'DAO.sol')
  const testUsdArtifact = await loadArtifact('TestUSD', 'TestUSD.sol')
  const treasuryArtifact = await loadArtifact('Treasury', 'Treasury.sol')
  const attendanceClaimsArtifact = await loadArtifact('AttendanceClaims', 'AttendanceClaims.sol')

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: custom(provider),
  })

  const rawAccounts = (await provider.request({ method: 'eth_accounts' })) as Address[]
  if (!rawAccounts || rawAccounts.length === 0) {
    throw new Error('No accounts available from provider')
  }

  const walletClients = rawAccounts.map((account) =>
    createWalletClient({
      account,
      chain: hardhat,
      transport: custom(provider),
    }),
  )

  const deployer = walletClients[0]
  const currencyAdmin = rawAccounts[0]

  // Deploy TestUSD
  const testUsdDeployHash = await deployer.deployContract({
    abi: testUsdArtifact.abi,
    bytecode: testUsdArtifact.bytecode,
    args: [currencyAdmin],
  })

  const testUsdReceipt = await publicClient.waitForTransactionReceipt({
    hash: testUsdDeployHash,
  })

  if (!testUsdReceipt.contractAddress) {
    throw new Error('TestUSD deployment failed - no contract address')
  }
  const testUsdAddress = testUsdReceipt.contractAddress

  // Deploy DAO
  const daoDeployHash = await deployer.deployContract({
    abi: daoArtifact.abi,
    bytecode: daoArtifact.bytecode,
    args: [testUsdAddress],
  })

  const daoReceipt = await publicClient.waitForTransactionReceipt({
    hash: daoDeployHash,
  })

  if (!daoReceipt.contractAddress) {
    throw new Error('DAO deployment failed - no contract address')
  }
  const daoAddress = daoReceipt.contractAddress

  // Deploy AttendanceClaims
  const attendanceClaimsDeployHash = await deployer.deployContract({
    abi: attendanceClaimsArtifact.abi,
    bytecode: attendanceClaimsArtifact.bytecode,
    args: [daoAddress],
  })

  const attendanceClaimsReceipt = await publicClient.waitForTransactionReceipt({
    hash: attendanceClaimsDeployHash,
  })

  if (!attendanceClaimsReceipt.contractAddress) {
    throw new Error('AttendanceClaims deployment failed - no contract address')
  }
  const attendanceClaimsAddress = attendanceClaimsReceipt.contractAddress

  return {
    testUsdAddress,
    daoAddress,
    attendanceClaimsAddress,
    publicClient,
    walletClients,
    accounts: rawAccounts,
    daoArtifact,
    testUsdArtifact,
    treasuryArtifact,
    attendanceClaimsArtifact,
  }
}
