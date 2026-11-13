// Evaluation-only membership relation. Public context/count/root are authenticated
// by the verifier's chain reads, never accepted from an untrusted proof alone.
mod vectors;

fn hash(domain: Field, a: Field, b: Field) -> Field {
    poseidon2::bn254::permutation::t4([domain, a, b, 0])[0] + domain
}

fn main(ctx: pub Field, count: pub u32, root: pub Field,
        secret: Field, index: u32, siblings: [Field; 10]) {
    assert(count > 0);
    assert(count <= 1024);
    assert(index < count);
    let entry = hash(2, ctx, secret);
    let mut node = hash(3, ctx, entry);
    for level in 0..10 {
        let right = ((index >> level) & 1) == 1;
        let left = if right { siblings[level] } else { node };
        let other = if right { node } else { siblings[level] };
        node = hash(16 + level as Field, left, other);
    }
    assert(hash(6, ctx, hash(7, count as Field, node)) == root);
}
