import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { network } from 'hardhat'
import { getAddress, getContract, type Address } from 'viem'
import { createApplication } from '../../frontend/src/application.js'
import { IpfsTransportError, type IpfsTransport } from '../../frontend/src/ipfs.js'
import { encodeProposalDocument } from '../../frontend/src/proposal.js'
import { createRpcAdapter } from '../../frontend/src/rpc.js'
import { deployTestFixture } from './fixtures.js'

// CIDv1 (raw codec, sha2-256) built independently of the application code.
function rawCidFor(bytes: Uint8Array): string {
  const digest = createHash('sha256').update(bytes).digest()
  const cid = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest])
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  let bits = 0
  let buffer = 0
  let out = ''
  for (const byte of cid) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += alphabet[(buffer >> bits) & 31]
    }
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 31]
  return `b${out}`
}

test('public readers browse real proposals across treasuries and read verified documents without a wallet', { timeout: 30000 }, async () => {
  const connection = await network.create('default')
  try {
    const f = await deployTestFixture(connection.provider as any)
    const dao = (index: number) =>
      getContract({
        address: f.daoAddress,
        abi: f.daoArtifact.abi,
        client: { public: f.publicClient, wallet: f.walletClients[index]! },
      })

    for (const index of [1, 2]) {
      await f.publicClient.waitForTransactionReceipt({ hash: await dao(index).write.createTreasury() })
    }
    const [treasuryA, treasuryB] = (await dao(0).read.getTreasuries()) as Address[]
    const deadline = (await f.publicClient.getBlock()).timestamp + 3600n

    const content = new Map<string, Uint8Array>()
    let gatewayDown = false
    const ipfs: IpfsTransport = {
      pin: async () => {
        throw new Error('readers never pin')
      },
      retrieve: async (cid) => {
        if (gatewayDown) throw new IpfsTransportError('retrieval-failed', 'gateway down')
        const bytes = content.get(cid)
        if (!bytes) throw new IpfsTransportError('content-not-found', 'not pinned')
        return bytes
      },
    }

    function publish(title: string, markdown: string): string {
      const bytes = encodeProposalDocument({ version: 1, title, markdown })
      const cid = rawCidFor(bytes)
      content.set(cid, bytes)
      return `ipfs://${cid}`
    }

    const refA = publish('Club day', '# Agenda\n\n[site](https://example.com)')
    const refB = publish('Hack night', '<script>alert(1)</script>')
    const refMissing = `ipfs://${rawCidFor(new TextEncoder().encode('never pinned'))}`

    const proposals: Array<[number, Address, bigint, string]> = [
      [3, treasuryA!, 12_500_000_000_000_000_000n, refA],
      [4, treasuryB!, 1n, refB],
      [3, treasuryB!, 2n, refMissing],
    ]
    for (const [index, treasury, amount, reference] of proposals) {
      await f.publicClient.waitForTransactionReceipt({
        hash: await dao(index).write.createProposal([treasury, amount, deadline, reference]),
      })
    }

    // No wallet adapter at all: public information needs no connection or NFT.
    const reader = createApplication(
      undefined,
      createRpcAdapter(f.publicClient),
      { chainId: 31337, daoAddress: f.daoAddress, testUsdAddress: f.testUsdAddress },
      { ipfs }
    )

    const list = await reader.listProposals()
    assert.equal(list.status, 'success')
    if (list.status !== 'success') return
    assert.equal(list.daoAddress, f.daoAddress)
    assert.deepEqual(list.proposals.map((p) => p.proposal.id), [3n, 2n, 1n])
    assert.deepEqual(list.proposals.map((p) => p.proposal.treasury), [
      getAddress(treasuryB!),
      getAddress(treasuryB!),
      getAddress(treasuryA!),
    ])
    assert.equal(list.proposals[2]!.formattedAmount, '12.5')
    assert.equal(list.proposals[2]!.proposal.creator, getAddress(f.accounts[3]!))
    assert.equal(list.proposals[2]!.proposal.votingDeadline, deadline)

    const first = await reader.readPublishedProposal(1n)
    assert.equal(first.status, 'success')
    if (first.status === 'success') {
      assert.equal(first.proposal.treasury, getAddress(treasuryA!))
      assert.equal(first.proposal.documentReference, refA)
      assert.equal(first.document.status, 'available')
      if (first.document.status === 'available') {
        assert.equal(first.document.title, 'Club day')
        assert.match(first.document.html, /<h1>Agenda<\/h1>/)
        assert.match(first.document.html, /rel="noopener noreferrer nofollow"/)
      }
    }

    const hostile = await reader.readPublishedProposal(2n)
    assert.equal(hostile.status, 'success')
    if (hostile.status === 'success' && hostile.document.status === 'available') {
      assert.ok(!hostile.document.html.includes('<script'))
    } else {
      assert.fail('expected a rendered document')
    }

    // Unavailable content keeps the on-chain record; pinning later fixes it.
    const missing = await reader.readPublishedProposal(3n)
    assert.equal(missing.status, 'success')
    if (missing.status === 'success') {
      assert.equal(missing.proposal.documentReference, refMissing)
      assert.equal(missing.document.status, 'unavailable')
    }
    const lateBytes = encodeProposalDocument({ version: 1, title: 'Late', markdown: 'pinned' })
    content.set(refMissing.slice('ipfs://'.length), new TextEncoder().encode('never pinned'))
    const malformed = await reader.readPublishedProposal(3n)
    assert.ok(malformed.status === 'success' && malformed.document.status === 'invalid-document')
    content.set(refMissing.slice('ipfs://'.length), lateBytes)
    const mismatched = await reader.readPublishedProposal(3n)
    assert.ok(mismatched.status === 'success' && mismatched.document.status === 'content-mismatch')

    gatewayDown = true
    const down = await reader.readPublishedProposal(1n)
    assert.ok(down.status === 'success' && down.document.status === 'transport-failure')
    gatewayDown = false

    assert.deepEqual(await reader.readPublishedProposal(99n), { status: 'not-found', id: 99n })
  } finally {
    await connection.close()
  }
})
