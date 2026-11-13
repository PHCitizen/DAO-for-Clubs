import { expect, test, vi } from 'vitest'
import { encodeEventTopics, type Address, type Hex } from 'viem'
import { createApplication } from './application'
import { TransactionRejectedError, type AccountChangedListener, type WalletAdapter } from './wallet'
import type { RpcAdapter } from './rpc'
import artifacts from './generated/public-artifacts.json' with { type: 'json' }

const DAO: Address = '0x0000000000000000000000000000000000000001'
const HOLDER: Address = '0x0000000000000000000000000000000000000002'
const HASH = `0x${'ab'.repeat(32)}` as Hex

function fixture() {
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
      abi: artifacts.abis.DAO, eventName: 'YesVoteCast', args: { proposalId: 1n, tokenId: 1n, voter: HOLDER },
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
