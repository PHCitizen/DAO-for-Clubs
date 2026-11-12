import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { exportPublicArtifacts } from './export-public-artifacts.mjs'

test('handoff exports only public deployment fields and ABI, not deployment tooling data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dao-handoff-'))
  try {
    await mkdir(join(root, 'artifacts'))
    await writeFile(join(root, 'artifacts/Example.json'), JSON.stringify({
      abi: [{ type: 'constructor', inputs: [], stateMutability: 'nonpayable' }],
      bytecode: 'deployment-only',
    }))
    const manifest = {
      chainId: 31337, daoAddress: null, testUsdAddress: null,
      artifacts: { Example: 'Example.json' },
      privateKey: 'must-not-cross-boundary',
    }
    const destination = join(root, 'public.json')
    await exportPublicArtifacts(manifest, join(root, 'artifacts'), destination)
    assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), {
      chainId: 31337, daoAddress: null, testUsdAddress: null,
      abis: { Example: [{ type: 'constructor', inputs: [], stateMutability: 'nonpayable' }] },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
