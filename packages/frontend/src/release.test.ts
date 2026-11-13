import { expect, test, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from 'viem'
import { createApplication } from './application'
import { TransactionRejectedError, type WalletAdapter } from './wallet'
import type { RpcAdapter } from './rpc'
import artifacts from './generated/public-artifacts.json' with { type: 'json' }

const DAO: Address = '0x0000000000000000000000000000000000000001'
const CREATOR: Address = '0x0000000000000000000000000000000000000002'
const HASH = `0x${'ab'.repeat(32)}` as Hex
const AMOUNT = 25n

type Event = 'FundsReleased' | 'FundingShortage' | 'FundsTransferFailed'
const EVENT_ARGS: Record<Event, object> = {
  FundsReleased: { proposalId: 1n, treasury: DAO, recipient: CREATOR },
  FundingShortage: { proposalId: 1n },
  FundsTransferFailed: { proposalId: 1n, treasury: DAO },
}
/** ABI-encoded non-indexed event fields. */
const EVENT_DATA: Record<Event, Hex> = {
  FundsReleased: encodeAbiParameters([{ type: 'uint256' }], [AMOUNT]),
  FundingShortage: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [AMOUNT - 5n, AMOUNT]),
  FundsTransferFailed: encodeAbiParameters([{ type: 'uint256' }], [AMOUNT]),
}
const log = (eventName: Event, proposalId = 1n) => ({
  address: DAO, data: EVENT_DATA[eventName],
  topics: encodeEventTopics({ abi: artifacts.abis.DAO, eventName, args: { ...EVENT_ARGS[eventName], proposalId } as never }) as Hex[],
})

/** `chain` drives what the read side reports for the proposal. */
function fixture(chain: { passed: boolean; paid: boolean } = { passed: true, paid: false }) {
  const wallet: WalletAdapter = {
    isAvailable: () => true, connect: async () => CREATOR, disconnect: async () => {},
    getAccount: async () => CREATOR, getChainId: vi.fn(async () => 31337),
    switchChain: async () => {}, onChainChanged: () => () => {}, onAccountChanged: () => () => {},
    sendTransaction: vi.fn(async () => HASH),
    signMessage: async () => { throw new Error('signing is not used by fund release') },
  }
  const rpc: RpcAdapter = {
    getChainId: vi.fn(async () => 31337), getBlockNumber: async () => 1n,
    readContract: vi.fn(async (request: { functionName: string }) => {
      switch (request.functionName) {
        case 'proposalCount': return 1n
        case 'getProposal': return { id: 1n, treasury: DAO, creator: CREATOR, amount: AMOUNT, payoutRecipient: CREATOR, votingDeadline: 9n, documentReference: 'ipfs://x' }
        case 'getVoting': return [1n, 1n, chain.passed, false, 0n]
        case 'fundsReleased': return chain.paid
        default: throw new Error(`unexpected read ${request.functionName}`)
      }
    }) as never,
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' as const, blockNumber: 1n, logs: [log('FundsReleased')] })),
  }
  const app = createApplication(wallet, rpc, { chainId: 31337, daoAddress: DAO, testUsdAddress: CREATOR })
  return { app, wallet, rpc, chain }
}

test('readFunding returns display-ready text and whether release is offered, per funding state', async () => {
  const states = [
    [{ passed: false, paid: false }, 'not-passed', 'Not passed: no funds can be released.', false],
    [{ passed: true, paid: false }, 'passed-awaiting-funds', 'Passed; not yet paid.', true],
    [{ passed: true, paid: true }, 'paid', 'Paid: funds were sent to the fixed recipient.', false],
  ] as const
  for (const [chain, state, statusText, canRelease] of states) {
    const { app } = fixture(chain)
    expect(await app.readFunding(1n)).toMatchObject({ status: 'success', funding: { proposalId: 1n, amount: AMOUNT, state }, statusText, canRelease })
  }
  const { app } = fixture()
  expect(await app.readFunding(2n)).toMatchObject({ status: 'not-found', canRelease: false, statusText: expect.stringContaining('not found') })
  const down = fixture()
  vi.mocked(down.rpc.readContract!).mockRejectedValue(new Error('RPC unavailable'))
  expect(await down.app.readFunding(1n)).toMatchObject({ status: 'rpc-unavailable', message: expect.any(String), canRelease: false, statusText: expect.stringContaining('unavailable') })
})

