import { writeFile, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { hardhat } from 'viem/chains'
import { loadArtifact } from '../../test/fixtures.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(currentDir, '../../deployments/public.json')

// Default local Hardhat account #0 private key
const DEFAULT_LOCAL_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

async function deployContracts() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545'
  const privateKey = (process.env.DEPLOYER_PRIVATE_KEY as Hex) || DEFAULT_LOCAL_KEY
  const account = privateKeyToAccount(privateKey)

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(rpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http(rpcUrl),
  })

  console.log(`Deploying from account: ${account.address}`)

  const testUsdArtifact = await loadArtifact('TestUSD', 'TestUSD.sol')
  const daoArtifact = await loadArtifact('DAO', 'DAO.sol')

  // Deploy TestUSD
  console.log('Deploying TestUSD...')
  const testUsdHash = await walletClient.deployContract({
    abi: testUsdArtifact.abi,
    bytecode: testUsdArtifact.bytecode,
    args: [account.address],
  })
  const testUsdReceipt = await publicClient.waitForTransactionReceipt({ hash: testUsdHash })
  const testUsdAddress = testUsdReceipt.contractAddress!
  console.log(`TestUSD deployed at: ${testUsdAddress}`)

  // Deploy DAO
  console.log('Deploying DAO...')
  const daoHash = await walletClient.deployContract({
    abi: daoArtifact.abi,
    bytecode: daoArtifact.bytecode,
    args: [testUsdAddress],
  })
  const daoReceipt = await publicClient.waitForTransactionReceipt({ hash: daoHash })
  const daoAddress = daoReceipt.contractAddress!
  console.log(`DAO deployed at: ${daoAddress}`)

  // Update public manifest
  const rawManifest = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(rawManifest)
  manifest.daoAddress = daoAddress
  manifest.testUsdAddress = testUsdAddress
  manifest.artifacts = {
    DAO: 'contracts/DAO.sol/DAO.json',
    TestUSD: 'contracts/TestUSD.sol/TestUSD.json',
    Treasury: 'contracts/Treasury.sol/Treasury.json',
  }

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
