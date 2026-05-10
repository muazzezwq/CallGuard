# ArcSLA v2 — EIP-712 Implementation Guide

*Step-by-step implementation plan for migrating ArcSLA receipts from EIP-191 to EIP-712 typed data signing. Modeled on Circle Research's [Refund Protocol](https://github.com/circlefin/refund-protocol) reference.*

**Status:** Implementation plan — branch `eip712-typed-signing` exists in repo, ready to start.
**Estimated effort:** 4-6 hours of focused work + 2-3 hours of testing.
**Author:** Onur Akdemir, May 2026

---

## Goal

Replace the current EIP-191 raw-bytes signing scheme with EIP-712 typed data, so that:

1. Signers see structured field-by-field receipt previews in their wallet (not hex blobs)
2. Receipts are domain-separated (no cross-chain or cross-deployment replay)
3. Replay protection is explicit via digest tracking
4. The implementation is auditable and follows industry-standard patterns

---

## Reference

The EIP-712 patterns used here are adapted directly from Circle Research's RefundProtocol contract:
- Source: `https://github.com/circlefin/refund-protocol/blob/master/src/RefundProtocol.sol`
- License: Apache 2.0
- Released: April 2025

Specifically, we mirror their use of OpenZeppelin's `EIP712` base contract, the typehash declaration pattern, and the `_hashTypedDataV4` / `ecrecover` verification flow.

---

## Current state (v1)

The current `PayPerCall.sol` uses EIP-191:

```solidity
// v1 receipt verification (current)
bytes32 digest = keccak256(abi.encodePacked(callId, responseHash))
    .toEthSignedMessageHash();
address signer = digest.recover(signature);
```

**Problems:**

1. Signer wallet displays hex characters interpreted as garbled text
2. No domain separation — same signature could (theoretically) be valid on another chain or contract that uses the same scheme
3. No standard typed-data preview in MetaMask

---

## Target state (v2)

New `PayPerCallV2.sol` will inherit from OpenZeppelin's `EIP712` and verify receipts via `_hashTypedDataV4`:

```solidity
// v2 receipt verification (target)
bytes32 digest = _hashReceipt(receipt);
address signer = ecrecover(digest, v, r, s);
```

Where `_hashReceipt` produces a properly domain-separated EIP-712 digest.

---

## Implementation steps

### Step 1 — Add OpenZeppelin EIP712 import

Update imports in `PayPerCall.sol`:

```solidity
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
```

`ECDSA.sol` is already imported in v1; verify it's there. If not, add it.

### Step 2 — Inherit from EIP712

Change the contract declaration:

```solidity
// before
contract PayPerCall {
    using ECDSA for bytes32;
    ...
}

// after
contract PayPerCall is EIP712 {
    using ECDSA for bytes32;
    ...
}
```

### Step 3 — Initialize EIP712 in constructor

Modify the constructor to call `EIP712(name, version)`:

```solidity
// before
constructor(IServiceRegistry _registry, IERC20 _usdc) {
    registry = _registry;
    usdc = _usdc;
}

// after
constructor(IServiceRegistry _registry, IERC20 _usdc)
    EIP712("ArcSLA", "1")
{
    registry = _registry;
    usdc = _usdc;
}
```

The domain becomes:
- name: `"ArcSLA"`
- version: `"1"`
- chainId: `block.chainid` (handled by OpenZeppelin automatically)
- verifyingContract: `address(this)` (handled by OpenZeppelin automatically)

### Step 4 — Declare the Receipt typehash and struct

Add near the top of the contract:

```solidity
// EIP-712 typehash for the Receipt struct
bytes32 public constant RECEIPT_TYPEHASH = keccak256(
    "Receipt(address caller,bytes32 callId,bytes32 serviceId,uint256 deadline,uint256 paid,uint256 slashAmount)"
);

struct Receipt {
    address caller;
    bytes32 callId;
    bytes32 serviceId;
    uint256 deadline;
    uint256 paid;
    uint256 slashAmount;
}
```

**Critical:** The string passed to `keccak256` must exactly match the EIP-712 type encoding spec — no spaces between fields, fields separated by commas, struct name and parentheses included.

Reference for field ordering: must match the order the wallet will display fields. Keep `caller` first (most user-relevant), `callId` and `serviceId` next (identifiers), then payment/timing fields.

### Step 5 — Add replay protection mapping

```solidity
// Tracks used receipt digests to prevent replay
mapping(bytes32 => bool) public usedReceipts;

error ReceiptAlreadyUsed();
```

### Step 6 — Implement `_hashReceipt`

Internal helper that produces the EIP-712 digest:

