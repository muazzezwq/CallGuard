// Copyright 2026 CallGuard
//
// The one program whose execution this repository can prove.
//
// It is deliberately tiny: a named handler, one hash, one commit. A larger guest would
// prove more and cost more, and the claim this repository makes is only "the committed
// response is what this program produces from the committed request".
//
// The program runs more than one handler, but only one per proof: the handler number in
// the input selects both the code path and the id committed into the journal, so a proof
// for `ping/1` says nothing about `keccak-echo/1`. `Risc0ExecutionAdapter` pins one
// handler id, so each handler gets its own adapter.

#![no_main]
#![no_std]

extern crate alloc;

use alloc::vec::Vec;
use risc0_zkvm::guest::env;
use sha3::{Digest, Keccak256};

risc0_zkvm::guest::entry!(main);

/// Wire value of `callguard.handler.ping/1`: the request must be the literal `ping` and
/// the response is the literal `pong`.
const HANDLER_PING: u8 = 0;

/// Wire value of `callguard.handler.keccak-echo/1`: the response is the Keccak-256 digest
/// of the request. Unlike `ping`, this handler reads the whole request, so a proof over it
/// binds arbitrary input rather than two fixed strings.
const HANDLER_KECCAK_ECHO: u8 = 1;

/// Private input. The call id travels as its own field so the request bytes can never
/// smuggle a different binding into the journal. `claim_hash` is the digest of the
/// off-chain envelope (statement + assumptions): committing it here is what stops a
/// valid proof from being re-anchored under a different description.
///
/// Field order is the read order; the host writes these fields in this order.
#[derive(serde::Deserialize)]
struct Input {
    call_id: [u8; 32],
    claim_hash: [u8; 32],
    handler: u8,
    request: Vec<u8>,
}

/// The bytes the handler id commits to. Two deployments that run the same code under
/// different names therefore produce different handler ids, which is the point.
fn handler_id_source(handler: u8) -> &'static [u8] {
    match handler {
        HANDLER_PING => b"callguard.handler.ping/1",
        HANDLER_KECCAK_ECHO => b"callguard.handler.keccak-echo/1",
        _ => panic!("unknown handler"),
    }
}

fn run(handler: u8, request: &[u8]) -> Vec<u8> {
    match handler {
        HANDLER_PING => {
            // Anything other than "ping" panics, so no other body can be proven for
            // this handler — refusal is part of the claim, not an error path.
            if request != b"ping" {
                panic!("callguard.handler.ping/1: unexpected request");
            }
            b"pong".to_vec()
        }
        HANDLER_KECCAK_ECHO => Keccak256::digest(request).to_vec(),
        _ => panic!("unknown handler"),
    }
}

fn main() {
    let input: Input = env::read();

    let body = run(input.handler, &input.request);

    let request_hash: [u8; 32] = Keccak256::digest(&input.request).into();
    let response_hash: [u8; 32] = Keccak256::digest(&body).into();
    let handler_id: [u8; 32] = Keccak256::digest(handler_id_source(input.handler)).into();

    // `abi.encode(bytes32,bytes32,bytes32,bytes32,bytes32)` — 160 bytes, the exact
    // layout `Risc0ExecutionAdapter` decodes. Written by hand because the guest has
    // no ABI encoder and this layout has no ambiguity to resolve.
    let mut journal = [0u8; 160];
    journal[0..32].copy_from_slice(&input.call_id);
    journal[32..64].copy_from_slice(&request_hash);
    journal[64..96].copy_from_slice(&response_hash);
    journal[96..128].copy_from_slice(&handler_id);
    journal[128..160].copy_from_slice(&input.claim_hash);

    env::commit_slice(&journal);
}