test('releaseFunds reports payment only for a FundsReleased receipt and carries the refreshed funding view', async () => {
  const { app, rpc, chain } = fixture()
  await app.connect()
  chain.paid = true // the chain state after the payment, as the post-release read will see it
  const result = await app.releaseFunds(1n)
  expect(result).toMatchObject({
    status: 'confirmed', hash: HASH, message: `Payment confirmed: ${HASH}`,
    funding: { status: 'success', funding: { state: 'paid' }, canRelease: false },
  })
  // a failed refresh must not undo what the receipt established; the view is re-read instead of dropped
  chain.paid = false
  vi.mocked(rpc.readContract!).mockRejectedValueOnce(new Error('RPC unavailable'))
  expect(await app.releaseFunds(1n)).toMatchObject({ status: 'confirmed', message: `Payment confirmed: ${HASH}` })
})

test('releaseFunds funds-pending covers a balance shortage and a failed asset transfer, never as paid', async () => {
  for (const eventName of ['FundingShortage', 'FundsTransferFailed'] as const) {
    const { app, rpc } = fixture()
    await app.connect()
    vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'success', blockNumber: 1n, logs: [log(eventName)] })
    const result = await app.releaseFunds(1n)
    expect(result).toMatchObject({
      status: 'funds-pending', hash: HASH,
      funding: { status: 'success', funding: { state: 'passed-awaiting-funds' }, canRelease: true },
    })
    expect('message' in result && result.message).toContain('Not paid')
    expect('message' in result && result.message).toContain('Passing is kept')
  }
  const { app, rpc } = fixture()
  await app.connect()
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'success', blockNumber: 1n, logs: [log('FundingShortage')] })
  const shortage = await app.releaseFunds(1n)
  expect('message' in shortage && shortage.message).toContain('treasury balance is insufficient')
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'success', blockNumber: 1n, logs: [log('FundsTransferFailed')] })
  const refused = await app.releaseFunds(1n)
  expect('message' in refused && refused.message).toContain('funding asset refused the transfer')
})

test('releaseFunds error paths all carry a display message and never claim payment', async () => {
  const { app, wallet, rpc } = fixture()
  expect(await app.releaseFunds(1n)).toMatchObject({ status: 'wallet-not-connected', message: expect.any(String) })
  await app.connect()
  expect(await app.releaseFunds(0n)).toMatchObject({ status: 'invalid-input', message: expect.any(String) })
  vi.mocked(wallet.sendTransaction).mockRejectedValueOnce(new TransactionRejectedError())
  expect(await app.releaseFunds(1n)).toMatchObject({ status: 'wallet-rejected', message: expect.any(String) })
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'reverted', blockNumber: 1n, logs: [] })
  expect(await app.releaseFunds(1n)).toMatchObject({ status: 'transaction-failed', stage: 'reverted', hash: HASH, message: expect.any(String) })
  vi.mocked(rpc.waitForTransactionReceipt!).mockResolvedValueOnce({ status: 'success', blockNumber: 1n, logs: [] })
  expect(await app.releaseFunds(1n)).toMatchObject({ status: 'transaction-failed', stage: 'confirmation', message: expect.any(String) })
  vi.mocked(wallet.getChainId).mockResolvedValue(1)
  expect(await app.releaseFunds(1n)).toMatchObject({ status: 'chain-mismatch', message: 'Wallet and deployment chains must match.' })
})
