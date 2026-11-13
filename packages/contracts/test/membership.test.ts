import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getAddress, getContract, type Address } from 'viem'
import { deployTestFixture } from './fixtures.js'
import { createApplication } from '../../frontend/src/application.js'
import type { WalletAdapter } from '../../frontend/src/wallet.js'
import { createRpcAdapter } from '../../frontend/src/rpc.js'

test('application voting NFT minting and membership inspection against a real local EVM', { timeout: 30000 }, async () => {
  // Return mined reverted receipts, as a production RPC does.
  const connection = await network.create({ network: 'default', override: { throwOnTransactionFailures: false } })
  try {
    const f = await deployTestFixture(connection.provider as any)
    const [adminA, adminB, holder, otherHolder, outsider] = [f.accounts[1], f.accounts[2], f.accounts[3], f.accounts[4], f.accounts[5]]

    const daoA = getContract({ address: f.daoAddress, abi: f.daoArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[1] } })
    await f.publicClient.waitForTransactionReceipt({ hash: await daoA.write.createTreasury() })
    const daoB = getContract({ address: f.daoAddress, abi: f.daoArtifact.abi, client: { public: f.publicClient, wallet: f.walletClients[2] } })
    await f.publicClient.waitForTransactionReceipt({ hash: await daoB.write.createTreasury() })
    const [treasuryA, treasuryB] = (await daoA.read.getTreasuries()) as [Address, Address]

    const rpc = createRpcAdapter(f.publicClient)
    const config = { chainId: 31337, daoAddress: f.daoAddress, testUsdAddress: f.testUsdAddress }

    let mode: 'normal' | 'reject' | 'revert' = 'normal'
    const makeWallet = (index: number): WalletAdapter => ({
      connect: async () => f.accounts[index],
      disconnect: async () => {},
      getAccount: async () => f.accounts[index],
      getChainId: async () => 31337,
      isAvailable: () => true,
      switchChain: async () => {},
      onAccountChanged: () => () => {},
      onChainChanged: () => () => {},
      sendTransaction: async (tx) => {
        if (mode === 'reject') throw Object.assign(new Error('Rejected'), { code: 4001 })
        if (mode === 'revert') {
          // Admin A has no authority over treasury B: the mint reverts on-chain.
          return f.walletClients[index].sendTransaction({
            account: f.accounts[index],
            chain: f.walletClients[index].chain,
            to: treasuryB,
            gas: 100000n,
            data: encodeFunctionData({ abi: f.treasuryArtifact.abi, functionName: 'mintVotingNft', args: [holder] }),
          })
        }
        return f.walletClients[index].sendTransaction({
          to: tx.to,
          data: encodeFunctionData(tx),
          chain: f.walletClients[index].chain,
          account: f.accounts[index],
        })
      },
    })

    const treasury = getContract({ address: treasuryA, abi: f.treasuryArtifact.abi, client: { public: f.publicClient } })

    // Wallet-free holder inspection before any mint.
    const reader = createApplication(undefined, rpc, config)
    const empty = await reader.readVotingMembership(treasuryA, holder)
    assert.equal(empty.status, 'success')
    if (empty.status === 'success') {
      assert.equal(empty.membership.totalSupply, 0n)
      assert.deepEqual(empty.membership.holder, { address: getAddress(holder), balance: 0n, tokenIds: [] })
      assert.equal(empty.membership.administrator.toLowerCase(), adminA.toLowerCase())
    }

    // Administrator issuance feedback: confirmed token ID, live supply, holder credentials.
    const appA = createApplication(makeWallet(1), rpc, config)
    await appA.connect()
    const first = await appA.mintVotingNft({ treasury: treasuryA, holder })
    assert.equal(first.status, 'success')
    if (first.status !== 'success') return
    assert.equal(first.tokenId, 1n)
    assert.equal(first.totalSupply, 1n)
    assert.equal(first.holder.toLowerCase(), holder.toLowerCase())
    assert.deepEqual(first.holderTokenIds, [1n])
    assert.equal(((await treasury.read.ownerOf([1n])) as string).toLowerCase(), holder.toLowerCase())

    // Multiple credentials per holder and per treasury: IDs are never reused.
    const second = await appA.mintVotingNft({ treasury: treasuryA, holder })
    const third = await appA.mintVotingNft({ treasury: treasuryA, holder: otherHolder })
    assert.equal(second.status, 'success')
    assert.equal(third.status, 'success')
    if (second.status === 'success' && third.status === 'success') {
      assert.equal(second.tokenId, 2n)
      assert.equal(third.tokenId, 3n)
      assert.equal(third.totalSupply, 3n)
    }
    const holderView = await reader.readVotingMembership(treasuryA, holder)
    assert.equal(holderView.status, 'success')
    if (holderView.status === 'success') {
      assert.deepEqual(holderView.membership.holder?.tokenIds, [1n, 2n])
      assert.equal(holderView.membership.holder?.balance, 2n)
      assert.equal(holderView.membership.totalSupply, 3n)
    }

    // Cross-treasury isolation: treasury B has its own administrator, supply, and ID sequence.
    const appB = createApplication(makeWallet(2), rpc, config)
    await appB.connect()
    const mintB = await appB.mintVotingNft({ treasury: treasuryB, holder })
    assert.equal(mintB.status, 'success')
    if (mintB.status === 'success') {
      assert.equal(mintB.tokenId, 1n, 'each treasury scopes its own token identity')
      assert.equal(mintB.treasury.toLowerCase(), treasuryB.toLowerCase())
    }
    const isolatedA = await reader.readVotingMembership(treasuryA, holder)
    const isolatedB = await reader.readVotingMembership(treasuryB, holder)
    assert.equal(isolatedA.status, 'success')
    assert.equal(isolatedB.status, 'success')
    if (isolatedA.status === 'success' && isolatedB.status === 'success') {
      assert.deepEqual(isolatedA.membership.holder?.tokenIds, [1n, 2n])
      assert.deepEqual(isolatedB.membership.holder?.tokenIds, [1n])
      assert.equal(isolatedA.membership.totalSupply, 3n)
      assert.equal(isolatedB.membership.totalSupply, 1n)
      assert.equal(isolatedB.membership.administrator.toLowerCase(), adminB.toLowerCase())
    }

    // One treasury's administrator cannot issue another treasury's credentials.
    const wrongTreasury = await appA.mintVotingNft({ treasury: treasuryB, holder })
    assert.equal(wrongTreasury.status, 'unauthorized')

    // An unrelated wallet gets unauthorized feedback and no transaction is sent.
    const appOutsider = createApplication(makeWallet(5), rpc, config)
    await appOutsider.connect()
    const denied = await appOutsider.mintVotingNft({ treasury: treasuryA, holder: outsider })
    assert.equal(denied.status, 'unauthorized')
    if (denied.status === 'unauthorized') {
      assert.equal(denied.account.toLowerCase(), outsider.toLowerCase())
      assert.equal(denied.administrator.toLowerCase(), adminA.toLowerCase())
    }
    assert.equal(await treasury.read.totalSupply(), 3n, 'unauthorized attempts must not change the live supply')

    // Failed-mint feedback: an on-chain revert is reported, never a success.
    mode = 'revert'
    const reverted = await appA.mintVotingNft({ treasury: treasuryA, holder })
    assert.equal(reverted.status, 'transaction-failed')
    if (reverted.status === 'transaction-failed') {
      assert.equal(reverted.stage, 'reverted')
      assert.ok(reverted.hash)
    }
    const afterRevert = await reader.readVotingMembership(treasuryA, holder)
    assert.equal(afterRevert.status, 'success')
    if (afterRevert.status === 'success') {
      assert.deepEqual(afterRevert.membership.holder?.tokenIds, [1n, 2n])
      assert.equal(afterRevert.membership.totalSupply, 3n)
    }
    assert.equal(await treasury.read.totalSupply(), 3n)

    // Wallet rejection is distinct from a confirmed or reverted mint.
    mode = 'reject'
    const rejected = await appA.mintVotingNft({ treasury: treasuryA, holder })
    assert.equal(rejected.status, 'wallet-rejected')
    mode = 'normal'

    // Minting without a wallet is unavailable; unregistered treasuries are not found.
    const noWallet = await reader.mintVotingNft({ treasury: treasuryA, holder })
    assert.equal(noWallet.status, 'wallet-unavailable')
    const unknown = await appA.mintVotingNft({ treasury: outsider, holder })
    assert.equal(unknown.status, 'not-found')

    for (const app of [reader, appA, appB, appOutsider]) app.destroy()
  } finally {
    await connection.close()
  }
})
