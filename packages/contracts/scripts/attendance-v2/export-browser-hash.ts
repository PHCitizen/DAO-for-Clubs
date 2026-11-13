import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Reproduce the browser arithmetic adapter, not a prover or proof artifact.
async function main() {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const upstream = process.env.POSEIDON_NOIR ?? '/tmp/opencode/attendance-noir-poseidon'
  const work = process.env.ATTENDANCE_HASH_WORK ?? '/tmp/opencode/attendance-browser-hash'
  const nargo = process.env.NARGO ?? '/tmp/opencode/attendance-bin/nargo'
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim()
  if (revision !== '36c8db5a86795038822323dee790dd760372766d' ||
      execFileSync('git', ['status', '--porcelain'], { cwd: upstream, encoding: 'utf8' }).trim()) {
    throw new Error('Expected clean pinned Noir Poseidon2 source')
  }
  if (!execFileSync(nargo, ['--version'], { encoding: 'utf8' }).includes('1.0.0-beta.26')) {
    throw new Error('Expected nargo 1.0.0-beta.26')
  }
  await mkdir(resolve(work, 'src'), { recursive: true })
  await copyFile(resolve(here, 'hash.nr'), resolve(work, 'src/main.nr'))
  await writeFile(resolve(work, 'Nargo.toml'), `[package]\nname = "attendance_hash"\ntype = "bin"\ncompiler_version = ">=0.36.0"\n[dependencies]\nposeidon2 = { path = "${upstream}/poseidon2" }\n`)
  execFileSync(nargo, ['compile', '--program-dir', work], { stdio: 'inherit' })
  const artifact = JSON.parse(await readFile(resolve(work, 'target/attendance_hash.json'), 'utf8'))
  // Debug symbols/source paths are unnecessary at runtime and not reproducible.
  const output = { noir_version: artifact.noir_version, hash: artifact.hash, abi: artifact.abi, bytecode: artifact.bytecode }
  await writeFile(resolve(here, '../../../frontend/src/attendanceHash.json'), JSON.stringify(output) + '\n')
}

await main()
