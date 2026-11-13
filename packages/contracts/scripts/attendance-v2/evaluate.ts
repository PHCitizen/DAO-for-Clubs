import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { network } from 'hardhat'
import { encodeFunctionData, decodeFunctionResult, verifyMessage, type Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { PRIME, DOMAIN, field, hex, limbs, context, recover, tree, membership, type Hash } from './format.ts'

const here = fileURLToPath(new URL('.', import.meta.url))
const work = process.env.ATTENDANCE_WORK ?? '/tmp/opencode/attendance-v2'
const solidity = process.env.POSEIDON_SOLIDITY ?? '/tmp/opencode/attendance-poseidon-solidity'
const noir = process.env.POSEIDON_NOIR ?? '/tmp/opencode/attendance-noir-poseidon'
const solc = process.env.SOLC ?? '/tmp/opencode/attendance-bin/solc'
const nargo = process.env.NARGO ?? '/tmp/opencode/attendance-bin/nargo'
const run = (cmd: string, args: string[], cwd = here) => execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const literal = (n: bigint | string) => typeof n === 'bigint' ? n.toString() : BigInt(n).toString()

async function main() {
  assert.equal(run('git', ['rev-parse', 'HEAD'], solidity).trim(), '4c599a08a45cd465a153d724425cee331c010df1')
  assert.equal(run('git', ['rev-parse', 'HEAD'], noir).trim(), '36c8db5a86795038822323dee790dd760372766d')
  // Reject edited primitive source, not merely a checkout with the expected HEAD.
  assert.equal(run('git', ['diff', 'HEAD', '--', 'src'], solidity), '')
  assert.equal(run('git', ['diff', 'HEAD', '--', 'poseidon2', 'hash_utils'], noir), '')
  assert.match(run(solc, ['--version']), /0\.8\.24\+commit\.e11b9ed9/)
  assert.match(run(nargo, ['--version']), /1\.0\.0-beta\.26/)
  await mkdir(resolve(work, 'src'), { recursive: true })
  const compiled = JSON.parse(run(solc, ['--optimize', '--optimize-runs', '200', '--combined-json', 'abi,bin-runtime', '--allow-paths', solidity, `upstream/=${solidity}/src/`, resolve(here, 'Hash.sol')])) as { contracts: Record<string, { abi: Abi; 'bin-runtime': string }> }
  const artifact = Object.entries(compiled.contracts).find(([name]) => name.endsWith(':Hash'))![1]
  const connection = await network.create('default')
  try {
    const address = '0x0000000000000000000000000000000000001234' as const
    await connection.provider.request({ method: 'hardhat_setCode', params: [address, `0x${artifact['bin-runtime']}`] })
    const calls = new Map<string, { d: string; a: string; b: string; out: string }>()
    const hash: Hash = async (d, a, b) => {
      const key = `${d},${a},${b}`
      const old = calls.get(key)
      if (old) return BigInt(old.out)
      const data = encodeFunctionData({ abi: artifact.abi, functionName: 'hash', args: [d, a, b] })
      const raw = await connection.provider.request({ method: 'eth_call', params: [{ to: address, data }, 'latest'] }) as `0x${string}`
      const out = decodeFunctionResult({ abi: artifact.abi, functionName: 'hash', data: raw }) as bigint
      calls.set(key, { d: d.toString(), a: a.toString(), b: b.toString(), out: out.toString() })
      return out
    }
    const boundaries = []
    for (const d of Object.values(DOMAIN)) for (const x of [0n, PRIME - 1n]) {
      const out = await hash(d, x, x)
      boundaries.push({ d: literal(d), a: literal(x), b: literal(x), out: literal(out) })
    }
    for (let lane = 0; lane < 3; lane++) {
      const args = [1n, 0n, 0n]; args[lane] = PRIME
      await assert.rejects(() => hash(args[0], args[1], args[2]))
    }
    const ctx = await context(hash, 97n, 0x1234567890abcdef1234567890abcdef12345678n, 42n)
    const message = 'DAO for Clubs attendance v2\nChain ID: 97\nDAO: 0x1234567890AbcdEF1234567890aBcdef12345678\nProposal ID: 42'
    // Public test-only key; never a deployment credential or user signature.
    const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
    const signature = await account.signMessage({ message })
    assert(await verifyMessage({ address: account.address, message, signature }))
    const secret = await recover(hash, ctx, signature)
    const entry = await hash(DOMAIN.entry, ctx, secret)
    // The actual selected recovery/context folds must cross runtimes too, not
    // merely the membership circuit receiving an already-computed context.
    for (const call of calls.values()) if ((call.d === '1' || call.d === '5') && !boundaries.some(x => x.d === call.d && x.a === call.a && x.b === call.b)) boundaries.push(call)
    const sets = []
    for (const size of [0, 1, 2, 3, 1023, 1024]) {
      const entries = size ? [hex(entry), ...Array.from({ length: size - 1 }, (_, i) => hex(BigInt(i)))] : []
      const result = await tree(hash, ctx, entries)
      const index = result.entries.indexOf(hex(entry))
      const siblings = size ? result.path(index) : []
      if (size) assert.equal(await membership(hash, ctx, secret, size, index, siblings), result.root)
      sets.push({ size, entries: result.entries, root: result.root, index, siblings })
      console.log(`Solidity-backed tree ${size}: ${result.root}`)
    }
    const sample = sets.find(x => x.size === 3)!
    assert.equal((await tree(hash, ctx, [...sample.entries].reverse().concat(sample.entries[0]))).root, sample.root)
    await assert.rejects(() => tree(hash, ctx, Array.from({ length: 1025 }, (_, i) => hex(BigInt(i)))))
    for (const bad of ['0x0', '0x' + 'FF'.repeat(32), ' ' + hex(0n), '0x' + PRIME.toString(16).padStart(64, '0'), '0x' + 'ff'.repeat(32)]) assert.throws(() => field(bad))
    assert.equal(field(hex(PRIME - 1n)), PRIME - 1n)
    assert.throws(() => limbs(1n << 256n))
    assert.deepEqual(limbs((1n << 256n) - 1n), [(1n << 128n) - 1n, (1n << 128n) - 1n])
    for (const [chain, dao, proposal] of [[97n + (1n << 128n), 0x1234567890abcdef1234567890abcdef12345678n, 42n], [97n, 0x1234567890abcdef1234567890abcdef12345679n, 42n], [97n, 0x1234567890abcdef1234567890abcdef12345678n, 42n + (1n << 128n)]]) assert.notEqual(await context(hash, chain, dao, proposal), ctx)
    await assert.rejects(() => recover(hash, ctx, '0x'))
    await assert.rejects(() => membership(hash, ctx, secret, 0, 0, sample.siblings))
    await assert.rejects(() => membership(hash, ctx, secret, 3, 3, sample.siblings))
    await assert.rejects(() => membership(hash, ctx, secret, 3, sample.index, sample.siblings.slice(1)))
    const changed = [...sample.siblings]; changed[0] = hex((field(changed[0]) + 1n) % PRIME)
    assert.notEqual(await membership(hash, ctx, secret, 3, sample.index, changed), sample.root)
    assert.notEqual(await membership(hash, ctx, (secret + 1n) % PRIME, 3, sample.index, sample.siblings), sample.root)
    assert.notEqual(await membership(hash, (ctx + 1n) % PRIME, secret, 3, sample.index, sample.siblings), sample.root)
    const checks = `// Generated from actual pinned Solidity execution; do not hand-edit.\nuse crate::{hash, main};\n` + boundaries.map((v, i) => `#[test]\nfn hash_${i}() { assert(hash(${v.d}, ${v.a}, ${v.b}) == ${v.out}); }\n`).join('') + sets.filter(x => x.size).map(v => `#[test]\nfn membership_${v.size}() { main(${ctx}, ${v.size}, ${literal(v.root)}, ${secret}, ${v.index}, [${v.siblings.map(literal).join(',')}]); }\n`).join('') + `#[test]\nfn empty_root() { let mut n = hash(4, ${ctx}, 0); for i in 0..10 { n = hash(16 + i as Field, n, n); } assert(hash(6, ${ctx}, hash(7, 0, n)) == ${literal(sets[0].root)}); }\n` + [
      { name: 'wrong_secret', ctx, secret: (secret + 1n) % PRIME, index: sample.index, siblings: sample.siblings },
      { name: 'wrong_context', ctx: (ctx + 1n) % PRIME, secret, index: sample.index, siblings: sample.siblings },
      { name: 'wrong_path', ctx, secret, index: sample.index, siblings: changed },
      { name: 'padding_index', ctx, secret, index: 3, siblings: sample.siblings },
    ].map(v => `#[test(should_fail)]\nfn ${v.name}() { main(${v.ctx}, 3, ${literal(sample.root)}, ${v.secret}, ${v.index}, [${v.siblings.map(literal).join(',')}]); }\n`).join('')
    const vectors = { proposed: true, context: hex(ctx), message, signature, secret: hex(secret), entry: hex(entry), boundaries, sets }
    const json = JSON.stringify(vectors, null, 2) + '\n'
    const vectorPath = resolve(here, 'vectors.json')
    if (process.argv.includes('--write')) {
      await writeFile(vectorPath, json)
      await writeFile(resolve(here, 'vectors.nr'), checks)
    } else {
      assert.equal(await readFile(vectorPath, 'utf8'), json, 'committed vectors changed')
      assert.equal(await readFile(resolve(here, 'vectors.nr'), 'utf8'), checks, 'committed Noir tests changed')
    }
    await copyFile(resolve(here, 'main.nr'), resolve(work, 'src/main.nr'))
    await writeFile(resolve(work, 'src/vectors.nr'), checks)
    await writeFile(resolve(work, 'Nargo.toml'), `[package]\nname = "attendance_v2"\ntype = "bin"\ncompiler_version = ">=0.36.0"\n[dependencies]\nposeidon2 = { path = "${noir}/poseidon2" }\n`)
    await writeFile(resolve(work, 'Prover.toml'), `ctx = "${ctx}"\ncount = "3"\nroot = "${sample.root}"\nsecret = "${secret}"\nindex = "${sample.index}"\nsiblings = [${sample.siblings.map(x => `"${x}"`).join(',')}]\n`)
    console.log(run(nargo, ['test', '--program-dir', work]))
    console.log(run(nargo, ['compile', '--program-dir', work]))
    // A sibling package avoids Nargo discovering the enclosing membership package.
    const hashWork = `${work}-hash`
    await mkdir(resolve(hashWork, 'src'), { recursive: true })
    await copyFile(resolve(here, 'hash.nr'), resolve(hashWork, 'src/main.nr'))
    await writeFile(resolve(hashWork, 'Nargo.toml'), `[package]\nname = "attendance_hash"\ntype = "bin"\ncompiler_version = ">=0.36.0"\n[dependencies]\nposeidon2 = { path = "${noir}/poseidon2" }\n`)
    console.log(run(nargo, ['compile', '--program-dir', hashWork]))
    console.log('PASS: canonical parsing/size/path controls, Solidity vectors, Noir tests and membership compilation')
  } finally { await connection.close() }
}
await main()
