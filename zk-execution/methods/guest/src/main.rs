// Copyright 2026 CallGuard
//
// The one program whose execution this repository can prove.
//
// It is deliberately tiny: a named handler, one hash, one commit. A larger guest would
// prove more and cost more, and the claim this repository makes is only "the committed
// response is what this program produces from the committed request".

#![no_main]
#![no_std]

extern crate alloc;

use alloc::vec::Vec;
use risc0_zkvm::guest::env;
use sha3::{Digest, Keccak256};

risc0_zkvm::guest::entry!(main);

/// Private input. The call id travels as its own field so the request bytes can never
/// smuggle a different binding into the journal.
#[derive(serde::Deserialize)]
struct Input {
    call_id: [u8; 32],
    request: Vec<u8>,
}

const HANDLER_ID_SOURCE: &[u8] = b"callguard.handler.ping/1";

fn main() {
    let input: Input = env::read();

    // The handler. Anything other than "ping" panics, so no other body can be proven
    // for this image — refusal is part of the claim, not an error path.
    if input.request != b"ping" {
        panic!("callguard.handler.ping/1: unexpected request");
    }
    let body: &[u8] = b"pong";

    let request_hash: [u8; 32] = Keccak256::digest(&input.request).into();
    let response_hash: [u8; 32] = Keccak256::digest(body).into();
    let handler_id: [u8; 32] = Keccak256::digest(HANDLER_ID_SOURCE).into();

    // `abi.encode(bytes32,bytes32,bytes32,bytes32)` — 128 bytes, the exact layout
    // `Risc0ExecutionAdapter` decodes. Written by hand because the guest has no ABI
    // encoder and this layout has no ambiguity to resolve.
    let mut journal = [0u8; 128];
    journal[0..32].copy_from_slice(&input.call_id);
    journal[32..64].copy_from_slice(&request_hash);
    journal[64..96].copy_from_slice(&response_hash);
    journal[96..128].copy_from_slice(&handler_id);

    env::commit_slice(&journal);
}
