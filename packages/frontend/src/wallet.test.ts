import { afterEach, expect, test, vi } from 'vitest'
import { createBrowserWalletAdapter, WalletRejectedError, WalletUnavailableError } from './wallet'

const ACCOUNT = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const

afterEach(() => vi.unstubAllGlobals())

function stubProvider(request: (args: { method: string; params?: unknown[] }) => Promise<unknown>) {
  const provider = { request: vi.fn(request), on: vi.fn(), removeListener: vi.fn() }
  vi.stubGlobal('window', { ethereum: provider })
  return provider
}

test('browser adapter signMessage sends hex-encoded personal_sign params and returns the signature', async () => {
  const provider = stubProvider(async () => '0xabc')
  const signature = await createBrowserWalletAdapter().signMessage(ACCOUNT, 'hi')
  expect(signature).toBe('0xabc')
  expect(provider.request).toHaveBeenCalledExactlyOnceWith({
    method: 'personal_sign',
    params: ['0x6869', ACCOUNT],
  })
})

test('browser adapter signMessage maps EIP-1193 4001 to a wallet rejection', async () => {
  stubProvider(async () => {
    throw Object.assign(new Error('User rejected'), { code: 4001 })
  })
  await expect(createBrowserWalletAdapter().signMessage(ACCOUNT, 'hi')).rejects.toBeInstanceOf(WalletRejectedError)
})

test('browser adapter signMessage requires a wallet provider', async () => {
  vi.stubGlobal('window', {})
  await expect(createBrowserWalletAdapter().signMessage(ACCOUNT, 'hi')).rejects.toBeInstanceOf(WalletUnavailableError)
})
