import { expect, test, vi } from 'vitest'
import { encodeEventTopics, type Address, type Hex } from 'viem'
import { createApplication } from './application'
import { TransactionRejectedError, type AccountChangedListener, type WalletAdapter } from './wallet'
import type { RpcAdapter } from './rpc'
import artifacts from './generated/public-artifacts.json' with { type: 'json' }

const DAO: Address = '0x0000000000000000000000000000000000000001'
const HOLDER: Address = '0x0000000000000000000000000000000000000002'
const HASH = `0x${'ab'.repeat(32)}` as Hex

function fixture(choice: 'yes' | 'no' = 'yes') {
  let accountListener: AccountChangedListener = () => {}
  const wallet: WalletAdapter = {
    isAvailable: () => true, connect: async () => HOLDER, disconnect: async () => {},
    getAccount: async () => HOLDER, getChainId: vi.fn(async () => 31337),
    switchChain: async () => {}, onChainChanged: () => () => {},
    onAccountChanged: listener => { accountListener = listener; return () => {} },
    sendTransaction: vi.fn(async () => HASH),
    signMessage: async () => { throw new Error('signing is not used by voting') },
  }
  const receipt = {
    status: 'success' as const, blockNumber: 1n,
    logs: [{ address: DAO, data: '0x' as Hex, topics: encodeEventTopics({
      abi: artifacts.abis.DAO, eventName: choice === 'yes' ? 'YesVoteCast' : 'NoVoteCast', args: { proposalId: 1n, tokenId: 1n, voter: HOLDER },
    }) as Hex[] }],
  }
  const rpc: RpcAdapter = {
    getChainId: vi.fn(async () => 31337), getBlockNumber: async () => 1n,
    readContract: vi.fn(async () => { throw new Error('RPC unavailable') }),
    waitForTransactionReceipt: vi.fn(async () => receipt),
  }
  const app = createApplication(wallet, rpc, { chainId: 31337, daoAddress: DAO, testUsdAddress: HOLDER })
  return { app, wallet, rpc, changeAccount: () => accountListener({ account: DAO }) }
}

/** Same seams as `fixture`, but a receipt carrying the permissionless check's `ProposalPassed` event instead of a ballot. */
function passingCheckFixture() {
  let accountListener: AccountChangedListener = () => {}
  const wallet: WalletAdapter = {
    isAvailable: () => true, connect: async () => HOLDER, disconnect: async () => {},
    getAccount: async () => HOLDER, getChainId: vi.fn(async () => 31337),
    switchChain: async () => {}, onChainChanged: () => () => {},
    onAccountChanged: listener => { accountListener = listener; return () => {} },
    sendTransaction: vi.fn(async () => HASH),
    signMessage: async () => { throw new Error('signing is not used by the passing check') },
  }
  const receipt = {
    status: 'success' as const, blockNumber: 1n,
    logs: [{ address: DAO, data: '0x' as Hex, topics: encodeEventTopics({
      abi: artifacts.abis.DAO, eventName: 'ProposalPassed', args: { proposalId: 1n },
    }) as Hex[] }],
  }
  const rpc: RpcAdapter = {
    getChainId: vi.fn(async () => 31337), getBlockNumber: async () => 1n,
    readContract: vi.fn(async () => { throw new Error('RPC unavailable') }),
    waitForTransactionReceipt: vi.fn(async () => receipt),
  }
  const app = createApplication(wallet, rpc, { chainId: 31337, daoAddress: DAO, testUsdAddress: HOLDER })
  return { app, wallet, rpc, changeAccount: () => accountListener({ account: DAO }) }
}

test('voting guards disconnected wallet, invalid IDs and wrong network without submission', async () => {
  const { app, wallet } = fixture()
  expect((await app.voteYes(1n, 1n)).status).toBe('wallet-not-connected')
  await app.connect()
  expect((await app.voteYes(1n, 0n)).status).toBe('invalid-input')
  expect((await app.voteYes(1n, 2n ** 256n)).status).toBe('invalid-input')
  vi.mocked(wallet.getChainId).mockResolvedValue(1)
  expect((await app.voteYes(1n, 1n)).status).toBe('chain-mismatch')
  expect(wallet.sendTransaction).not.toHaveBeenCalled()
})

test('wallet rejection, reverted receipt and unknown confirmation are distinct', async () => {
  const { app, wallet, rpc } = fixture()
  await app.connect()
  vi.mocked(wallet.sendTransaction).mockRejectedValueOnce(new TransactionRejectedError())
  expect((await app.voteYes(1n, 1n)).status).toBe('wallet-rejected')
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'reverted', blockNumber: 1n, logs: [] })
  expect(await app.voteYes(1n, 1n)).toMatchObject({ status: 'transaction-failed', stage: 'reverted', hash: HASH })
  vi.mocked(rpc.waitForTransactionReceipt!).mockRejectedValueOnce(new Error('Unavailable'))
  expect(await app.voteYes(1n, 1n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation', hash: HASH })
})

