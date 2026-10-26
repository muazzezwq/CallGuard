# zk-execution

The one execution claim this repository can prove: for the call named in `input.json`,
the committed `responseHash` is the output of the guest program in `methods/guest` run
on a request whose keccak256 is the call's committed `requestHash`.

## What the proof says, and what it does not

It says: a program with image id `<image id>` ran, read a private request, refused
everything except `ping`, and committed a journal naming this call, this request hash,
this response hash, and the handler `keccak256("callguard.handler.ping/1")`.

It does not say the answer is *correct*, useful, or that it matches the outside world.
It also does not say which machine ran it — that is the point of a zkVM, and why this
replaces the TEE route instead of complementing it.

## Why CI and not this machine

The Groth16 prover is x86-only. GitHub Actions `ubuntu-latest` is x86_64, and this
repository is public, so standard runners cost nothing. `.github/workflows/zk-execution.yml`
runs it.

```bash
# journal-only self-check; no proof, no artifact
gh workflow run zk-execution.yml -f mode=dev

# the real thing: Groth16 receipt, uploaded as an artifact
gh workflow run zk-execution.yml -f mode=groth16
```

## Running the host locally (x86_64 only)

```bash
cargo run --release -- input.json --out out
# dev mode: validates journal encoding only
RISC0_DEV_MODE=1 cargo run --release -- input.json --out /tmp/dev --dev
```

The host refuses to run when `RISC0_DEV_MODE` and `--dev` disagree, and every artifact
carries `"devMode"` so a dev receipt can never be mistaken for a proof.

## Pins

One set, or the verifier rejects the seal:

| Piece | Version |
|---|---|
| Rust toolchain (host) | `1.91.0` (`rust-toolchain.toml`) |
| Rust toolchain (guest) | `1.88.0`, installed by `rzup install rust` — `risc0-build` overrides `RUSTC` for guests |
| `risc0-zkvm`, `risc0-build`, `r0vm`, `cargo-risczero` | `3.0.6` |
| `risc0-ethereum-contracts` (host) | `3.0.1` |
| `RiscZeroGroth16Verifier` (chain) | vendored `risc0-ethereum` `v3.0.1` |

## Journal layout

`abi.encode(bytes32 callId, bytes32 requestHash, bytes32 responseHash, bytes32 handlerId)`,
128 bytes. `Risc0ExecutionAdapter` requires exactly that length and compares every field.

Known values for the target call:

- `requestHash` `0xcd541a5f22d1f8d9c088efa3474acd3d04f58894b42e4ffb4bc0dbb4c0b879c7` = `keccak256("ping")`
- `responseHash` `0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d` = `keccak256("pong")`
- image id, journal hex and proving wall time: recorded after the first real run.
