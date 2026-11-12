import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, erc20Abi, getContract } from 'viem'
import { deployTestFixture } from './fixtures.js'
import { createApplication } from '../../frontend/src/application.js'
import type { WalletAdapter } from '../../frontend/src/wallet.js'

test('application funding validates deployment and amounts, tracks transactions and independently refreshes real balances', async () => {
  // Return mined reverted receipts, as a production RPC does.
  const connection = await network.create({ network: 'default', override: { throwOnTransactionFailures: false } })
  try {
    const f = await deployTestFixture(connection.provider as any)
    const dao = getContract({ address: f.daoAddress, abi: f.daoArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[0] } })
    for (let i = 0; i < 2; i++) await f.publicClient.waitForTransactionReceipt({ hash: await dao.write.createTreasury() })
    const treasuries = await dao.read.getTreasuries() as `0x${string}`[]
    const token = getContract({ address: f.testUsdAddress, abi: f.testUsdArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[0] } })
    await f.publicClient.waitForTransactionReceipt({ hash: await token.write.mint([f.accounts[1], 100n * 10n ** 18n]) })
    let mode = 'normal'
    const wallet: WalletAdapter = {
      connect: async () => f.accounts[1], disconnect: async () => {}, getAccount: async () => f.accounts[1],
      getChainId: async () => 31337, isAvailable: () => true, switchChain: async () => {},
      onAccountChanged: () => () => {}, onChainChanged: () => () => {},
      sendTransaction: async (tx) => {
        if (mode === 'reject') throw Object.assign(new Error('Rejected'), { code: 4001 })
        if (mode === 'fail') throw new Error('Transaction failed')
        if (mode === 'revert') return f.walletClients[1].sendTransaction({
          account: f.accounts[1], chain: f.walletClients[1].chain, to: f.testUsdAddress,
          gas: 100000n,
          data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [treasuries[0], 1000n * 10n ** 18n] }),
        })
        return f.walletClients[1].sendTransaction({ ...tx, chain: f.walletClients[1].chain, account: f.accounts[1] })
      },
    }
    const rpc = { getChainId: () => f.publicClient.getChainId(), getBlockNumber: () => f.publicClient.getBlockNumber(), contractClient: f.publicClient }
    const config = { chainId: 31337, daoAddress: f.daoAddress, testUsdAddress: f.testUsdAddress }
    const app = createApplication(wallet, rpc, config)
    await app.connect()
    const states: string[] = []
    app.onFundingStateChanged(state => states.push(state.status))
    await Promise.all([
      app.fundTreasury(treasuries[0], '1.25'),
      app.fundTreasury(treasuries[0], '1.25'),
    ])
    assert.deepEqual(states, ['submitting', 'pending', 'confirmed'])
    const confirmed = app.readFundingState()
    assert.equal(confirmed.status, 'confirmed')
    if (confirmed.status === 'confirmed') {
      assert.equal(confirmed.balances?.senderBalance, 98750000000000000000n)
      assert.equal(confirmed.balances?.treasuryBalance, 1250000000000000000n)
      assert.equal(confirmed.balances?.asset, f.testUsdAddress)
    }
    assert.equal(await token.read.allowance([f.accounts[1], treasuries[0]]), 0n)
    assert.equal((await app.refreshFunding(treasuries[0])).treasuryBalance, 1250000000000000000n)
    await app.fundTreasury(treasuries[1], '2')
    assert.equal((await app.refreshFunding(treasuries[1])).senderBalance, 96750000000000000000n)
    assert.equal((await app.refreshFunding(treasuries[0])).treasuryBalance, 1250000000000000000n)
    for (const amount of ['0', '-1', 'abc', '0.0000000000000000001', '101']) {
      await app.fundTreasury(treasuries[0], amount)
      assert.equal(app.readFundingState().status, 'failed')
    }
    await app.fundTreasury(f.accounts[2], '1')
    assert.equal(app.readFundingState().status, 'failed')
    const wrong = createApplication(wallet, rpc, { ...config, testUsdAddress: f.daoAddress })
    await wrong.connect()
    await wrong.fundTreasury(treasuries[0], '1')
    assert.equal(wrong.readFundingState().status, 'failed')
    const wrongChain = createApplication({ ...wallet, getChainId: async () => 1 }, rpc, config)
    await wrongChain.connect()
    await wrongChain.fundTreasury(treasuries[0], '1')
    assert.equal(wrongChain.readFundingState().status, 'failed')
    mode = 'reject'
    await app.fundTreasury(treasuries[0], '1')
    assert.equal(app.readFundingState().status, 'rejected')
    mode = 'fail'
    await app.fundTreasury(treasuries[0], '1')
    assert.equal(app.readFundingState().status, 'failed')
    mode = 'revert'
    states.length = 0
    await app.fundTreasury(treasuries[0], '1')
    assert.deepEqual(states, ['submitting', 'pending', 'failed'])
    assert.equal((await app.refreshFunding(treasuries[0])).senderBalance, 96750000000000000000n)
    assert.equal((await app.refreshFunding(treasuries[0])).treasuryBalance, 1250000000000000000n)
    await f.publicClient.waitForTransactionReceipt({ hash: await token.write.mint([f.accounts[0], 3n]) })
    await f.publicClient.waitForTransactionReceipt({ hash: await token.write.transfer([treasuries[0], 3n]) })
    assert.equal((await app.refreshFunding(treasuries[0])).treasuryBalance, 1250000000000000003n)
    assert.equal((await app.refreshFunding(treasuries[1])).treasuryBalance, 2000000000000000000n)
    const reader = createApplication(undefined, rpc, config)
    assert.equal((await reader.refreshFunding(treasuries[0], f.accounts[1])).treasuryBalance, 1250000000000000003n)
    for (const application of [app, wrong, wrongChain, reader]) application.destroy()
  } finally { await connection.close() }
})
