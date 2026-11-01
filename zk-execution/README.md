# zk-execution

The one execution claim this repository can prove: for the call named in `input.json`,
the committed `responseHash` is the output of the guest program in `methods/guest` run
on a request whose keccak256 is the call's committed `requestHash`.

## What the proof says, and what it does not

It says: a program with image id `<image id>` ran, read a private request, a private claim
digest and a handler number, ran only that handler, and committed a journal naming this call,
this request hash, this response hash, the handler id of the handler it ran, and the digest of
the envelope that describes the claim. That last word is what makes the seal cover the
description, so the same proof cannot be re-anchored under a different statement.

### Handlers

The guest dispatches on the `handler` field of the input. A proof commits the id of the handler
it ran, and `Risc0ExecutionAdapter` pins one handler id, so one adapter proves one handler.

| `handler` | Id source | Behaviour |
|---|---|---|
| `0` (default) | `callguard.handler.ping/1` | request must be `ping`; response is `pong` |
| `1` | `callguard.handler.keccak-echo/1` | response is `keccak256(request)`; any request |

An input file with no `handler` field means `0`, so files written before the dispatch existed
still prove the journal they proved then.

A handler is not a model. Neither handler shows that a service answered well: `ping` binds two
fixed strings, `keccak-echo` binds an arbitrary request to a digest of it. Both are honest about
being the minimum that can be proved, and neither says the response is *correct*.

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

`abi.encode(bytes32 callId, bytes32 requestHash, bytes32 responseHash, bytes32 handlerId, bytes32 claimHash)`,
160 bytes. `Risc0ExecutionAdapter` in this tree requires exactly that length and compares every
field, including `claimHash` against the claim the registry asks it to verify — that is what
stops a valid proof from being re-anchored under a different statement.

`claim_hash` is private input, so the journal is where it becomes public.

**Legacy length.** The guest before this one committed four words (128 bytes). The adapter
deployed on Arc Testnet at `0xD804F2E0…1a21` accepts only that, and the artifacts in
`test/fixtures/zk-execution/` are from it. A fresh proof needs the new guest (new image id) and a
new adapter; until then the source and the chain disagree by design, and the deployed claim stays
readable because each claim records the adapter that vouched for it.

Known values for the target call:

- `requestHash` `0xcd541a5f22d1f8d9c088efa3474acd3d04f58894b42e4ffb4bc0dbb4c0b879c7` = `keccak256("ping")`
- `responseHash` `0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d` = `keccak256("pong")`
- `claimHash` `0xe3baff68e7c0299a4275cc3e7553fb27da16d1929fa47a5fe04ab7b58b9f419c` = the anchored envelope's digest
- image id, journal hex and proving wall time: recorded after the first real run.
