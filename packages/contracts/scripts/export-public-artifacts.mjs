import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Allowlist the browser handoff; never serialize deployment config or a full artifact.
export async function exportPublicArtifacts(manifest, artifactsDirectory, destination) {
  const { chainId, daoAddress, testUsdAddress } = manifest
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('Public chainId must be a positive safe integer')
  }
  for (const address of [daoAddress, testUsdAddress]) {
    if (address !== null && !/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) {
      throw new Error('Public addresses must be EVM addresses or null')
    }
  }
  const abis = {}
  for (const [name, artifactPath] of Object.entries(manifest.artifacts)) {
    const source = resolve(artifactsDirectory, artifactPath)
    const pathWithinArtifacts = relative(resolve(artifactsDirectory), source)
    if (pathWithinArtifacts.startsWith('..') || isAbsolute(pathWithinArtifacts)) {
      throw new Error('ABI source must be inside the artifacts directory')
    }
    const artifact = JSON.parse(await readFile(source, 'utf8'))
    if (!Array.isArray(artifact.abi)) throw new Error(`Missing ABI: ${name}`)
    abis[name] = artifact.abi
  }
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, JSON.stringify({ chainId, daoAddress, testUsdAddress, abis }, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const packageDirectory = fileURLToPath(new URL('../', import.meta.url))
  const manifest = JSON.parse(await readFile(resolve(packageDirectory, 'deployments/public.json'), 'utf8'))
  await exportPublicArtifacts(
    manifest,
    resolve(packageDirectory, 'artifacts'),
    resolve(packageDirectory, '../frontend/src/generated/public-artifacts.json'),
  )
}