```solidity
function _hashReceipt(Receipt memory receipt) internal view returns (bytes32) {
    bytes32 structHash = keccak256(abi.encode(
        RECEIPT_TYPEHASH,
        receipt.caller,
        receipt.callId,
        receipt.serviceId,
        receipt.deadline,
        receipt.paid,
        receipt.slashAmount
    ));
    return _hashTypedDataV4(structHash);
}
```

`_hashTypedDataV4` is inherited from OpenZeppelin's EIP712 contract. It prepends the domain separator and returns the final digest.

### Step 7 — Modify `submitReceipt` to use EIP-712

Replace the existing signature verification logic:

```solidity
function submitReceipt(
    Receipt calldata receipt,
    bytes32 responseHash,
    uint8 v,
    bytes32 r,
    bytes32 s
) external {
    // 1. Compute digest
    bytes32 digest = _hashReceipt(receipt);

    // 2. Replay protection
    if (usedReceipts[digest]) revert ReceiptAlreadyUsed();
    usedReceipts[digest] = true;

    // 3. Recover signer
    address signer = ecrecover(digest, v, r, s);

    // 4. Verify signer matches provider's registered hot signing key
    // (existing v1 logic — lookup provider by callId, check signer)
    bytes32 callId = receipt.callId;
    Call storage call = calls[callId];

    // ... existing v1 logic for call lookup, deadline check,
    // escrow release, reputation update ...

    address expectedSigner = registry.getProviderSigner(call.serviceId);
    if (signer != expectedSigner) revert InvalidSignature();

    // ... rest of existing v1 logic ...
}
```

**Important:** The full signature flow stays mostly the same. Only the digest computation changes. All existing logic around call lookup, deadline check, escrow release, and reputation update stays intact.

### Step 8 — Add `hashReceipt` external view (for frontend)

The frontend needs to compute the digest off-chain to construct the signature request. Expose a public view:

```solidity
function hashReceipt(Receipt calldata receipt) external view returns (bytes32) {
    return _hashReceipt(receipt);
}
```

Optionally, also expose the domain separator (useful for debugging and integration):

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
}
```

### Step 9 — Update frontend signing flow

In `demo/index.html` (or whatever the frontend file is), replace the v1 signing call:

```javascript
// before (v1, EIP-191)
const digest = ethers.solidityPackedKeccak256(
    ['bytes32', 'bytes32'],
    [callId, responseHash]
);
const signature = await signer.signMessage(ethers.getBytes(digest));

// after (v2, EIP-712)
const domain = {
    name: "ArcSLA",
    version: "1",
    chainId: 5042002, // Arc Testnet
    verifyingContract: payPerCallAddress
};

const types = {
    Receipt: [
        { name: "caller", type: "address" },
        { name: "callId", type: "bytes32" },
        { name: "serviceId", type: "bytes32" },
        { name: "deadline", type: "uint256" },
        { name: "paid", type: "uint256" },
        { name: "slashAmount", type: "uint256" }
    ]
};

const receipt = {
    caller: callerAddress,
    callId: callId,
    serviceId: serviceId,
    deadline: deadline,
    paid: paid,
    slashAmount: slashAmount
};

const signature = await signer.signTypedData(domain, types, receipt);
// signature is a hex string; need to split into v, r, s for the contract
const sig = ethers.Signature.from(signature);
// then call:
//   await payPerCall.submitReceipt(receipt, responseHash, sig.v, sig.r, sig.s);
```

### Step 10 — Update tests

The existing `PayPerCall.t.sol` has 21 tests. Most will need minor updates to use the new signing scheme. Key new tests to add:

```solidity
function test_EIP712_DomainSeparatorMatches() public {
    bytes32 expected = keccak256(abi.encode(
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256("ArcSLA"),
        keccak256("1"),
        block.chainid,
        address(payPerCall)
    ));
    assertEq(payPerCall.DOMAIN_SEPARATOR(), expected);
}

function test_SubmitReceipt_RevertsOnReplay() public {
    // ... setup ...
    payPerCall.submitReceipt(receipt, responseHash, v, r, s);
    vm.expectRevert(ReceiptAlreadyUsed.selector);
    payPerCall.submitReceipt(receipt, responseHash, v, r, s);
}

function test_SubmitReceipt_RevertsOnWrongSigner() public {
    // Sign with a different key, verify rejected
}

function test_SubmitReceipt_RevertsOnTamperedReceipt() public {
    // Sign one receipt, submit with modified fields
}

