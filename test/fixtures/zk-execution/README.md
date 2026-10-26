# zk-execution fixtures

The three files here are the output of a GitHub Actions run of
`.github/workflows/zk-execution.yml` (`mode=groth16`, artifact `zk-execution-proof`):
`seal.bin` (Groth16 seal, selector-prefixed), `journal.bin` (128 bytes) and
`image_id.txt`.

They are committed because the repository has to be able to show *which* proof it
anchored: the seal is what `Risc0ExecutionAdapter` forwards to the Groth16 verifier, and
the journal is the exact `abi.encode(callId, requestHash, responseHash, handlerId)` the
claim is about. Regenerate the panel fixture and the claim hash from them with:

```bash
bun scripts/zk-execution-proof.ts --write
```

The script refuses to run when the journal does not name the call, the response or the
handler this repository publishes — a fixture about something else is not a fixture.

Nothing here is a secret, and nothing here can be reused for a different call: the
journal is bound to one `callId`, and the adapter compares it with
`PayPerCallV8.getCall(callId)` before the verifier ever sees the seal.
