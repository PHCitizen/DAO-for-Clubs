import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { getAddress, getContract, type Address } from 'viem'
import {
  createTreasuryReads,
  TreasuryChainMismatchError,
  type ContractReader,
  type ContractReadRequest,
} from '../../frontend/src/treasury.ts'
import { deployTestFixture } from './fixtures.js'

test('treasury discovery and inspection on a real local chain', async (t) => {
  const connection = await network.create('default')
  try {
    const fixture = await deployTestFixture(connection.provider as any)
    const {
      daoAddress,
      testUsdAddress,
      publicClient,
      walletClients,
      accounts,
      daoArtifact,
      testUsdArtifact,
      treasuryArtifact,
    } = fixture

    const chainReader: ContractReader = {
      getChainId: () => publicClient.getChainId(),
      readContract: <T = unknown>(request: ContractReadRequest): Promise<T> =>
        publicClient.readContract(request as any) as Promise<T>,
    }

    const config = {
      chainId: 31337,
      daoAddress,
      abis: {
        DAO: daoArtifact.abi,
        Treasury: treasuryArtifact.abi,
        TestUSD: testUsdArtifact.abi,
      },
    }
    const reads = createTreasuryReads(chainReader, config)

    let treasuryA: Address
    let treasuryB: Address

    await t.test('wallet-free reads return an empty registry as success', async () => {
      assert.deepEqual(await reads.listTreasuries(), [])
    })

    await t.test('registers two treasuries created by different administrators', async () => {
      const daoAsCaller1 = getContract({
        address: daoAddress,
        abi: daoArtifact.abi,
        client: { public: publicClient, wallet: walletClients[1] },
      })
      const firstHash = await daoAsCaller1.write.createTreasury()
      await publicClient.waitForTransactionReceipt({ hash: firstHash })

      const daoAsCaller2 = getContract({
        address: daoAddress,
        abi: daoArtifact.abi,
        client: { public: publicClient, wallet: walletClients[2] },
      })
      const secondHash = await daoAsCaller2.write.createTreasury()
      await publicClient.waitForTransactionReceipt({ hash: secondHash })

      const registered = (await daoAsCaller1.read.getTreasuries()) as Address[]
      assert.equal(registered.length, 2)
      treasuryA = registered[0]!
      treasuryB = registered[1]!
    })

    await t.test('lists both registrations by stable identity without duplicates', async () => {
      const first = await reads.listTreasuries()
      const second = await reads.listTreasuries()

      assert.deepEqual(first, [getAddress(treasuryA), getAddress(treasuryB)])
      assert.deepEqual(second, first)
    })

    await t.test('inspects a zero balance and the recorded administrator and shared asset', async () => {
      const snapshot = await reads.readTreasury(treasuryA)

      assert.ok(snapshot)
      assert.equal(snapshot.address, getAddress(treasuryA))
      assert.equal(snapshot.administrator.toLowerCase(), accounts[1]!.toLowerCase())
      assert.equal(snapshot.fundingAsset.toLowerCase(), testUsdAddress.toLowerCase())
      assert.equal(snapshot.fundingAssetSymbol, 'TUSD')
      assert.equal(snapshot.fundingAssetDecimals, 18)
      assert.equal(snapshot.balance, 0n)
      assert.equal(snapshot.formattedBalance, '0')
    })

    await t.test('keeps two treasuries independent after an external TestUSD deposit', async () => {
      const deposit = 12_500_000_000_000_000_000n

      const testUsdAsCurrencyAdmin = getContract({
        address: testUsdAddress,
        abi: testUsdArtifact.abi,
        client: { public: publicClient, wallet: walletClients[0] },
      })
      const mintHash = await testUsdAsCurrencyAdmin.write.mint([accounts[1]!, deposit])
      await publicClient.waitForTransactionReceipt({ hash: mintHash })

      const testUsdAsCaller1 = getContract({
        address: testUsdAddress,
        abi: testUsdArtifact.abi,
        client: { public: publicClient, wallet: walletClients[1] },
      })
      const transferHash = await testUsdAsCaller1.write.transfer([treasuryA, deposit])
      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash })
      assert.equal(transferReceipt.status, 'success')

      const [funded, untouched] = await Promise.all([
        reads.readTreasury(treasuryA),
        reads.readTreasury(treasuryB),
      ])

      assert.ok(funded)
      assert.ok(untouched)
      assert.equal(funded.formattedBalance, '12.5')
      assert.equal(funded.balance, deposit)
      assert.equal(untouched.formattedBalance, '0')
      assert.equal(untouched.administrator.toLowerCase(), accounts[2]!.toLowerCase())
    })

    await t.test('returns null for an address that is not a registered treasury', async () => {
      assert.equal(await reads.readTreasury(accounts[5]!), null)
    })

    await t.test('surfaces a controlled transport failure and recovers on retry', async () => {
      let transportDown = true
      const flakyReader: ContractReader = {
        getChainId: () => publicClient.getChainId(),
        readContract: async <T = unknown>(request: ContractReadRequest): Promise<T> => {
          if (transportDown) throw new Error('transport offline')
          return chainReader.readContract<T>(request)
        },
      }
      const flakyReads = createTreasuryReads(flakyReader, config)

      await assert.rejects(() => flakyReads.listTreasuries(), /transport offline/)

      transportDown = false
      const retried = await flakyReads.listTreasuries()
      assert.equal(retried.length, 2)
      assert.deepEqual(retried, [getAddress(treasuryA), getAddress(treasuryB)])
    })

    await t.test('rejects reads from a different chain instead of mixing deployments', async () => {
      const wrongChainReader: ContractReader = {
        getChainId: async () => 97,
        readContract: chainReader.readContract,
      }
      const wrongChainReads = createTreasuryReads(wrongChainReader, config)

      await assert.rejects(
        () => wrongChainReads.listTreasuries(),
        (error: unknown) =>
          error instanceof TreasuryChainMismatchError &&
          error.expectedChainId === 31337 &&
          error.actualChainId === 97
      )
    })
  } finally {
    await connection.close()
  }
})