test('only a matching DAO ballot receipt confirms; failed progress refresh preserves confirmation', async () => {
  const { app, rpc } = fixture()
  await app.connect()
  expect(await app.voteYes(1n, 1n)).toEqual({ status: 'confirmed', hash: HASH, progress: null })
  expect(await app.voteYes(1n, 2n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation' })
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'success', blockNumber: 1n, logs: [] })
  expect(await app.voteYes(1n, 1n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation' })
})

test('account changes during async preparation cannot submit a stale vote', async () => {
  const { app, rpc, wallet, changeAccount } = fixture()
  await app.connect()
  vi.mocked(rpc.getChainId).mockImplementationOnce(async () => { changeAccount(); return 31337 })
  expect((await app.voteYes(1n, 1n)).status).toBe('stale-configuration')
  expect(wallet.sendTransaction).not.toHaveBeenCalled()
})

test('no voting uses shared wallet, ID, deployment and stale-account guards', async () => {
  const { app, wallet, rpc, changeAccount } = fixture('no')
  expect((await app.voteNo(1n, 1n)).status).toBe('wallet-not-connected')
  await app.connect()
  expect((await app.voteNo(0n, 1n)).status).toBe('invalid-input')
  expect((await app.voteNo(1n, 2n ** 256n)).status).toBe('invalid-input')
  vi.mocked(wallet.getChainId).mockResolvedValueOnce(1)
  expect((await app.voteNo(1n, 1n)).status).toBe('chain-mismatch')
  vi.mocked(rpc.getChainId).mockImplementationOnce(async () => { changeAccount(); return 31337 })
  expect((await app.voteNo(1n, 1n)).status).toBe('stale-configuration')
  expect(wallet.sendTransaction).not.toHaveBeenCalled()
})

test('no confirmation requires the actual no ballot, not a yes event', async () => {
  const yes = fixture()
  await yes.app.connect()
  expect(await yes.app.voteNo(1n, 1n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation' })
  const { app, wallet, rpc } = fixture('no')
  await app.connect()
  expect(await app.voteNo(1n, 1n)).toEqual({ status: 'confirmed', hash: HASH, progress: null })
  expect(await app.voteYes(1n, 1n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation' })
  expect(await app.voteNo(1n, 2n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation' })
  vi.mocked(wallet.sendTransaction).mockRejectedValueOnce(new TransactionRejectedError())
  expect((await app.voteNo(1n, 1n)).status).toBe('wallet-rejected')
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'reverted', blockNumber: 1n, logs: [] })
  expect(await app.voteNo(1n, 1n)).toMatchObject({ status: 'transaction-failed', stage: 'reverted' })
})

// ---------------------------------------------------------------------------
// Permissionless passing check: a vote-passing determination only, usable by
// any connected wallet (not just voters), never a payout or administrative
// approval.
// ---------------------------------------------------------------------------

test('passing check guards disconnected wallet, invalid IDs and wrong network without submission', async () => {
  const { app, wallet } = passingCheckFixture()
  expect((await app.checkPassing(1n)).status).toBe('wallet-not-connected')
  await app.connect()
  expect((await app.checkPassing(0n)).status).toBe('invalid-input')
  expect((await app.checkPassing(2n ** 256n)).status).toBe('invalid-input')
  vi.mocked(wallet.getChainId).mockResolvedValue(1)
  expect((await app.checkPassing(1n)).status).toBe('chain-mismatch')
  expect(wallet.sendTransaction).not.toHaveBeenCalled()
})

test('passing check wallet rejection, reverted receipt and unknown confirmation are distinct', async () => {
  const { app, wallet, rpc } = passingCheckFixture()
  await app.connect()
  vi.mocked(wallet.sendTransaction).mockRejectedValueOnce(new TransactionRejectedError())
  expect((await app.checkPassing(1n)).status).toBe('wallet-rejected')
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'reverted', blockNumber: 1n, logs: [] })
  expect(await app.checkPassing(1n)).toMatchObject({ status: 'transaction-failed', stage: 'reverted', hash: HASH })
  vi.mocked(rpc.waitForTransactionReceipt!).mockRejectedValueOnce(new Error('Unavailable'))
  expect(await app.checkPassing(1n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation', hash: HASH })
})

test('only a matching ProposalPassed receipt confirms the check; failed progress refresh preserves confirmation', async () => {
  const { app, rpc } = passingCheckFixture()
  await app.connect()
  expect(await app.checkPassing(1n)).toEqual({ status: 'confirmed', hash: HASH, progress: null })
  // a receipt for a different proposal ID is not a matching confirmation
  expect(await app.checkPassing(2n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation' })
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'success', blockNumber: 1n, logs: [] })
  expect(await app.checkPassing(1n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation' })
})

test('account changes during async preparation cannot submit a stale passing check', async () => {
  const { app, rpc, wallet, changeAccount } = passingCheckFixture()
  await app.connect()
  vi.mocked(rpc.getChainId).mockImplementationOnce(async () => { changeAccount(); return 31337 })
  expect((await app.checkPassing(1n)).status).toBe('stale-configuration')
  expect(wallet.sendTransaction).not.toHaveBeenCalled()
})
