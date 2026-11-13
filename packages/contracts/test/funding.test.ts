import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { createPublicClient, custom, encodeFunctionData, erc20Abi, getContract, type EIP1193Provider, type Hash } from 'viem'
import { deployTestFixture } from './fixtures.js'
import { createApplication } from '../../frontend/src/application.js'
import type { WalletAdapter } from '../../frontend/src/wallet.js'
import { createRpcAdapter, RpcUnavailableError } from '../../frontend/src/rpc.js'

test('application funding validates deployment and amounts, tracks transactions and independently refreshes real balances', { timeout: 30000 }, async () => {
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
      signMessage: async () => { throw new Error('signMessage is not used in this test') },
      sendTransaction: async (tx) => {
        if (mode === 'reject') throw Object.assign(new Error('Rejected'), { code: 4001 })
        if (mode === 'fail') throw new Error('Transaction failed')
        if (mode === 'cancel') return f.walletClients[1].sendTransaction({
          account: f.accounts[1], chain: f.walletClients[1].chain, to: f.accounts[1], value: 0n,
        })
        if (mode === 'revert') return f.walletClients[1].sendTransaction({
          account: f.accounts[1], chain: f.walletClients[1].chain, to: f.testUsdAddress,
          gas: 100000n,
          data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [treasuries[0], 1000n * 10n ** 18n] }),
        })
        return f.walletClients[1].sendTransaction({ to: tx.to, data: encodeFunctionData(tx), chain: f.walletClients[1].chain, account: f.accounts[1] })
      },
    }
    const rpc = createRpcAdapter(f.publicClient)
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
    mode = 'cancel'
    await app.fundTreasury(treasuries[0], '1')
    assert.equal(app.readFundingState().status, 'failed', 'a successful receipt without the requested transfer is not funding')
    mode = 'normal'
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
    // Let viem observe the pending original before mining a same-nonce replacement.
    // This exercises real replacement detection, not a fabricated receipt.
    const provider = connection.provider
    const unavailableClient = createPublicClient({
      transport: custom({
        async request(args: { method: string; params?: readonly unknown[] | object }) {
          if (args.method === 'eth_call') throw new Error('Funding RPC unavailable')
          return provider.request(args)
        },
      } as EIP1193Provider, { retryCount: 0 }),
    })
    const unavailableApp = createApplication(undefined, createRpcAdapter(unavailableClient), config)
    await assert.rejects(() => unavailableApp.refreshFunding(treasuries[0], f.accounts[1]), RpcUnavailableError)
    unavailableApp.destroy()
    for (const replacement of ['repriced', 'cancelled', 'different-amount'] as const) {
      let originalHash: Hash | undefined
      let minedHash: Hash | undefined
      let replace: (() => Promise<void>) | undefined
      const replacementClient = createPublicClient({
        pollingInterval: 10,
        transport: custom({
          async request(args: { method: string; params?: readonly unknown[] | object }) {
            const result = await provider.request(args)
            if (args.method === 'eth_getTransactionByHash' && (args.params as string[])[0] === originalHash && replace) {
              const execute = replace
              replace = undefined
              await execute()
            }
            return result
          },
        } as EIP1193Provider),
      })
      const replacementWallet: WalletAdapter = {
        ...wallet,
        sendTransaction: async tx => {
          const nonce = await f.publicClient.getTransactionCount({ address: f.accounts[1] })
          await provider.request({ method: 'evm_setAutomine', params: [false] })
          const original = { to: tx.to, data: encodeFunctionData(tx), account: f.accounts[1], chain: f.walletClients[1].chain, nonce, gas: 100000n, gasPrice: 2000000000n }
          originalHash = await f.walletClients[1].sendTransaction(original)
          replace = async () => {
            const changes = replacement === 'cancelled'
              ? { to: f.accounts[1], data: '0x' as const }
              : replacement === 'different-amount'
                ? { data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [treasuries[0], 2n * 10n ** 18n] }) }
                : {}
            minedHash = await f.walletClients[1].sendTransaction({ ...original, ...changes, gasPrice: 4000000000n })
            await provider.request({ method: 'evm_mine' })
          }
          return originalHash
        },
      }
      const replacementApp = createApplication(replacementWallet, createRpcAdapter(replacementClient), config)
      try {
        await replacementApp.connect()
        await replacementApp.fundTreasury(treasuries[0], '1')
        const result = replacementApp.readFundingState()
        assert.ok(minedHash, 'the real replacement was mined')
        assert.notEqual(originalHash, minedHash)
        assert.equal(result.status, replacement === 'repriced' ? 'confirmed' : 'failed')
        if (result.status === 'confirmed') assert.equal(result.hash, minedHash)
      } finally {
        await provider.request({ method: 'evm_setAutomine', params: [true] })
        replacementApp.destroy()
      }
    }
    for (const application of [app, wrong, wrongChain, reader]) application.destroy()
  } finally { await connection.close() }
})
