// Browser-only evaluation. Optional pinned runtime is served by browser-server.ts;
// no runtime dependencies or prover artifacts enter the frontend workspace.
const runtimeUrl = '/runtime.js', proverUrl = '/pkg/provekit_wasm.js'
const result: Record<string, unknown> = { stage: 'starting', userAgent: navigator.userAgent, isolated: crossOriginIsolated }
;(window as unknown as { attendance: typeof result }).attendance = result
const show = () => { document.querySelector('#result')!.textContent = JSON.stringify(result, null, 2) }
const bytes = async (path: string) => new Uint8Array(await (await fetch(path)).arrayBuffer())
const required = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
async function main() {
  const start = performance.now()
  const { Noir, decompressWitnessStack } = await import(runtimeUrl)
  const m = await import(proverUrl)
  await m.default(); m.initPanicHook(); await m.initThreadPool(2)
  const prover = new m.Prover(await bytes('/artifacts/attendance_v2.pkp'))
  const verifier = new m.Verifier(await bytes('/artifacts/attendance_v2.pkv'))
  const circuit = JSON.parse(new TextDecoder().decode(prover.getCircuit()))
  const vectors = await (await fetch('/vectors.json')).json()
  const hashCircuit = new Noir(await (await fetch('/hash.json')).json())
  const hash = async (d: string, a: string, b: string) => {
    const { returnValue } = await hashCircuit.execute({ d, a, b })
    return BigInt(returnValue).toString()
  }
  for (const v of vectors.boundaries) required(await hash(v.d, v.a, v.b) === v.out, 'Chrome hash mismatch')
  result.chromeHashVectors = vectors.boundaries.length
  let empty = await hash('4', vectors.context, '0')
  for (let i = 0; i < 10; i++) empty = await hash(String(16 + i), empty, empty)
  const emptyRoot = await hash('6', vectors.context, await hash('7', '0', empty))
  required(BigInt(emptyRoot) === BigInt(vectors.sets[0].root), 'Chrome empty root mismatch')
  result.chromeEmptyRoot = true
  result.constraints = prover.getNumConstraints(); result.witnesses = prover.getNumWitnesses()
  const noir = new Noir(circuit)
  const input = (set: { size: number; root: string; index: number; siblings: string[] }) => ({ ctx: vectors.context, count: String(set.size), root: set.root, secret: vectors.secret, index: String(set.index), siblings: set.siblings })
  const checks: number[] = []
  for (const set of vectors.sets.filter((x: { size: number }) => x.size > 0)) {
    await noir.execute(input(set)); checks.push(set.size)
  }
  result.chromeWitnessSizes = checks
  const selected = vectors.sets.find((x: { size: number }) => x.size === 3)
  const negative = async (name: string, data: ReturnType<typeof input>) => {
    let rejected = false
    try { await noir.execute(data) } catch { rejected = true }
    required(rejected, `${name} witness accepted`)
    return rejected
  }
  result.wrongSecretRejected = await negative('wrong secret', { ...input(selected), secret: '0' })
  result.wrongContextRejected = await negative('wrong context', { ...input(selected), ctx: '0' })
  const siblings = [...selected.siblings]; siblings[0] = '0'
  result.wrongPathRejected = await negative('wrong path', { ...input(selected), siblings })
  result.paddingIndexRejected = await negative('padding index', { ...input(selected), index: '3' })
  const { witness } = await noir.execute(input(selected))
  result.stage = 'proving'; show()
  const proveStart = performance.now()
  const proof = prover.proveBytes(decompressWitnessStack(witness)[0].witness)
  result.proveMs = performance.now() - proveStart; result.proofBytes = proof.length
  const verifyStart = performance.now()
  verifier.verifyBytes(proof)
  result.verifyMs = performance.now() - verifyStart; result.chromeRoundtrip = true
  const changed = JSON.parse(new TextDecoder().decode(proof))
  const pi = changed.public_inputs[0] as string
  changed.public_inputs[0] = (pi[0] === '0' ? '1' : '0') + pi.slice(1)
  let rejected = false
  try { verifier.verifyBytes(new TextEncoder().encode(JSON.stringify(changed))) } catch { rejected = true }
  required(rejected, 'changed public context accepted'); result.changedPublicInputRejected = true
  const tampered = JSON.parse(new TextDecoder().decode(proof))
  const transcript = tampered.whir_r1cs_proof.narg_string as string
  tampered.whir_r1cs_proof.narg_string = (transcript[0] === '0' ? '1' : '0') + transcript.slice(1)
  rejected = false
  try { verifier.verifyBytes(new TextEncoder().encode(JSON.stringify(tampered))) } catch { rejected = true }
  required(rejected, 'tampered transcript accepted'); result.tamperedTranscriptRejected = true
  result.totalMs = performance.now() - start; result.stage = 'done'; show()
}
main().catch(error => { result.stage = 'failed'; result.error = String(error); show() }).finally(async () => {
  await fetch('/result', { method: 'POST', body: JSON.stringify(result, null, 2) + '\n' })
})
