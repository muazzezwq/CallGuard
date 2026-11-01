# zk-execution fixtures — the two-handler guest over an unclaimed call

The three files here are the output of a GitHub Actions run of
`.github/workflows/zk-execution.yml` (`[prove]` in the commit message, artifact
`zk-execution-proof`): `seal.bin` (Groth16 seal, selector-prefixed), `journal.bin`
(160 bytes) and `image_id.txt`.

The program is the same two-handler guest as `test/fixtures/zk-execution-v2/`, so the
image id is identical. Only the claim moved: this proof is about
`0x041ab7c6…a366b`, a `COMPLETED` call that carries no `zk-execution` claim, which is
what makes it anchorable — the registry keeps one claim per `(callId, kind)` and the
call the previous fixture names already has one.

```
image id   0x2ba16114072357de21188f6ece592aee1783fd8ec6c30cfaf1548b0d3e2eac6c
journal    160 bytes, sha256 0x45f14970b03ecfddce90a17560f83d481ffa8d14166378875fad3473189f489c
seal       260 bytes, 391 s of proving
```

The journal is the five words `Risc0ExecutionAdapter` decodes:

| offset | field | value here |
|---|---|---|
| 0 | `callId` | `0x041ab7c6…a366b` |
| 32 | `requestHash` | `0xcd541a5f…b879c7` |
| 64 | `responseHash` | `0x188fcd5c…6e8d` |
| 96 | `handlerId` | `0xc60c6f3b…a84c7` = `keccak256("callguard.handler.ping/1")` |
| 128 | `claimHash` | `0xc1d4ae3c…cf72` |

The claim hash is `envelopeDigest` over the nine envelope fields for
`(callId 0x041a…, providerId 1, termsHash 0xbe8c8cd7…, responseHash 0x188fc…,
kind zk-execution, issuedAt 1793020800)`. It can be computed before the proof exists
because the digest does not cover the proof payload, so the journal can commit the same
value the anchor transaction will use.

Nothing here is a secret, and nothing here is reusable for a different call: the journal
is bound to one `callId`, and the adapter compares it with `PayPerCallV8.getCall(callId)`
before the verifier ever sees the seal. The build reproduces both the image id and the
journal digest, so a stale copy of this directory fails the pin in the workflow rather
than anchoring something else.
