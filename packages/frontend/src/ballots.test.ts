import { expect, test, vi } from 'vitest'
import type { Address } from 'viem'
import { readPublicBallots, type BallotLogsChain } from './ballots.js'
import { ProposalChainMismatchError, type ProposalChain, type ProposalConfig } from './proposalCreation.js'
import artifacts from './generated/public-artifacts.json' with { type: 'json' }

const DAO: Address = '0x0000000000000000000000000000000000000001'
const TEST_USD: Address = '0x0000000000000000000000000000000000000002'
const VOTER_A: Address = '0x0000000000000000000000000000000000000003'
const VOTER_B: Address = '0x0000000000000000000000000000000000000004'

const config: ProposalConfig = {
  chainId: 31337,
  daoAddress: DAO,
  testUsdAddress: TEST_USD,
  daoAbi: artifacts.abis.DAO as unknown as ProposalConfig['daoAbi'],
  testUsdAbi: artifacts.abis.TestUSD as unknown as ProposalConfig['testUsdAbi'],
}

function fakeChain(logsByEvent: Record<string, Array<Record<string, unknown>>>): ProposalChain & BallotLogsChain {
  return {
    getChainId: vi.fn(async () => 31337),
    readContract: vi.fn(async () => { throw new Error('not used by this seam') }),
    sendTransaction: vi.fn(async () => { throw new Error('not used by this seam') }),
    waitForTransactionReceipt: vi.fn(async () => { throw new Error('not used by this seam') }),
    getLogs: vi.fn(async (request) => (logsByEvent[request.eventName] ?? []).map(args => ({ args }))),
  }
}

test('a wrong-chain RPC rejects the read rather than silently returning empty results', async () => {
  const chain = fakeChain({})
  vi.mocked(chain.getChainId).mockResolvedValueOnce(1)
  await expect(readPublicBallots(chain, config, 1n)).rejects.toBeInstanceOf(ProposalChainMismatchError)
})

test('both ballot choices appear in the public listing with voter, tokenId and choice', async () => {
  const chain = fakeChain({
    YesVoteCast: [{ proposalId: 1n, tokenId: 1n, voter: VOTER_A }],
    NoVoteCast: [{ proposalId: 1n, tokenId: 2n, voter: VOTER_B }],
  })
  const ballots = await readPublicBallots(chain, config, 1n)
  expect(ballots).toEqual([
    { tokenId: 1n, voter: VOTER_A, choice: 'yes' },
    { tokenId: 2n, voter: VOTER_B, choice: 'no' },
  ])
})
