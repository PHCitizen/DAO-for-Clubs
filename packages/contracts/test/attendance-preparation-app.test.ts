import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'
import { encodeFunctionData, getContract, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createApplication } from '../../frontend/src/application.ts'
import { createProposalOnChain } from '../../frontend/src/proposalCreation.ts'
import type { RpcAdapter } from '../../frontend/src/rpc.ts'
import type { WalletAdapter } from '../../frontend/src/wallet.ts'
import { deployTestFixture } from './fixtures.js'

const REFERENCE = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const SIGNER = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

test('actual contract fixes event version at creation and the application recovers, scans, reloads and prepares only that v2 event', async () => {
  const connection = await network.create('default')
  try {
    const fixture = await deployTestFixture(connection.provider as any)
    const { publicClient, daoAddress, daoArtifact, testUsdAddress, walletClients } = fixture
    const dao = getContract({ address: daoAddress, abi: daoArtifact.abi, client: { public: publicClient, wallet: walletClients[0]! } })
    await publicClient.waitForTransactionReceipt({ hash: await dao.write.createTreasury() })
    const treasury = (await dao.read.getTreasuries() as Address[])[0]!
    const deadline = (await publicClient.getBlock()).timestamp + 3600n
    await publicClient.waitForTransactionReceipt({ hash: await dao.write.createProposal([treasury, 1n, deadline, REFERENCE]) })
    const creation = await createProposalOnChain({
      getChainId: () => publicClient.getChainId(),
      readContract: request => publicClient.readContract(request as any) as any,
      sendTransaction: async request => await connection.provider.request({ method: 'eth_sendTransaction', params: [{ from: request.from, to: request.address, data: encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args }) }] }) as Hex,
      waitForTransactionReceipt: hash => publicClient.waitForTransactionReceipt({ hash }),
    }, { chainId: 31337, daoAddress, testUsdAddress, daoAbi: daoArtifact.abi, testUsdAbi: fixture.testUsdArtifact.abi }, {
      from: SIGNER.address, treasury, amount: '1', votingDeadline: Number(deadline), documentReference: REFERENCE, attendanceVersion: 2,
    })
    assert.equal(creation.status, 'success')
    assert.equal(await dao.read.attendanceVersion([1n]), 1)
    assert.equal(await dao.read.attendanceVersion([2n]), 2)
    await assert.rejects(dao.read.attendanceVersion([3n]))
    assert.equal(daoArtifact.abi.some(item => item.type === 'function' && /set.*version|migrat|upgrade/i.test(item.name)), false)

    const wallet: WalletAdapter = {
      isAvailable: () => true, connect: async () => SIGNER.address, disconnect: async () => {},
      getAccount: async () => SIGNER.address, getChainId: async () => 31337,
      onAccountChanged: () => () => {}, onChainChanged: () => () => {},
      switchChain: async () => {}, signMessage: async (_account, message) => SIGNER.signMessage({ message }),
      sendTransaction: async () => { throw new Error('Preparation must never submit a transaction') },
    }
    const rpc = { getChainId: () => publicClient.getChainId(), readContract: request => publicClient.readContract(request as any) } as RpcAdapter
    const saved = new Map<string, string>()
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value) } }
    let emit: (payload: string) => void = () => {}
    const app = createApplication(wallet, rpc, { chainId: 31337, daoAddress, testUsdAddress }, { attendanceStorage: storage, camera: { start: async onPayload => { emit = onPayload; return { stop() {} } } } })
    await app.connect()
    const v1 = await app.prepareAttendanceCredential({ proposalId: 1n })
    assert.equal(v1.status, 'ready')
    assert.equal(JSON.parse(v1.qr).v, 1)
    assert.equal((await app.prepareAttendanceSet({ proposalId: 1n })).status, 'unsupported-version')

    const v2 = await app.prepareAttendanceCredential({ proposalId: 2n })
    assert.equal(v2.status, 'ready')
    const scan = await app.startAttendanceScan({ proposalId: 2n })
    assert.equal(scan.status, 'scanning')
    emit(v1.qr)
    assert.equal(scan.session.read().count, 0)
    emit(v2.qr)
    emit(v2.qr)
    assert.equal(scan.session.read().count, 1)
    assert.equal(scan.session.read().storage.status, 'saved')
    const reloaded = createApplication(wallet, rpc, { chainId: 31337, daoAddress, testUsdAddress }, { attendanceStorage: storage })
    await reloaded.connect()
    const prepared = await reloaded.prepareAttendanceSet({ proposalId: 2n })
    assert.equal(prepared.status, 'prepared')
    assert.equal(prepared.set.bytes, `{"schema":"attendance-set/v2","chainId":"31337","dao":"${daoAddress.toLowerCase()}","proposalId":"2","entries":["${v2.entry}"]}`)
    assert.equal(prepared.set.count, 1)
    assert.deepEqual(reloaded.readPreparedAttendanceSet({ proposalId: 2n }), prepared)
    assert.equal(await dao.read.attendanceVersion([1n]), 1)
    assert.equal(await dao.read.attendanceVersion([2n]), 2)
    // No funding, passing vote, finalization or on-chain membership needed.
    assert.equal(await publicClient.getBalance({ address: treasury }), 0n)
    assert.equal(await dao.read.proposalCount(), 2n)
  } finally {
    await connection.close()
  }
})
