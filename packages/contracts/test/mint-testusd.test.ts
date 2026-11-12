import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import {
  encodeFunctionData,
  getAddress,
  getContract,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from 'viem'
import {
  mintTestUsd,
  parseTestUsdAmount,
  readTestUsdInfo,
  TestUsdChainMismatchError,
  TestUsdMintRevertedError,
  TestUsdSubmissionError,
  type TestUsdChain,
  type TestUsdReadRequest,
  type TestUsdTransactionReceipt,
} from '../../frontend/src/testusd.ts'
import { deployTestFixture } from './fixtures.js'

function makeTestUsdChain(
  provider: EIP1193Provider,
  publicClient: PublicClient
): TestUsdChain {
  return {
    getChainId: () => publicClient.getChainId(),
    readContract: <T = unknown>(request: TestUsdReadRequest): Promise<T> =>
      publicClient.readContract(request as any) as Promise<T>,
    // Mirror the browser wallet seam: encode calldata and submit raw
    // `eth_sendTransaction` without an extra simulation pass.
    sendTransaction: async (request) => {
      const data = encodeFunctionData({
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
      })
      return (await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: request.from, to: request.address, data }],
      })) as Hex
    },
    waitForTransactionReceipt: async (hash: Hex): Promise<TestUsdTransactionReceipt> => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          data: log.data,
          topics: log.topics,
        })),
      }
    },
  }
}

