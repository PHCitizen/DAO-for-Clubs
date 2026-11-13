import { expect, test, vi } from 'vitest'
import type { Address } from 'viem'
import { createApplication } from './application'
import type { RpcAdapter } from './rpc'

const DAO: Address = '0x0000000000000000000000000000000000000001'
const TEST_USD: Address = '0x0000000000000000000000000000000000000002'
const VOTER_A: Address = '0x0000000000000000000000000000000000000003'
const VOTER_B: Address = '0x0000000000000000000000000000000000000004'

function fixture() {
  const rpc: RpcAdapter = {
    getChainId: vi.fn(async () => 31337),
    getBlockNumber: vi.fn(async () => 1n),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'proposalCount') return 1n
      if (functionName === 'getProposal') return {
        id: 1n, treasury: TEST_USD, creator: VOTER_A, amount: 1n,
        payoutRecipient: VOTER_A, votingDeadline: 9999999999n, documentReference: 'ipfs://doc',
      }
      if (functionName === 'getVoting') return [1n, 1n, false, true, 0n]
      throw new Error(`unexpected readContract call: ${functionName}`)
    }) as unknown as RpcAdapter['readContract'],
    getLogs: vi.fn(async ({ eventName }: { eventName: string }) => {
      if (eventName === 'YesVoteCast') return [{ args: { proposalId: 1n, tokenId: 1n, voter: VOTER_A } }]
      if (eventName === 'NoVoteCast') return [{ args: { proposalId: 1n, tokenId: 2n, voter: VOTER_B } }]
      return []
    }),
  }
  const app = createApplication(undefined, rpc, { chainId: 31337, daoAddress: DAO, testUsdAddress: TEST_USD })
  return { app, rpc }
}

test('readBallots lists both choices for an existing proposal without a wallet', async () => {
  const { app } = fixture()
  const result = await app.readBallots(1n)
  expect(result).toEqual({
    status: 'success', chainId: 31337,
    ballots: [
      { tokenId: 1n, voter: VOTER_A, choice: 'yes' },
      { tokenId: 2n, voter: VOTER_B, choice: 'no' },
    ],
  })
})

test('readBallots reports not-found for an unknown proposal', async () => {
  const { app } = fixture()
  const result = await app.readBallots(2n)
  expect(result).toEqual({ status: 'not-found', id: 2n })
})

test('readBallots is unconfigured without a deployed DAO or RPC', async () => {
  const app = createApplication(undefined, undefined, { chainId: 999999, daoAddress: null, rpcUrl: undefined })
  const result = await app.readBallots(1n)
  expect(result.status).toBe('unconfigured')
})

test('readBallots reports rpc-unavailable when the log transport fails', async () => {
  const { app, rpc } = fixture()
  vi.mocked(rpc.getLogs!).mockRejectedValueOnce(new Error('RPC down'))
  const result = await app.readBallots(1n)
  expect(result.status).toBe('rpc-unavailable')
})
