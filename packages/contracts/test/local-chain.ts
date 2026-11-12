import assert from 'node:assert/strict'
import { test } from 'node:test'
import { network } from 'hardhat'

test('local EVM mines a transfer and exposes its receipt', async () => {
  const connection = await network.create('default')
  try {
    const provider = connection.provider
    assert.equal(await provider.request({ method: 'eth_chainId' }), '0x7a69')
    const accounts = await provider.request({ method: 'eth_accounts' }) as string[]
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: accounts[0], to: accounts[1], value: '0x1' }],
    })
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [hash],
    }) as { status: string; to: string }
    assert.equal(receipt.status, '0x1')
    assert.equal(receipt.to.toLowerCase(), accounts[1].toLowerCase())
  } finally {
    await connection.close()
  }
})
