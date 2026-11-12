import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type PublicManifest = {
  chainId: number
  daoAddress: string | null
  testUsdAddress: string | null
  artifacts: Record<string, string>
}

async function readManifest(packageDirectory: string): Promise<PublicManifest> {
  const source = await readFile(resolve(packageDirectory, 'deployments/public.json'), 'utf8')
  return JSON.parse(source)
}

function validateManifest(manifest: PublicManifest): void {
  if (!Number.isSafeInteger(manifest.chainId) || manifest.chainId <= 0) {
    throw new Error('Public chainId must be a positive safe integer')
  }
  for (const address of [manifest.daoAddress, manifest.testUsdAddress]) {
    if (address !== null && !/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) {
      throw new Error('Public addresses must be EVM addresses or null')
    }
  }
}

async function readAbis(manifest: PublicManifest, artifactsDirectory: string) {
  const abis: Record<string, unknown[]> = {}
  for (const [name, artifactPath] of Object.entries(manifest.artifacts)) {
    const source = resolve(artifactsDirectory, artifactPath)
    const relativePath = relative(artifactsDirectory, source)
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('ABI source must be inside the artifacts directory')
    }
    const artifact = JSON.parse(await readFile(source, 'utf8'))
    if (!Array.isArray(artifact.abi)) throw new Error(`Missing ABI: ${name}`)
    abis[name] = artifact.abi
  }
  return abis
}

async function writePublicArtifacts(
  manifest: PublicManifest,
  abis: Record<string, unknown[]>,
  destination: string,
): Promise<void> {
  // Only these public fields cross into the frontend, never full deployment config.
  const { chainId, daoAddress, testUsdAddress } = manifest
  const output = { chainId, daoAddress, testUsdAddress, abis }
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, JSON.stringify(output, null, 2) + '\n')
}

async function main(): Promise<void> {
  const packageDirectory = fileURLToPath(new URL('../', import.meta.url))
  const manifest = await readManifest(packageDirectory)
  validateManifest(manifest)
  const abis = await readAbis(manifest, resolve(packageDirectory, 'artifacts'))
  await writePublicArtifacts(
    manifest,
    abis,
    resolve(packageDirectory, '../frontend/src/generated/public-artifacts.json'),
  )
}

await main()