test('TestUSD minting on a real local chain', async (t) => {
  const connection = await network.create('default')
  try {
    const fixture = await deployTestFixture(connection.provider as any)
    const {
      testUsdAddress,
      daoAddress,
      publicClient,
      walletClients,
      accounts,
      daoArtifact,
      testUsdArtifact,
      treasuryArtifact,
    } = fixture

    const currencyAdmin = accounts[0]!
    const treasuryAdmin = accounts[1]!
    const recipient = accounts[3]!
    const tinyRecipient = accounts[4]!

    const config = {
      chainId: 31337,
      testUsdAddress,
      abi: testUsdArtifact.abi,
    }
    const chain = makeTestUsdChain(connection.provider as EIP1193Provider, publicClient)

    const testUsd = getContract({
      address: testUsdAddress,
      abi: testUsdArtifact.abi,
      client: { public: publicClient },
    })

    await t.test('reads the deployed shared token identity', async () => {
      const info = await readTestUsdInfo(chain, config)

      assert.equal(info.address, getAddress(testUsdAddress))
      assert.equal(info.symbol, 'TUSD')
      assert.equal(info.decimals, 18)
      assert.equal(info.currencyAdmin.toLowerCase(), currencyAdmin.toLowerCase())
    })

    await t.test('parses decimal amounts with the token decimals and no float error', () => {
      const oneAndAHalf = parseTestUsdAmount('1.5', 18)
      assert.equal(oneAndAHalf.ok, true)
      if (oneAndAHalf.ok) {
        assert.equal(oneAndAHalf.amount, 1_500_000_000_000_000_000n)
        assert.equal(oneAndAHalf.formattedAmount, '1.5')
      }

      const smallestUnit = parseTestUsdAmount('0.000000000000000001', 18)
      assert.equal(smallestUnit.ok, true)
      if (smallestUnit.ok) assert.equal(smallestUnit.amount, 1n)

      for (const invalid of [
        '0',
        '0.0000000000000000001',
        '1.0000000000000000001',
        '1e3',
        'abc',
        '',
        '-1',
      ]) {
        assert.equal(parseTestUsdAmount(invalid, 18).ok, false, `${invalid} must be rejected`)
      }

      const sixDecimals = parseTestUsdAmount('1.234567', 6)
      assert.equal(sixDecimals.ok, true)
      if (sixDecimals.ok) assert.equal(sixDecimals.amount, 1_234_567n)
      assert.equal(parseTestUsdAmount('1.2345678', 6).ok, false)
    })

    await t.test('authorized administrator mints and sees the confirmed balance', async () => {
      const outcome = await mintTestUsd(chain, config, {
        from: currencyAdmin,
        recipient,
        amount: '12.5',
      })

      assert.equal(outcome.status, 'success')
      if (outcome.status !== 'success') return

      assert.equal(outcome.chainId, 31337)
      assert.equal(outcome.recipient, getAddress(recipient))
      assert.equal(outcome.amount, 12_500_000_000_000_000_000n)
      assert.equal(outcome.formattedAmount, '12.5')
      assert.equal(outcome.recipientBalance, 12_500_000_000_000_000_000n)
      assert.equal(outcome.formattedRecipientBalance, '12.5')
      assert.equal(outcome.currencyAdmin.toLowerCase(), currencyAdmin.toLowerCase())

      const receipt = await publicClient.waitForTransactionReceipt({ hash: outcome.hash })
      assert.equal(receipt.status, 'success')
      assert.equal(outcome.blockNumber, receipt.blockNumber)
      assert.equal(
        await testUsd.read.balanceOf([recipient]),
        12_500_000_000_000_000_000n
      )
    })

    await t.test('mints the smallest unit without losing precision', async () => {
      const outcome = await mintTestUsd(chain, config, {
        from: currencyAdmin,
        recipient: tinyRecipient,
        amount: '0.000000000000000001',
      })

      assert.equal(outcome.status, 'success')
      if (outcome.status !== 'success') return
      assert.equal(outcome.amount, 1n)
      assert.equal(outcome.formattedAmount, '0.000000000000000001')
      assert.equal(outcome.recipientBalance, 1n)
      assert.equal(await testUsd.read.balanceOf([tinyRecipient]), 1n)
    })

    await t.test('rejects a treasury administrator who lacks TestUSD authority', async () => {
      const daoAsTreasuryAdmin = getContract({
        address: daoAddress,
        abi: daoArtifact.abi,
        client: { public: publicClient, wallet: walletClients[1]! },
      })
      const createHash = await daoAsTreasuryAdmin.write.createTreasury()
      await publicClient.waitForTransactionReceipt({ hash: createHash })

      const treasuries = (await daoAsTreasuryAdmin.read.getTreasuries()) as Address[]
      const treasuryAddress = treasuries[0]!
      const treasury = getContract({
        address: treasuryAddress,
        abi: treasuryArtifact.abi,
        client: { public: publicClient },
      })
      assert.equal(
        ((await treasury.read.administrator()) as string).toLowerCase(),
        treasuryAdmin.toLowerCase()
      )
      assert.notEqual(
        treasuryAdmin.toLowerCase(),
        currencyAdmin.toLowerCase(),
        'the treasury administrator must not also be the currency administrator'
      )

      const appOutcome = await mintTestUsd(chain, config, {
        from: treasuryAdmin,
        recipient,
        amount: '1',
      })
      assert.equal(appOutcome.status, 'unauthorized')

      const testUsdAsTreasuryAdmin = getContract({
        address: testUsdAddress,
        abi: testUsdArtifact.abi,
        client: { public: publicClient, wallet: walletClients[1]! },
      })
      await assert.rejects(
        () => testUsdAsTreasuryAdmin.write.mint([recipient, 1n]),
        (error: Error) =>
          error.message.includes('UnauthorizedCurrencyAdmin') || error.message.includes('revert')
      )
    })

    await t.test('a reverting mint is reported as a failure, not a success', async () => {
      const balanceBefore = await testUsd.read.balanceOf([recipient])

      // Simulate a stale metadata read that lets the unauthorized wallet reach
      // the chain. Hardhat's local EVM rejects a reverting transaction during
      // submission, so the failure may surface either at submission or as a
      // reverted receipt; both must remain non-success outcomes.
      const staleMetadataChain: TestUsdChain = {
        ...chain,
        readContract: async <T = unknown>(request: TestUsdReadRequest): Promise<T> => {
          if (request.functionName === 'currencyAdmin') {
            return treasuryAdmin as unknown as T
          }
          return chain.readContract<T>(request)
        },
      }

      await assert.rejects(
        () =>
          mintTestUsd(staleMetadataChain, config, {
            from: treasuryAdmin,
            recipient,
            amount: '1',
          }),
        (error: unknown) =>
          error instanceof TestUsdMintRevertedError ||
          error instanceof TestUsdSubmissionError
      )

      assert.equal(await testUsd.read.balanceOf([recipient]), balanceBefore)
    })

    await t.test('rejects reads and mints from a different chain', async () => {
      const wrongChain: TestUsdChain = {
        ...chain,
        getChainId: async () => 97,
      }

      await assert.rejects(
        () => readTestUsdInfo(wrongChain, config),
        (error: unknown) =>
          error instanceof TestUsdChainMismatchError &&
          error.expectedChainId === 31337 &&
          error.actualChainId === 97
      )
      await assert.rejects(
        () =>
          mintTestUsd(wrongChain, config, {
            from: currencyAdmin,
            recipient,
            amount: '1',
          }),
        TestUsdChainMismatchError
      )
    })
  } finally {
    await connection.close()
  }
})
