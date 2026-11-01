# zk-execution fixtures — two-handler guest

The three files here are the output of a GitHub Actions run of
`.github/workflows/zk-execution.yml` (`[prove]` in the commit message, artifact
`zk-execution-proof`): `seal.bin` (Groth16 seal, selector-prefixed), `journal.bin`
(160 bytes) and `image_id.txt`.

They are separate from `test/fixtures/zk-execution/` because this is a **different
program**, not a different call. The guest gained a handler dispatch, so it has its own
image id — and `Risc0ExecutionAdapter` pins the image id as immutable, which means a
proof from this guest verifies only on a new adapter:

```
image id   0x2ba16114072357de21188f6ece592aee1783fd8ec6c30cfaf1548b0d3e2eac6c
journal    160 bytes, sha256 0xb6ea536433e00d36a768509bb0280770304007916f2659457af8da8a6e09d45b
seal       260 bytes, 268 s of proving
```

The journal is the five words `Risc0ExecutionAdapter` decodes:

| offset | field | value here |
|---|---|---|
| 0 | `callId` | `0xf68c0c62…feb488` |
| 32 | `requestHash` | `0xcd541a5f…b879c7` |
| 64 | `responseHash` | `0x188fcd5c…6e8d` |
| 96 | `handlerId` | `0xc60c6f3b…a84c7` = `keccak256("callguard.handler.ping/1")` |
| 128 | `claimHash` | `0xe3baff68…f419c` |

Handler `0` is the program the earlier fixtures already proved, so the request and the
response match them byte for byte; only the call id and the new claim word moved. That is
what `test/Risc0Receipt.t.sol` asserts: the same seal verifies against this image id, and
it is rejected against any other.

Nothing here is a secret, and nothing here is reusable for a different call: the journal
is bound to one `callId`, and the adapter compares it with `PayPerCallV8.getCall(callId)`
before the verifier ever sees the seal. The build reproduces both the image id and the
journal digest, so a stale copy of this directory fails the pin in the workflow rather
than anchoring something else.
