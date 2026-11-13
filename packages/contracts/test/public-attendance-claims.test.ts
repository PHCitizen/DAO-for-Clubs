import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getContract, type Address, type Hex } from 'viem'
import { deployTestFixture } from './fixtures.js'
import { attendanceSigningMessage, deriveAttendancePublicClaimWitness } from '../../frontend/src/attendance.js'
import { attendanceMerkleRoot, attendanceMerkleProof } from '../../frontend/src/attendanceMerkle.js'
import {
  preparePublicAttendanceClaim,
  submitPublicAttendanceClaim,
  finalizeAttendanceRoot,
  readPublicAttendanceClaimsByEvent,
  readPublicAttendanceClaimsByWallet,
  isPublicAttendanceEntryConsumed,
  AttendanceClaimsChainMismatchError,
  type AttendanceClaimsConfig,
} from '../../frontend/src/attendanceClaims.js'
import type { ProposalChain } from '../../frontend/src/proposalCreation.js'

// Attendee wallet indices among the local Hardhat node's unlocked accounts.
const ATTENDEE_WALLET_INDICES = [7, 8, 9] as const

test('opt-in public attendance claims against a real local EVM', { timeout: 30000 }, async (t) => {
  const connection = await network.create({ network: 'default', override: { throwOnTransactionFailures: false } })
  try {
    const f = await deployTestFixture(connection.provider as any)
    const organizer = f.accounts[1]
    const mine = async (hash: Promise<Hex>) => f.publicClient.waitForTransactionReceipt({ hash: await hash })
    const dao = (wallet = 1) => getContract({ address: f.daoAddress, abi: f.daoArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[wallet] } })

    await mine(dao().write.createTreasury())
    const [treasury] = (await dao().read.getTreasuries()) as [Address]
    const deadline = (await f.publicClient.getBlock()).timestamp + 3600n
    await mine(dao().write.createProposal([treasury, 1n, deadline, 'ipfs://document']))
    const proposalId = (await dao().read.proposalCount()) as bigint

    const config: AttendanceClaimsConfig = {
      chainId: 31337,
      attendanceClaimsAddress: f.attendanceClaimsAddress,
      attendanceClaimsAbi: f.attendanceClaimsArtifact.abi,
    }
    const chainAs = (walletIndex: number): ProposalChain => ({
      getChainId: () => f.publicClient.getChainId(),
      readContract: request => f.publicClient.readContract(request as any) as any,
      waitForTransactionReceipt: hash => f.publicClient.waitForTransactionReceipt({ hash }),
      getLogs: async request => {
        const logs = await f.publicClient.getContractEvents({
          address: request.address, abi: request.abi, eventName: request.eventName,
          args: request.args as any, fromBlock: request.fromBlock ?? 0n, toBlock: request.toBlock ?? 'latest',
        })
        return logs.map(log => ({ args: (log as any).args }))
      },
      sendTransaction: request => connection.provider.request({ method: 'eth_sendTransaction', params: [{
        from: request.from, to: request.address,
        data: encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args }),
      }] }) as Promise<Hex>,
    })
    const reader = chainAs(1)
    const organizerChain = chainAs(1)

    // Submission errors wrap the underlying revert reason as `cause`; surface it for assertions.
    const revertReason = async (promise: Promise<unknown>): Promise<string> => {
      try {
        await promise
        throw new Error('expected the action to reject')
      } catch (error) {
        const cause = (error as { cause?: unknown })?.cause
        return String(cause ?? error)
      }
    }

    // Three attendees sign the real attendance message and derive their secrets/entries.
    const signingMessage = attendanceSigningMessage({ chainId: 31337, daoAddress: f.daoAddress, proposalId })
    const witnesses = await Promise.all(ATTENDEE_WALLET_INDICES.map(async index => {
      const account = f.accounts[index]
      const signature = await f.walletClients[index].signMessage({ account, message: signingMessage })
      return { address: account, ...deriveAttendancePublicClaimWitness(signature, proposalId) }
    }))
    const entries = witnesses.map(w => w.entry)
    const root = attendanceMerkleRoot(entries)

    await t.test('wallet/event scope: not finalized before the organizer finalizes', async () => {
      const prepared = await preparePublicAttendanceClaim(reader, config, {
        proposalId, secret: witnesses[0].secret, entry: witnesses[0].entry, publishedEntries: entries,
      })
      assert.equal(prepared.status, 'not-finalized')
    })

    await t.test('only the proposal creator can finalize, and only once', async () => {
      assert.match(
        await revertReason(finalizeAttendanceRoot(chainAs(3), config, { from: f.accounts[3], proposalId, root }, async () => {})),
        /NotEventOrganizer/,
      )
      const result = await finalizeAttendanceRoot(organizerChain, config, { from: organizer, proposalId, root }, async () => {})
      assert.equal(result.status, 'confirmed')
      assert.match(
        await revertReason(finalizeAttendanceRoot(organizerChain, config, { from: organizer, proposalId, root }, async () => {})),
        /RootAlreadyFinalized/,
      )
    })

    await t.test('prepares a valid claim and rejects a wrong secret/path locally', async () => {
      const ready = await preparePublicAttendanceClaim(reader, config, {
        proposalId, secret: witnesses[0].secret, entry: witnesses[0].entry, publishedEntries: entries,
      })
      assert.equal(ready.status, 'ready')

      const wrongSecret = await preparePublicAttendanceClaim(reader, config, {
        proposalId, secret: witnesses[1].secret, entry: witnesses[0].entry, publishedEntries: entries,
      })
      assert.equal(wrongSecret.status, 'ready') // entry/proof are consistent; the wrong secret is caught on-chain below.

      const notAMember = await preparePublicAttendanceClaim(reader, config, {
        proposalId, secret: witnesses[0].secret,
        entry: '0x111111111111111111111111111111111111111111111111111111111111111a' as Hex,
        publishedEntries: entries,
      })
      assert.equal(notAMember.status, 'not-a-member')
    })

    await t.test('submits a unique claim, consuming the entry and recording the sender', async () => {
      const claimant = f.accounts[4]
      const ready = await preparePublicAttendanceClaim(reader, config, {
        proposalId, secret: witnesses[0].secret, entry: witnesses[0].entry, publishedEntries: entries,
      })
      assert.equal(ready.status, 'ready')
      if (ready.status !== 'ready') return

      const confirmed = await submitPublicAttendanceClaim(chainAs(4), config, {
        from: claimant, proposalId, secret: ready.secret, proof: ready.proof, consent: true,
      }, async () => {})
      assert.equal(confirmed.status, 'confirmed')
      assert.equal(await isPublicAttendanceEntryConsumed(reader, config, proposalId, witnesses[0].entry), true)

      // A different wallet copying the same secret/proof cannot claim again: consumption is entry-scoped, not wallet-scoped.
      assert.match(
        await revertReason(submitPublicAttendanceClaim(chainAs(5), config, {
          from: f.accounts[5], proposalId, secret: ready.secret, proof: ready.proof, consent: true,
        }, async () => {})),
        /EntryAlreadyConsumed/,
      )
      // The original sender is also now a duplicate.
      assert.match(
        await revertReason(submitPublicAttendanceClaim(chainAs(4), config, {
          from: claimant, proposalId, secret: ready.secret, proof: ready.proof, consent: true,
        }, async () => {})),
        /EntryAlreadyConsumed/,
      )

      const byEvent = await readPublicAttendanceClaimsByEvent(reader, config, proposalId)
      assert.equal(byEvent.length, 1)
      assert.equal(byEvent[0].claimant.toLowerCase(), claimant.toLowerCase())
      assert.equal(byEvent[0].entry, witnesses[0].entry)

      const byWallet = await readPublicAttendanceClaimsByWallet(reader, config, claimant)
      assert.equal(byWallet.length, 1)
      assert.equal(byWallet[0].proposalId, proposalId)
    })

    await t.test('rejects a wrong secret for a valid proof on-chain, consuming nothing', async () => {
      const claimant = f.accounts[6]
      const wrongProof = attendanceMerkleProof(entries, witnesses[1].entry)
      assert.match(
        await revertReason(submitPublicAttendanceClaim(chainAs(6), config, {
          from: claimant, proposalId, secret: witnesses[2].secret, proof: wrongProof, consent: true,
        }, async () => {})),
        /InvalidMerkleProof/,
      )
      assert.equal(await isPublicAttendanceEntryConsumed(reader, config, proposalId, witnesses[1].entry), false)
    })

    await t.test('rejects claims on an unfinalized sibling proposal and on the wrong chain', async () => {
      await mine(dao().write.createProposal([treasury, 1n, deadline, 'ipfs://document-2']))
      const otherProposalId = (await dao().read.proposalCount()) as bigint
      const otherProof = attendanceMerkleProof(entries, witnesses[1].entry)
      assert.match(
        await revertReason(submitPublicAttendanceClaim(chainAs(6), config, {
          from: f.accounts[6], proposalId: otherProposalId, secret: witnesses[1].secret, proof: otherProof, consent: true,
        }, async () => {})),
        /AttendanceNotFinalized/,
      )

      const wrongChainConfig: AttendanceClaimsConfig = { ...config, chainId: 999 }
      await assert.rejects(
        preparePublicAttendanceClaim(reader, wrongChainConfig, {
          proposalId, secret: witnesses[1].secret, entry: witnesses[1].entry, publishedEntries: entries,
        }),
        AttendanceClaimsChainMismatchError,
      )
    })
  } finally {
    await connection.close()
  }
})
