import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { getContract, decodeEventLog } from 'viem'
import { deployTestFixture } from './fixtures.js'

test('treasury creation on real local chain', async (t) => {
  const connection = await network.create('default')
  try {
    const fixture = await deployTestFixture(connection.provider as any)
    const { daoAddress, testUsdAddress, publicClient, walletClients, accounts, daoArtifact, testUsdArtifact, treasuryArtifact } = fixture

    const dao = getContract({
      address: daoAddress,
      abi: daoArtifact.abi,
      client: { public: publicClient, wallet: walletClients[0] },
    })

    const testUsd = getContract({
      address: testUsdAddress,
      abi: testUsdArtifact.abi,
      client: { public: publicClient, wallet: walletClients[0] },
    })

    await t.test('DAO deployment exposes shared TestUSD and initially has 0 treasuries', async () => {
      const retrievedTestUsd = await dao.read.testUsd()
      assert.equal((retrievedTestUsd as string).toLowerCase(), testUsdAddress.toLowerCase())

      const count = await dao.read.treasuryCount()
      assert.equal(count, 0n)

      const list = (await dao.read.getTreasuries()) as string[]
      assert.equal(list.length, 0)
    })

    await t.test('Caller 1 permissionlessly creates a treasury and becomes its administrator', async () => {
      const caller1Client = walletClients[1]
      const caller1Account = accounts[1]

      const daoAsCaller1 = getContract({
        address: daoAddress,
        abi: daoArtifact.abi,
        client: { public: publicClient, wallet: caller1Client },
      })

      const hash = await daoAsCaller1.write.createTreasury()
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      assert.equal(receipt.status, 'success')

      // Check event
      let createdTreasuryAddress: string | null = null
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: daoArtifact.abi,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'TreasuryCreated') {
            const args = decoded.args as unknown as { treasury: string; administrator: string }
            createdTreasuryAddress = args.treasury
            assert.equal(args.administrator.toLowerCase(), caller1Account.toLowerCase())
          }
        } catch {
          // not this event
        }
      }

      assert.ok(createdTreasuryAddress, 'TreasuryCreated event must be emitted')

      // Verify registry
      const count = await dao.read.treasuryCount()
      assert.equal(count, 1n)

      const isRegistered = await dao.read.isTreasury([createdTreasuryAddress])
      assert.equal(isRegistered, true)

      const treasuryAt0 = await dao.read.getTreasuryAt([0n])
      assert.equal((treasuryAt0 as string).toLowerCase(), createdTreasuryAddress.toLowerCase())

      // Inspect created treasury contract
      const treasury = getContract({
        address: createdTreasuryAddress as `0x${string}`,
        abi: treasuryArtifact.abi,
        client: { public: publicClient },
      })

      const admin = await treasury.read.administrator()
      assert.equal((admin as string).toLowerCase(), caller1Account.toLowerCase())

      const fundingAsset = await treasury.read.fundingAsset()
      assert.equal((fundingAsset as string).toLowerCase(), testUsdAddress.toLowerCase())

      const daoRef = await treasury.read.dao()
      assert.equal((daoRef as string).toLowerCase(), daoAddress.toLowerCase())
    })

    await t.test('Caller 2 creates another treasury with independent administrator assignment', async () => {
      const caller2Client = walletClients[2]
      const caller2Account = accounts[2]

      const daoAsCaller2 = getContract({
        address: daoAddress,
        abi: daoArtifact.abi,
        client: { public: publicClient, wallet: caller2Client },
      })

      const hash = await daoAsCaller2.write.createTreasury()
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      assert.equal(receipt.status, 'success')

      let createdTreasuryAddress2: string | null = null
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: daoArtifact.abi,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'TreasuryCreated') {
            const args = decoded.args as unknown as { treasury: string; administrator: string }
            createdTreasuryAddress2 = args.treasury
            assert.equal(args.administrator.toLowerCase(), caller2Account.toLowerCase())
          }
        } catch {}
      }

      assert.ok(createdTreasuryAddress2, 'Second TreasuryCreated event must be emitted')

      const count = await dao.read.treasuryCount()
      assert.equal(count, 2n)

      const treasury2 = getContract({
        address: createdTreasuryAddress2 as `0x${string}`,
        abi: treasuryArtifact.abi,
        client: { public: publicClient },
      })

      const admin2 = await treasury2.read.administrator()
      assert.equal((admin2 as string).toLowerCase(), caller2Account.toLowerCase())
      assert.notEqual((admin2 as string).toLowerCase(), accounts[1].toLowerCase())
    })

    await t.test('TestUSD currency minting administrator is separate from treasury administrators', async () => {
      const currencyAdminAccount = accounts[0]
      const treasuryAdminAccount = accounts[1]
      const caller1Client = walletClients[1]

      // Verify currencyAdmin on TestUSD
      const configuredAdmin = await testUsd.read.currencyAdmin()
      assert.equal((configuredAdmin as string).toLowerCase(), currencyAdminAccount.toLowerCase())

      // Currency admin can mint
      const mintAmount = 1000n * 10n ** 18n
      const mintHash = await testUsd.write.mint([treasuryAdminAccount, mintAmount])
      const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash })
      assert.equal(mintReceipt.status, 'success')

      const bal = await testUsd.read.balanceOf([treasuryAdminAccount])
      assert.equal(bal, mintAmount)

      // Treasury administrator CANNOT mint TestUSD
      const testUsdAsTreasuryAdmin = getContract({
        address: testUsdAddress,
        abi: testUsdArtifact.abi,
        client: { public: publicClient, wallet: caller1Client },
      })

      await assert.rejects(
        async () => {
          await testUsdAsTreasuryAdmin.write.mint([treasuryAdminAccount, mintAmount])
        },
        (err: Error) => {
          return err.message.includes('UnauthorizedCurrencyAdmin') || err.message.includes('revert')
        },
      )
    })

    await t.test('Treasury disallows arbitrary administrator withdrawals', async () => {
      const list = (await dao.read.getTreasuries()) as string[]
      const treasuryAddress = list[0] as `0x${string}`

      const treasuryAsAdmin = getContract({
        address: treasuryAddress,
        abi: treasuryArtifact.abi,
        client: { public: publicClient, wallet: walletClients[1] },
      })

      // Calling releaseFunds from administrator (not DAO) reverts with UnauthorizedCaller
      await assert.rejects(
        async () => {
          await treasuryAsAdmin.write.releaseFunds([accounts[1], 100n])
        },
        (err: Error) => {
          return err.message.includes('UnauthorizedCaller') || err.message.includes('revert')
        },
      )
    })
  } finally {
    await connection.close()
  }
})
