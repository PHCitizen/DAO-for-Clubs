import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { decodeEventLog, getContract, type Address } from 'viem'
import { deployTestFixture } from './fixtures.js'

test('voting NFT minting on a real local chain', async (t) => {
  const connection = await network.create('default')
  try {
    const fixture = await deployTestFixture(connection.provider as any)
    const { daoAddress, publicClient, walletClients, accounts, daoArtifact, treasuryArtifact } = fixture

    const administrator = accounts[1]!
    const holder = accounts[3]!

    const daoAsAdmin = getContract({
      address: daoAddress,
      abi: daoArtifact.abi,
      client: { public: publicClient, wallet: walletClients[1]! },
    })
    await publicClient.waitForTransactionReceipt({ hash: await daoAsAdmin.write.createTreasury() })
    const treasuryAddress = ((await daoAsAdmin.read.getTreasuries()) as Address[])[0]!

    const treasury = getContract({
      address: treasuryAddress,
      abi: treasuryArtifact.abi,
      client: { public: publicClient },
    })
    const treasuryAsAdmin = getContract({
      address: treasuryAddress,
      abi: treasuryArtifact.abi,
      client: { public: publicClient, wallet: walletClients[1]! },
    })

    await t.test('the treasury administrator mints a voting NFT with confirmed ownership and live supply', async () => {
      const hash = await treasuryAsAdmin.write.mintVotingNft([holder])
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      assert.equal(receipt.status, 'success')

      let mintedTokenId: bigint | null = null
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== treasuryAddress.toLowerCase()) continue
        try {
          const decoded = decodeEventLog({ abi: treasuryArtifact.abi, data: log.data, topics: log.topics })
          if (decoded.eventName === 'Transfer') {
            const args = decoded.args as unknown as { from: string; to: string; tokenId: bigint }
            assert.equal(args.from, '0x0000000000000000000000000000000000000000')
            assert.equal(args.to.toLowerCase(), holder.toLowerCase())
            mintedTokenId = args.tokenId
          }
        } catch {
          // not this event
        }
      }
      assert.equal(mintedTokenId, 1n, 'the first mint allocates token ID 1')

      assert.equal(await treasury.read.totalSupply(), 1n)
      assert.equal(await treasury.read.balanceOf([holder]), 1n)
      assert.equal(((await treasury.read.ownerOf([1n])) as string).toLowerCase(), holder.toLowerCase())
      assert.deepEqual(await treasury.read.tokensOfHolder([holder]), [1n])
      assert.equal(((await treasury.read.administrator()) as string).toLowerCase(), administrator.toLowerCase())
    })

    await t.test('non-administrators cannot mint, and the zero address cannot hold a voting NFT', async () => {
      const intruder = getContract({
        address: treasuryAddress,
        abi: treasuryArtifact.abi,
        client: { public: publicClient, wallet: walletClients[2]! },
      })
      await assert.rejects(
        () => intruder.write.mintVotingNft([accounts[2]!]),
        (error: Error) => error.message.includes('UnauthorizedCaller')
      )
      await assert.rejects(
        () => treasuryAsAdmin.write.mintVotingNft(['0x0000000000000000000000000000000000000000']),
        (error: Error) => error.message.includes('ZeroAddressParam')
      )
      assert.equal(await treasury.read.totalSupply(), 1n, 'failed mints must not change the live supply')
    })

    await t.test('one wallet may hold multiple voting NFTs and IDs are allocated monotonically', async () => {
      const otherHolder = accounts[4]!
      await publicClient.waitForTransactionReceipt({ hash: await treasuryAsAdmin.write.mintVotingNft([holder]) })
      await publicClient.waitForTransactionReceipt({ hash: await treasuryAsAdmin.write.mintVotingNft([otherHolder]) })

      assert.equal(await treasury.read.totalSupply(), 3n)
      assert.equal(await treasury.read.balanceOf([holder]), 2n)
      assert.deepEqual(await treasury.read.tokensOfHolder([holder]), [1n, 2n])
      assert.deepEqual(await treasury.read.tokensOfHolder([otherHolder]), [3n])
      assert.equal(((await treasury.read.ownerOf([2n])) as string).toLowerCase(), holder.toLowerCase())
      assert.equal(((await treasury.read.ownerOf([3n])) as string).toLowerCase(), otherHolder.toLowerCase())
      await assert.rejects(
        () => treasury.read.ownerOf([4n]),
        (error: Error) => error.message.includes('NonexistentVotingNft')
      )
    })

    await t.test('every exposed transfer path rejects, even for the holder and the administrator', async () => {
      const treasuryAsHolder = getContract({
        address: treasuryAddress,
        abi: treasuryArtifact.abi,
        client: { public: publicClient, wallet: walletClients[3]! },
      })
      const recipient = accounts[5]!
      const expectsDisabled = (error: Error) => error.message.includes('VotingNftTransferDisabled')

      await assert.rejects(() => treasuryAsHolder.write.transferFrom([holder, recipient, 1n]), expectsDisabled)
      await assert.rejects(() => treasuryAsHolder.write.safeTransferFrom([holder, recipient, 1n]), expectsDisabled)
      await assert.rejects(() => treasuryAsHolder.write.safeTransferFrom([holder, recipient, 1n, '0x']), expectsDisabled)
      await assert.rejects(() => treasuryAsHolder.write.approve([recipient, 1n]), expectsDisabled)
      await assert.rejects(() => treasuryAsHolder.write.setApprovalForAll([recipient, true]), expectsDisabled)
      await assert.rejects(() => treasuryAsAdmin.write.transferFrom([holder, recipient, 1n]), expectsDisabled)
      await assert.rejects(() => treasuryAsAdmin.write.safeTransferFrom([holder, recipient, 1n]), expectsDisabled)
      await assert.rejects(() => treasuryAsAdmin.write.safeTransferFrom([holder, recipient, 1n, '0x']), expectsDisabled)
      await assert.rejects(() => treasuryAsAdmin.write.approve([recipient, 1n]), expectsDisabled)
      await assert.rejects(() => treasuryAsAdmin.write.setApprovalForAll([recipient, true]), expectsDisabled)

      assert.equal(((await treasury.read.ownerOf([1n])) as string).toLowerCase(), holder.toLowerCase())
      assert.equal(await treasury.read.balanceOf([recipient]), 0n)
    })

    await t.test('membership is isolated across treasuries with independently scoped token IDs', async () => {
      const secondAdmin = accounts[2]!
      const daoAsSecond = getContract({
        address: daoAddress,
        abi: daoArtifact.abi,
        client: { public: publicClient, wallet: walletClients[2]! },
      })
      await publicClient.waitForTransactionReceipt({ hash: await daoAsSecond.write.createTreasury() })
      const secondTreasuryAddress = ((await daoAsSecond.read.getTreasuries()) as Address[])[1]!
      const secondTreasury = getContract({
        address: secondTreasuryAddress,
        abi: treasuryArtifact.abi,
        client: { public: publicClient },
      })
      const secondTreasuryAsAdmin = getContract({
        address: secondTreasuryAddress,
        abi: treasuryArtifact.abi,
        client: { public: publicClient, wallet: walletClients[2]! },
      })
      assert.equal(((await secondTreasury.read.administrator()) as string).toLowerCase(), secondAdmin.toLowerCase())

      // The first treasury's administrator has no authority over the second.
      const firstAdminOnSecond = getContract({
        address: secondTreasuryAddress,
        abi: treasuryArtifact.abi,
        client: { public: publicClient, wallet: walletClients[1]! },
      })
      await assert.rejects(
        () => firstAdminOnSecond.write.mintVotingNft([holder]),
        (error: Error) => error.message.includes('UnauthorizedCaller')
      )

      // Token identity is (treasury, tokenId): each treasury starts its own sequence.
      await publicClient.waitForTransactionReceipt({ hash: await secondTreasuryAsAdmin.write.mintVotingNft([holder]) })
      assert.equal(await secondTreasury.read.totalSupply(), 1n)
      assert.deepEqual(await secondTreasury.read.tokensOfHolder([holder]), [1n])
      assert.equal(((await secondTreasury.read.ownerOf([1n])) as string).toLowerCase(), holder.toLowerCase())

      // The first treasury is untouched by the second treasury's mint.
      assert.equal(await treasury.read.totalSupply(), 3n)
      assert.deepEqual(await treasury.read.tokensOfHolder([holder]), [1n, 2n])
      assert.equal(((await treasury.read.ownerOf([1n])) as string).toLowerCase(), holder.toLowerCase())
    })
  } finally {
    await connection.close()
  }
})
