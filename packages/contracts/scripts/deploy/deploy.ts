import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, createWalletClient, http, type Abi, type Hex } from 'viem'
import { hardhat } from 'viem/chains'

const currentDir = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(currentDir, '../../deployments/public.json')

async function loadArtifact(name: string): Promise<{ abi: Abi; bytecode: Hex }> {
  const path = resolve(currentDir, `../../artifacts/contracts/${name}.sol/${name}.json`)
  return JSON.parse(await readFile(path, 'utf8'))
}

function localRpcUrl(): string {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545'
  const url = new URL(rpcUrl)
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username || url.password
  ) {
    throw new Error('Local deployment requires an unauthenticated loopback HTTP RPC URL')
  }
  return rpcUrl
}

async function deployContracts() {
  const rpcUrl = localRpcUrl()

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(rpcUrl),
  })

  const walletClient = createWalletClient({
    chain: hardhat,
    transport: http(rpcUrl),
  })

  const chainId = await publicClient.getChainId()
  if (chainId !== hardhat.id) {
    throw new Error(`Expected local chain ${hardhat.id}, received ${chainId}`)
  }
  const [account] = await walletClient.getAddresses()
  if (!account) throw new Error('No unlocked local account. Start pnpm dev:chain first.')

  console.log(`Deploying from local account / TestUSD administrator: ${account}`)

  const testUsdArtifact = await loadArtifact('TestUSD')
  const daoArtifact = await loadArtifact('DAO')

  // Deploy TestUSD
  console.log('Deploying TestUSD...')
  const testUsdHash = await walletClient.deployContract({
    account,
    abi: testUsdArtifact.abi,
    bytecode: testUsdArtifact.bytecode,
    args: [account],
  })
  const testUsdReceipt = await publicClient.waitForTransactionReceipt({ hash: testUsdHash })
  if (testUsdReceipt.status !== 'success' || !testUsdReceipt.contractAddress) {
    throw new Error('TestUSD deployment failed; configuration was not updated')
  }
  const testUsdAddress = testUsdReceipt.contractAddress
  console.log(`TestUSD deployed at: ${testUsdAddress}`)

  // Deploy DAO
  console.log('Deploying DAO...')
  const daoHash = await walletClient.deployContract({
    account,
    abi: daoArtifact.abi,
    bytecode: daoArtifact.bytecode,
    args: [testUsdAddress],
  })
  const daoReceipt = await publicClient.waitForTransactionReceipt({ hash: daoHash })
  if (daoReceipt.status !== 'success' || !daoReceipt.contractAddress) {
    throw new Error('DAO deployment failed; configuration was not updated')
  }
  const daoAddress = daoReceipt.contractAddress
  console.log(`DAO deployed at: ${daoAddress}`)

  // Deploy AttendanceClaims (public attendance claims, spec 09)
  const attendanceClaimsArtifact = await loadArtifact('AttendanceClaims')
  console.log('Deploying AttendanceClaims...')
  const attendanceClaimsHash = await walletClient.deployContract({
    account,
    abi: attendanceClaimsArtifact.abi,
    bytecode: attendanceClaimsArtifact.bytecode,
    args: [daoAddress],
  })
  const attendanceClaimsReceipt = await publicClient.waitForTransactionReceipt({
    hash: attendanceClaimsHash,
  })
  if (attendanceClaimsReceipt.status !== 'success' || !attendanceClaimsReceipt.contractAddress) {
    throw new Error('AttendanceClaims deployment failed; configuration was not updated')
  }
  const attendanceClaimsAddress = attendanceClaimsReceipt.contractAddress
  console.log(`AttendanceClaims deployed at: ${attendanceClaimsAddress}`)

  // Update public manifest
  const manifest = {
    chainId,
    daoAddress,
    testUsdAddress,
    attendanceClaimsAddress,
    artifacts: {
      DAO: 'contracts/DAO.sol/DAO.json',
      TestUSD: 'contracts/TestUSD.sol/TestUSD.json',
      Treasury: 'contracts/Treasury.sol/Treasury.json',
      AttendanceClaims: 'contracts/AttendanceClaims.sol/AttendanceClaims.json',
    },
  }

  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('Updated deployments/public.json')
}

async function main() {
  await deployContracts()
}

// Only run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
