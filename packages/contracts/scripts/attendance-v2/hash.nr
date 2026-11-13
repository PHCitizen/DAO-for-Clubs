// Browser cross-runtime vector adapter for the exact proposed feed-forward mode.
fn main(d: Field, a: Field, b: Field) -> pub Field {
    poseidon2::bn254::permutation::t4([d, a, b, 0])[0] + d
}
