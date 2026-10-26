// Copyright 2026 CallGuard
//
// Proves the guest from `methods/guest` and writes the three artifacts the on-chain
// verification needs: the seal, the journal, and the image id.
//
// It refuses to run in dev mode unless `--dev` is passed, and it says so in every
// artifact it writes. A dev-mode receipt is not a proof: its seal is four `0xff` bytes
// and a claim digest, which the Groth16 verifier rejects. Letting one escape would be
// the worst possible outcome for this repository — a green row that proves nothing.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use risc0_zkvm::{default_prover, ExecutorEnv, InnerReceipt, ProverOpts, VerifierContext};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use zk_execution_methods::{PING_ELF, PING_ID};

/// The private input, as JSON on disk.
#[derive(Deserialize)]
struct InputFile {
    call_id: String,
    request: String,
}

/// What the guest reads. Field order matters: it is the read order.
#[derive(Serialize)]
struct GuestInput {
    call_id: [u8; 32],
    request: Vec<u8>,
}

struct Args {
    input: PathBuf,
    out: PathBuf,
    dev: bool,
    assert_journal: Option<String>,
}

fn parse_args() -> Result<Args> {
    let mut input = None;
    let mut out = None;
    let mut dev = false;
    let mut assert_journal = None;

    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--out" => {
                i += 1;
                out = Some(PathBuf::from(args.get(i).context("--out needs a directory")?));
            }
            "--dev" => dev = true,
            "--assert-journal" => {
                i += 1;
                assert_journal = Some(args.get(i).context("--assert-journal needs a hex value")?.clone());
            }
            other => input = Some(PathBuf::from(other)),
        }
        i += 1;
    }

    Ok(Args {
        input: input.context("usage: zk-execution-host <input.json> --out <dir> [--dev] [--assert-journal 0x..]")?,
        out: out.context("--out is required")?,
        dev,
        assert_journal,
    })
}

/// Dev mode is decided by the environment, not by us, so check both directions: a dev
/// run without `--dev` is a mistake, and `--dev` without the environment variable is a
/// request that cannot be honoured.
fn check_dev_mode(dev_flag: bool) -> Result<bool> {
    let value = std::env::var("RISC0_DEV_MODE").ok();
    let env_dev = matches!(value.as_deref(), Some("1") | Some("true"));
    if dev_flag && !env_dev {
        bail!("--dev was passed but RISC0_DEV_MODE is not 1; refusing to guess what you meant");
    }
    if !dev_flag && env_dev {
        bail!("RISC0_DEV_MODE is set but --dev was not passed; a dev-mode receipt is not a proof");
    }
    Ok(env_dev)
}

fn image_id_hex() -> String {
    // A RISC Zero digest is eight words whose bytes are little-endian. Formatting the words
    // big-endian produces a hash that looks right and commits to nothing: the claim digest built
    // from it is not the one the proof proved, so the pairing check fails on chain with no hint
    // about why. Go through `Digest` so the layout is the library's, not ours.
    let digest = risc0_zkvm::Digest::from(PING_ID);
    format!("0x{}", hex::encode(digest.as_bytes()))
}

/// The seal the Solidity verifier expects: four selector bytes derived from the receipt's
/// verifier parameters, then the Groth16 proof. This is `risc0_ethereum_contracts::encode_seal`
/// written out, because depending on that crate drags in `alloy` and its AVX-era MSRV.
fn encode_seal(receipt: &risc0_zkvm::Receipt) -> Result<Vec<u8>> {
    let InnerReceipt::Groth16(groth16) = &receipt.inner else {
        bail!("receipt is not Groth16; a dev or composite receipt would fail on chain");
    };
    let mut seal = Vec::with_capacity(4 + groth16.seal.len());
    seal.extend_from_slice(&groth16.verifier_parameters.as_bytes()[..4]);
    seal.extend_from_slice(groth16.seal.as_ref());
    Ok(seal)
}

fn main() -> Result<()> {
    let args = parse_args()?;
    let dev = check_dev_mode(args.dev)?;

    let raw = fs::read_to_string(&args.input)
        .with_context(|| format!("reading {}", args.input.display()))?;
    let input: InputFile = serde_json::from_str(&raw)?;
    let guest_input = GuestInput {
        call_id: hex::decode(input.call_id.trim_start_matches("0x"))?
            .try_into()
            .map_err(|_| anyhow::anyhow!("call_id must be 32 bytes"))?,
        request: hex::decode(input.request.trim_start_matches("0x"))?,
    };

    let env = ExecutorEnv::builder().write(&guest_input)?.build()?;
    let ctx = VerifierContext::default();
    let receipt = default_prover()
        .prove_with_ctx(env, &ctx, PING_ELF, &ProverOpts::groth16())?
        .receipt;

    // Local check first: a receipt that does not verify here would not verify on chain.
    // `verify` only checks the claim against the image id; `verify_integrity` runs the seal, so a
    // receipt whose proof does not attest to that claim is caught before it is written. A dev-mode
    // receipt has no seal to run, so there is nothing to check there.
    receipt.verify(PING_ID)?;
    if !dev {
        receipt
            .verify_integrity()
            .context("the seal does not attest to the receipt's own claim")?;
    }

    let image_id = image_id_hex();
    let journal = receipt.journal.bytes.clone();
    // A dev-mode receipt is `InnerReceipt::Fake`, which has no seal to encode. Writing an
    // empty seal is the honest artifact: the journal is real, the proof does not exist.
    let seal = if dev { Vec::new() } else { encode_seal(&receipt)? };
    let journal_hex = format!("0x{}", hex::encode(&journal));
    let journal_digest = format!("0x{}", hex::encode(Sha256::digest(&journal)));

    if let Some(expected) = &args.assert_journal {
        if expected.to_lowercase() != journal_hex {
            bail!("journal mismatch\n  expected {expected}\n  actual   {journal_hex}");
        }
    }

    let out = args.out;
    fs::create_dir_all(&out)?;
    fs::write(out.join("seal.bin"), &seal)?;
    fs::write(out.join("journal.bin"), &journal)?;
    fs::write(out.join("image_id.txt"), format!("{image_id}\n"))?;
    fs::write(
        out.join("receipt.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "imageId": image_id,
            "journal": journal_hex,
            "journalDigest": journal_digest,
            "sealBytes": seal.len(),
            "devMode": dev,
        }))?,
    )?;

    if dev {
        println!("WARNING dev-mode receipt — not a proof, selector is 0xffffffff");
    }
    println!("imageId={image_id}");
    println!("journal={journal_hex}");
    println!("journalDigest={journal_digest}");
    println!("sealBytes={}", seal.len());
    println!("devMode={dev}");
    println!("out={}", Path::new(&out).display());
    Ok(())
}