function test_HashReceipt_MatchesExpected() public {
    // Verify the on-chain hash matches the expected EIP-712 digest
}
```

Run with `forge test -vv` and expect all v1 tests to still pass after migration.

---

## Migration considerations

### Breaking change

This is a **breaking change** — receipts signed under v1 cannot be submitted to v2 contracts. Any provider integrating with ArcSLA must update their signing code.

Plan:
- Deploy v2 contracts to new addresses (do not upgrade in place)
- Keep v1 contracts running for 30+ days as deprecation window
- Update frontend and documentation to point to v2
- Notify existing 9 providers via Discord / X / email

### USDC decimals

Arc Testnet USDC uses 18 decimals. All amounts in the Receipt struct (`paid`, `slashAmount`) are in the token's smallest unit, so 1 USDC = `10^18` units.

The frontend should fetch `decimals()` at runtime and adjust display accordingly, but the contract sees raw integer amounts and doesn't care.

### Gas impact

EIP-712 verification is slightly more gas-expensive than EIP-191 due to the extra hash step. Rough estimate based on similar implementations: +5-8k gas per receipt. On Arc, with USDC-denominated gas, this is fractional cents — negligible for the use case.

### Backwards compatibility

ServiceRegistry stays unchanged. Providers don't need to re-register. Their hot signing keys, reputation scores, and stakes carry over. Only the receipt signing flow changes.

---

## Testing checklist

Before merging the EIP-712 branch:

- [ ] All v1 tests updated to use new signing scheme
- [ ] All v1 tests pass (`forge test -vv` shows 57+ passing)
- [ ] New EIP-712-specific tests added and passing (domain separator, replay, wrong signer, tampered receipt)
- [ ] Gas comparison documented (v1 vs v2 per-receipt cost)
- [ ] Frontend signTypedData flow tested in MetaMask — verify wallet shows readable Receipt preview
- [ ] Edge case: signer with rotated hot key still produces valid receipts (cold key rotation logic from v1 must still work)
- [ ] Documentation updated (README, ARCHITECTURE.md, SPEC.md)

---

## Deployment plan

After tests pass and code is merged to `master`:

1. **Compile and verify:** `forge build`
2. **Deploy to Arc Testnet:** Use existing `Deploy.s.sol` script with new contract names
3. **Verify on Arcscan:** Submit source code via Foundry's `forge verify-contract` or Arcscan's UI
4. **Update demo frontend:** Point to new contract addresses
5. **Announcement:** Tweet thread, Discord post, GitHub release notes
6. **Migration window:** 30 days, both v1 and v2 live, providers gradually update

---

## Open implementation questions

1. **Receipt struct fields:** Are all six fields (`caller`, `callId`, `serviceId`, `deadline`, `paid`, `slashAmount`) necessary? Could simplify to four if `paid` and `slashAmount` derive from `serviceId` lookup. Trade-off: simpler signature vs. self-contained receipts.

2. **`responseHash` parameter:** Should it be inside the Receipt struct (signed) or passed separately? Current sketch keeps it separate. Including it in the signature would be stricter but adds storage cost.

3. **Replay protection scope:** Should `usedReceipts` use the digest or the `callId`? Using `callId` is cheaper (already tracked) but requires care to avoid blocking legitimate retries.

4. **Whether to support EIP-1271:** Adding `SignatureChecker.isValidSignatureNow` would enable contract-account providers (relevant for agent wallets). Adds gas but unlocks important use cases.

---

## Resources

1. [OpenZeppelin EIP712.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/EIP712.sol)
2. [EIP-712 spec](https://eips.ethereum.org/EIPS/eip-712)
3. [Circle's RefundProtocol.sol](https://github.com/circlefin/refund-protocol/blob/master/src/RefundProtocol.sol) — reference implementation
4. [ethers.js v6 signTypedData](https://docs.ethers.org/v6/api/providers/#Signer-signTypedData)
5. [Foundry testing patterns](https://book.getfoundry.sh/forge/cheatcodes)

---

## Next steps

1. Switch to `eip712-typed-signing` branch (already exists in repo)
2. Implement Steps 1-7 (contract changes)
3. Run `forge test` continuously, fix breakage as it appears
4. Implement Step 8-9 (frontend integration) once contracts compile
5. Add Step 10 tests
6. Open PR, self-review, merge
7. Deploy and announce

Estimated total time: **6-9 hours of focused work**, ideally split into 2-3 sessions.

---

*ArcSLA v2 EIP-712 Implementation Guide. Last updated: May 2026.*

*— Onur Akdemir | [arcsla.vercel.app](https://arcsla.vercel.app) | [github.com/muazzezwq/arcsla](https://github.com/muazzezwq/arcsla)*
