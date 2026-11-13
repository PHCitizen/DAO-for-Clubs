import { createServer } from 'node:http'
import { readFile, writeFile, copyFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const here = fileURLToPath(new URL('.', import.meta.url))
const work = process.env.ATTENDANCE_WORK ?? '/tmp/opencode/attendance-v2'
const runtime = process.env.ATTENDANCE_RUNTIME ?? '/tmp/opencode/private-zk-qualification'
const source = process.env.PROVEKIT_SOURCE ?? '/tmp/opencode/private-zk-provekit'
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), '4ee40639fb8849aeeba37761fdda07f28367e81d')
for (const name of ['noir_js', 'acvm_js']) {
  const json = JSON.parse(await readFile(resolve(runtime, `node_modules/@noir-lang/${name}/package.json`), 'utf8'))
  assert.equal(json.version, '1.0.0-beta.26')
}
const esbuild = resolve(runtime, 'node_modules/.bin/esbuild')
execFileSync(esbuild, ['--bundle', '--format=esm', '--platform=browser', `--outfile=${work}/runtime.js`], { cwd: runtime, input: "export { Noir } from '@noir-lang/noir_js'; export { decompressWitnessStack } from '@noir-lang/acvm_js';", stdio: ['pipe', 'inherit', 'inherit'] })
execFileSync(esbuild, [resolve(here, 'browser.ts'), '--format=esm', '--platform=browser', `--outfile=${work}/browser.js`], { cwd: runtime, stdio: 'inherit' })
// These are the WEB wasm files, not Node variants. Resolve from the pinned packages.
await copyFile(resolve(runtime, 'node_modules/@noir-lang/acvm_js/web/acvm_js_bg.wasm'), resolve(work, 'acvm_js_bg.wasm'))
const noirRequire = createRequire(resolve(await realpath(resolve(runtime, 'node_modules/@noir-lang/noir_js')), 'package.json'))
const abiMain = noirRequire.resolve('@noir-lang/noirc_abi')
await copyFile(resolve(abiMain, '../../web/noirc_abi_wasm_bg.wasm'), resolve(work, 'noirc_abi_wasm_bg.wasm'))
createServer(async (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  try {
    const path = new URL(req.url!, 'http://localhost').pathname
    if (path === '/result' && req.method === 'POST') {
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('result too large'); chunks.push(chunk) }
      await writeFile(resolve(work, 'browser-result.json'), Buffer.concat(chunks)); res.end('saved'); return
    }
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Attendance v2 evaluation</title><pre id="result">starting</pre><script type="module" src="/browser.js"></script>'); return }
    const files: Record<string, string> = Object.fromEntries(['browser.js', 'runtime.js', 'acvm_js_bg.wasm', 'noirc_abi_wasm_bg.wasm'].map(name => [`/${name}`, resolve(work, name)]))
    files['/vectors.json'] = resolve(here, 'vectors.json')
    files['/hash.json'] = resolve(`${work}-hash`, 'target/attendance_hash.json')
    for (const name of ['attendance_v2.pkp', 'attendance_v2.pkv']) files[`/artifacts/${name}`] = resolve(work, name)
    const pkg = resolve(source, 'tooling/provekit-wasm/pkg')
    let file = files[path]
    if (path === '/pkg/') file = resolve(pkg, 'provekit_wasm.js')
    else if (path.startsWith('/pkg/')) {
      const candidate = resolve(pkg, '.' + path.slice(4))
      if (candidate.startsWith(pkg + '/')) file = candidate
    }
    if (!file) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.json') ? 'application/json' : 'text/javascript')
    res.end(await readFile(file))
  } catch (error) { console.error(String(error)); res.writeHead(500).end() }
}).listen(4321, '127.0.0.1', () => console.log('http://127.0.0.1:4321'))
