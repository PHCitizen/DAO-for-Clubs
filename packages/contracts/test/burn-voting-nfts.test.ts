import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { decodeEventLog, getAddress, getContract, type Address } from 'viem'
import { deployTestFixture } from './fixtures.js'

test('burning removes only live treasury membership and never recycles IDs', async () => {
  const connection = await network.create('default')
  try {
    const f = await deployTestFixture(connection.provider as any)
    const dao = getContract({ address: f.daoAddress, abi: f.daoArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[1] } })
    for (let i = 0; i < 2; i++) await f.publicClient.waitForTransactionReceipt({ hash: await dao.write.createTreasury() })
    const [a, b] = await dao.read.getTreasuries() as Address[]
    const treasury = (address: Address, wallet = 1) => getContract({ address, abi: f.treasuryArtifact.abi,
      client: { public: f.publicClient, wallet: f.walletClients[wallet] } })
    const first = treasury(a)
    const second = treasury(b)
    const holder = f.accounts[3]
    const mine = async (hash: Promise<`0x${string}`>) => f.publicClient.waitForTransactionReceipt({ hash: await hash })
    for (let i = 0; i < 3; i++) await mine(first.write.mintVotingNft([holder]))
    await mine(second.write.mintVotingNft([holder]))
    await assert.rejects(treasury(a, 3).write.burnVotingNft([1n]), /UnauthorizedCaller/)
    await assert.rejects(treasury(a, 2).write.burnVotingNft([1n]), /UnauthorizedCaller/)
    const receipt = await mine(first.write.burnVotingNft([2n]))
    const event = receipt.logs.map(log => decodeEventLog({ abi: f.treasuryArtifact.abi, data: log.data, topics: log.topics }))[0]
    assert.equal(event.eventName, 'Transfer')
    assert.deepEqual(event.args, { from: getAddress(holder), to: '0x0000000000000000000000000000000000000000', tokenId: 2n })
    assert.equal(await first.read.totalSupply(), 2n)
    assert.equal(await first.read.balanceOf([holder]), 2n)
    assert.deepEqual(await first.read.tokensOfHolder([holder]), [1n, 3n])
    await assert.rejects(first.read.ownerOf([2n]), /NonexistentVotingNft/)
    for (const id of [0n, 2n, 99n]) await assert.rejects(first.write.burnVotingNft([id]), /NonexistentVotingNft/)
    await assert.rejects(second.write.burnVotingNft([3n]), /NonexistentVotingNft/)
    assert.equal(await second.read.totalSupply(), 1n)
    for (const id of [1n, 3n]) await mine(first.write.burnVotingNft([id]))
    assert.deepEqual(await first.read.tokensOfHolder([holder]), [])
    assert.equal(await first.read.totalSupply(), 0n)
    await mine(first.write.mintVotingNft([f.accounts[4]]))
    assert.equal((await first.read.ownerOf([4n]) as string).toLowerCase(), f.accounts[4].toLowerCase())
    assert.equal(await first.read.totalSupply(), 1n)
  } finally { await connection.close() }
})
