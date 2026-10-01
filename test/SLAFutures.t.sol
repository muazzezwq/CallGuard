// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { SLAFutures } from "../src/SLAFutures.sol";
import { IServiceRegistry } from "../src/interfaces/IServiceRegistry.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// MockRegistry — minimal IServiceRegistry for unit tests
// ---------------------------------------------------------------------------
contract MockRegistry is IServiceRegistry {
    struct Entry {
        address owner;
        bool active;
    }

    mapping(uint256 => Entry) internal _entries;
    uint256 public nextId = 1;

    /// @notice Register a provider and return its ID.
    function register(address owner, bool active) external returns (uint256 id) {
        id = nextId++;
        _entries[id] = Entry({ owner: owner, active: active });
    }

    /// @notice Toggle a provider's active flag.
    function setActive(uint256 id, bool active) external {
        _entries[id].active = active;
    }

    // --- IServiceRegistry ---

    function getProvider(uint256 providerId) external view override returns (IServiceRegistry.ProviderView memory) {
        Entry storage e = _entries[providerId];
        return IServiceRegistry.ProviderView({
            owner: e.owner,
            signer: e.owner,
            stake: 0,
            pricePerCall: 0,
            maxResponseTime: 0,
            slashBps: 0,
            active: e.active
        });
    }

    function slash(uint256, uint256, address) external override {}
    function markCallStarted(uint256) external override {}
    function markCallFinished(uint256) external override {}
    function incCompleted(uint256) external override {}
    function incSlashed(uint256) external override {}
}

// ---------------------------------------------------------------------------
// ERC-1155 receiver helper so the contract-under-test can transfer to it
// ---------------------------------------------------------------------------
contract Receiver is IERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract SLAFuturesTest is Test {
    MockUSDC internal usdc;
    MockRegistry internal registry;
    SLAFutures internal sla;

    address internal admin = makeAddr("admin");
    address internal provider = makeAddr("provider");
    address internal buyer = makeAddr("buyer");
    address internal alice = makeAddr("alice");

    uint256 internal providerId;

    // Default batch params
    uint256 internal constant PRICE = 5_000; // 0.005 USDC (above MIN_PRICE_PER_CALL=1_000)
    uint256 internal constant SLOTS = 10;
    uint64 internal constant DURATION = 7 days;

    // ---------------------------------------------------------------------------
    // setUp — runs before every test
    // ---------------------------------------------------------------------------
    function setUp() public {
        usdc = new MockUSDC();
        registry = new MockRegistry();

        vm.prank(admin);
        sla = new SLAFutures(address(usdc), address(registry), admin, "https://sla.example");

        // SLAFutures mints inventory to itself (address(this) inside the contract).
        // OZ ERC-1155 v5 calls onERC1155Received on any contract recipient, but
        // SLAFutures does not implement IERC1155Receiver.  Stub the call so the
        // acceptance check passes without modifying the contract under test.
        bytes4 receiverSelector = bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
        vm.mockCall(
            address(sla),
            abi.encodeWithSelector(receiverSelector),
            abi.encode(receiverSelector)
        );

        // Register a provider in the mock registry
        providerId = registry.register(provider, true);

        // Fund actors and set approvals
        usdc.mint(buyer, 100_000e6);
        usdc.mint(alice, 100_000e6);
        usdc.mint(provider, 100_000e6);

        vm.prank(buyer);
        usdc.approve(address(sla), type(uint256).max);

        vm.prank(alice);
        usdc.approve(address(sla), type(uint256).max);

        // Provider approves sla for the cancelBatch refund pull
        vm.prank(provider);
        usdc.approve(address(sla), type(uint256).max);
    }

    // ---------------------------------------------------------------------------
    // Helper: mint a default batch as `provider`
    // ---------------------------------------------------------------------------
    function _mintBatch() internal returns (uint256 batchId) {
        vm.prank(provider);
        batchId = sla.mintCapacity(providerId, PRICE, SLOTS, uint64(block.timestamp + DURATION));
    }

    // ---------------------------------------------------------------------------
    // 1. mintCapacity
    // ---------------------------------------------------------------------------

    function test_mintCapacity_success() public {
        uint64 deadline = uint64(block.timestamp + DURATION);

        vm.expectEmit(true, true, false, true, address(sla));
        emit SLAFutures.BatchMinted(1, providerId, PRICE, SLOTS, deadline);

        vm.prank(provider);
        uint256 batchId = sla.mintCapacity(providerId, PRICE, SLOTS, deadline);

        assertEq(batchId, 1, "batchId should be 1");
        assertEq(sla.nextBatchId(), 2, "nextBatchId incremented");

        (
            uint256 pId,
            uint256 pricePerCall,
            uint256 totalSlots,
            uint256 soldSlots,
            uint256 usedSlots,
            uint64 dl,
            bool active,
            address prov
        ) = sla.batches(batchId);

        assertEq(pId, providerId);
        assertEq(pricePerCall, PRICE);
        assertEq(totalSlots, SLOTS);
        assertEq(soldSlots, 0);
        assertEq(usedSlots, 0);
        assertEq(dl, deadline);
        assertTrue(active);
        assertEq(prov, provider);

        // Contract holds the minted tokens
        // On-demand mint: no inventory held by contract, slots minted to buyers at purchase
        assertEq(sla.balanceOf(address(sla), batchId), 0);
    }

    function test_mintCapacity_notRegistered_reverts() public {
        // Provider ID 999 doesn't exist in the mock registry (owner == address(0))
        vm.prank(provider);
        vm.expectRevert(SLAFutures.InvalidProvider.selector);
        sla.mintCapacity(999, PRICE, SLOTS, uint64(block.timestamp + DURATION));
    }

    function test_mintCapacity_inactiveProvider_reverts() public {
        registry.setActive(providerId, false);

        vm.prank(provider);
        vm.expectRevert(SLAFutures.InvalidProvider.selector);
        sla.mintCapacity(providerId, PRICE, SLOTS, uint64(block.timestamp + DURATION));
    }

    function test_mintCapacity_notOwner_reverts() public {
        // `buyer` is not the registered owner of `providerId`
        vm.prank(buyer);
        vm.expectRevert(SLAFutures.NotProviderOwner.selector);
        sla.mintCapacity(providerId, PRICE, SLOTS, uint64(block.timestamp + DURATION));
    }

    function test_mintCapacity_priceTooLow_reverts() public {
        // MIN_PRICE_PER_CALL = 1_000; passing 999 (< 1_000) must revert.
        vm.expectRevert(SLAFutures.InvalidPrice.selector);
        vm.prank(provider);
        sla.mintCapacity(providerId, 999, SLOTS, uint64(block.timestamp + DURATION));
    }

    function test_mintCapacity_deadlineInPast_reverts() public {
        vm.prank(provider);
        vm.expectRevert(SLAFutures.InvalidDeadline.selector);
        // deadline == block.timestamp is NOT strictly > block.timestamp → reverts
        sla.mintCapacity(providerId, PRICE, SLOTS, uint64(block.timestamp));
    }

    function test_mintCapacity_zeroSlots_reverts() public {
        vm.prank(provider);
        vm.expectRevert(SLAFutures.InvalidSlots.selector);
        sla.mintCapacity(providerId, PRICE, 0, uint64(block.timestamp + DURATION));
    }

    // ---------------------------------------------------------------------------
    // 2. buySlots
    // ---------------------------------------------------------------------------

    function test_buySlots_success() public {
        uint256 batchId = _mintBatch();
        uint256 amount = 3;

        uint256 cost = amount * PRICE;
        uint256 providerBalBefore = usdc.balanceOf(provider);
        uint256 buyerBalBefore = usdc.balanceOf(buyer);

        vm.expectEmit(true, true, false, true, address(sla));
        emit SLAFutures.SlotsBought(batchId, buyer, amount);

        vm.prank(buyer);
        sla.buySlots(batchId, amount);

        // Buyer received ERC-1155 tokens
        assertEq(sla.balanceOf(buyer, batchId), amount);
        // USDC transferred directly to provider
        assertEq(usdc.balanceOf(provider), providerBalBefore + cost);
        assertEq(usdc.balanceOf(buyer), buyerBalBefore - cost);
        // purchased mapping updated
        assertEq(sla.purchased(batchId, buyer), amount);

        (, , , uint256 soldSlots, , , , ) = sla.batches(batchId);
        assertEq(soldSlots, amount);
    }

    function test_buySlots_batchExpired_reverts() public {
        uint256 batchId = _mintBatch();

        // Warp past the deadline
        vm.warp(block.timestamp + DURATION + 1);

        vm.prank(buyer);
        vm.expectRevert(SLAFutures.BatchExpired.selector);
        sla.buySlots(batchId, 1);
    }

    function test_buySlots_soldOut_reverts() public {
        uint256 batchId = _mintBatch();

        // Buy all available slots first
        vm.prank(buyer);
        sla.buySlots(batchId, SLOTS);

        // Now try to buy one more
        usdc.mint(alice, 100_000e6);
        vm.prank(alice);
        vm.expectRevert(SLAFutures.ExceedsAvailableSlots.selector);
        sla.buySlots(batchId, 1);
    }

    function test_buySlots_amountZero_reverts() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        vm.expectRevert(SLAFutures.InvalidSlots.selector);
        sla.buySlots(batchId, 0);
    }

    function test_buySlots_unknownBatch_reverts() public {
        vm.prank(buyer);
        vm.expectRevert(SLAFutures.UnknownBatch.selector);
        sla.buySlots(999, 1);
    }

    function test_buySlots_inactiveBatch_reverts() public {
        uint256 batchId = _mintBatch();

        // Cancel the batch (warp past deadline first, then cancel as provider)
        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(provider);
        sla.cancelBatch(batchId);

        vm.prank(buyer);
        vm.expectRevert(SLAFutures.BatchInactive.selector);
        sla.buySlots(batchId, 1);
    }

    // ---------------------------------------------------------------------------
    // 3. burnSlot
    // ---------------------------------------------------------------------------

    function test_burnSlot_success() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        sla.buySlots(batchId, 2);

        vm.expectEmit(true, true, true, true, address(sla));
        emit SLAFutures.SlotBurned(batchId, buyer, providerId);

        vm.prank(buyer);
        sla.burnSlot(batchId);

        assertEq(sla.balanceOf(buyer, batchId), 1);

        (, , , , uint256 usedSlots, , , ) = sla.batches(batchId);
        assertEq(usedSlots, 1);
    }

    function test_burnSlot_noTokens_reverts() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer); // buyer hasn't bought any slots
        vm.expectRevert(SLAFutures.NothingToBurn.selector);
        sla.burnSlot(batchId);
    }

    function test_burnSlot_batchCancelled_reverts() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        sla.buySlots(batchId, 1);

        // Cancel the batch
        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(provider);
        sla.cancelBatch(batchId);

        vm.prank(buyer);
        vm.expectRevert(SLAFutures.BatchInactive.selector);
        sla.burnSlot(batchId);
    }

    function test_burnSlot_batchExpired_reverts() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        sla.buySlots(batchId, 1);

        // Warp past deadline without cancelling
        vm.warp(block.timestamp + DURATION + 1);

        vm.prank(buyer);
        vm.expectRevert(SLAFutures.BatchExpired.selector);
        sla.burnSlot(batchId);
    }

    // ---------------------------------------------------------------------------
    // 4. cancelBatch
    // ---------------------------------------------------------------------------

    function test_cancelBatch_success_noSoldSlots() public {
        uint256 batchId = _mintBatch();

        vm.warp(block.timestamp + DURATION + 1);

        vm.expectEmit(true, false, false, false, address(sla));
        emit SLAFutures.BatchCancelled(batchId);

        vm.prank(provider);
        sla.cancelBatch(batchId);

        (, , , , , , bool active, ) = sla.batches(batchId);
        assertFalse(active);
    }

    function test_cancelBatch_success_withSoldSlots() public {
        uint256 batchId = _mintBatch();
        uint256 amount = 3;

        vm.prank(buyer);
        sla.buySlots(batchId, amount);

        vm.warp(block.timestamp + DURATION + 1);

        uint256 providerBalBefore = usdc.balanceOf(provider);
        uint256 refundReserve = amount * PRICE; // all sold, none used

        vm.prank(provider);
        sla.cancelBatch(batchId);

        // Provider paid refund reserve into contract
        assertEq(usdc.balanceOf(provider), providerBalBefore - refundReserve);
        assertEq(usdc.balanceOf(address(sla)), refundReserve);
    }

    function test_cancelBatch_tooEarly_reverts() public {
        uint256 batchId = _mintBatch();

        // Still before deadline
        vm.prank(provider);
        vm.expectRevert(SLAFutures.BatchNotExpired.selector);
        sla.cancelBatch(batchId);
    }

    function test_cancelBatch_atDeadline_reverts() public {
        uint256 batchId = _mintBatch();

        // Warp to exactly the deadline (not past it — still reverts)
        (, , , , , uint64 deadline, , ) = sla.batches(batchId);
        vm.warp(deadline);

        vm.prank(provider);
        vm.expectRevert(SLAFutures.BatchNotExpired.selector);
        sla.cancelBatch(batchId);
    }

    function test_cancelBatch_wrongCaller_reverts() public {
        uint256 batchId = _mintBatch();
        vm.warp(block.timestamp + DURATION + 1);

        vm.prank(buyer); // not the provider
        vm.expectRevert(SLAFutures.NotBatchProvider.selector);
        sla.cancelBatch(batchId);
    }

    function test_cancelBatch_alreadyCancelled_reverts() public {
        uint256 batchId = _mintBatch();
        vm.warp(block.timestamp + DURATION + 1);

        vm.prank(provider);
        sla.cancelBatch(batchId);

        // Second cancel — batch is now inactive
        vm.prank(provider);
        vm.expectRevert(SLAFutures.BatchInactive.selector);
        sla.cancelBatch(batchId);
    }

    // ---------------------------------------------------------------------------
    // 5. claimRefund
    // ---------------------------------------------------------------------------

    function test_claimRefund_success() public {
        uint256 batchId = _mintBatch();
        uint256 amount = 2;

        vm.prank(buyer);
        sla.buySlots(batchId, amount);

        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(provider);
        sla.cancelBatch(batchId);

        uint256 buyerBalBefore = usdc.balanceOf(buyer);
        uint256 refundValue = amount * PRICE;

        vm.expectEmit(true, true, false, true, address(sla));
        emit SLAFutures.RefundClaimed(batchId, buyer, amount);

        vm.prank(buyer);
        sla.claimRefund(batchId);

        assertEq(usdc.balanceOf(buyer), buyerBalBefore + refundValue);
        assertEq(sla.balanceOf(buyer, batchId), 0);
        assertEq(sla.refunded(batchId, buyer), amount);
    }

    function test_claimRefund_noTokens_reverts() public {
        uint256 batchId = _mintBatch();

        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(provider);
        sla.cancelBatch(batchId);

        // Alice never bought any slots
        vm.prank(alice);
        vm.expectRevert(SLAFutures.NothingToRefund.selector);
        sla.claimRefund(batchId);
    }

    function test_claimRefund_notCancelled_reverts() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        sla.buySlots(batchId, 1);

        // Batch is still active — claimRefund should revert
        vm.prank(buyer);
        vm.expectRevert(SLAFutures.BatchStillActive.selector);
        sla.claimRefund(batchId);
    }

    function test_claimRefund_partialAfterBurn() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        sla.buySlots(batchId, 3);

        // Burn 1 slot before the batch is cancelled
        vm.prank(buyer);
        sla.burnSlot(batchId);

        vm.warp(block.timestamp + DURATION + 1);

        // Provider must refund 2 remaining (3 sold - 1 used)
        vm.prank(provider);
        sla.cancelBatch(batchId);

        uint256 buyerBalBefore = usdc.balanceOf(buyer);

        vm.prank(buyer);
        sla.claimRefund(batchId);

        // Buyer gets back 2 * PRICE (the 2 unburned slots)
        assertEq(usdc.balanceOf(buyer), buyerBalBefore + 2 * PRICE);
        assertEq(sla.balanceOf(buyer, batchId), 0);
    }

    // ---------------------------------------------------------------------------
    // 6. ERC-1155 transfer then burnSlot by new holder
    // ---------------------------------------------------------------------------

    function test_transfer_thenBurnByNewHolder() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        sla.buySlots(batchId, 3);

        // Transfer 2 slots to alice
        vm.prank(buyer);
        sla.safeTransferFrom(buyer, alice, batchId, 2, "");

        assertEq(sla.balanceOf(buyer, batchId), 1);
        assertEq(sla.balanceOf(alice, batchId), 2);

        // Alice burns one slot
        vm.prank(alice);
        sla.burnSlot(batchId);

        assertEq(sla.balanceOf(alice, batchId), 1);

        (, , , , uint256 usedSlots, , , ) = sla.batches(batchId);
        assertEq(usedSlots, 1);
    }

    // ---------------------------------------------------------------------------
    // 7. Full happy path: mint → buy 5 → burn 3 → cancel → refund 2
    // ---------------------------------------------------------------------------

    function test_happyPath_mintBuyBurnCancelRefund() public {
        // 1. Mint batch
        uint256 batchId = _mintBatch();

        // 2. Buyer purchases 5 slots
        vm.prank(buyer);
        sla.buySlots(batchId, 5);
        assertEq(sla.balanceOf(buyer, batchId), 5);
        assertEq(sla.purchased(batchId, buyer), 5);

        // 3. Burn 3 slots (call service 3 times)
        vm.prank(buyer);
        sla.burnSlot(batchId);
        vm.prank(buyer);
        sla.burnSlot(batchId);
        vm.prank(buyer);
        sla.burnSlot(batchId);
        assertEq(sla.balanceOf(buyer, batchId), 2);

        (, , , , uint256 usedSlots, , , ) = sla.batches(batchId);
        assertEq(usedSlots, 3);

        // 4. Warp past deadline and cancel
        vm.warp(block.timestamp + DURATION + 1);

        uint256 providerBalBefore = usdc.balanceOf(provider);
        // Provider must deposit 2 * PRICE as refund reserve (5 sold, 3 burned)
        vm.prank(provider);
        sla.cancelBatch(batchId);
        assertEq(usdc.balanceOf(provider), providerBalBefore - 2 * PRICE);
        assertEq(usdc.balanceOf(address(sla)), 2 * PRICE);

        // 5. Buyer claims refund for remaining 2 slots
        uint256 buyerBalBefore = usdc.balanceOf(buyer);
        vm.prank(buyer);
        sla.claimRefund(batchId);

        assertEq(sla.balanceOf(buyer, batchId), 0);
        assertEq(usdc.balanceOf(buyer), buyerBalBefore + 2 * PRICE);
        assertEq(usdc.balanceOf(address(sla)), 0);
    }

    // ---------------------------------------------------------------------------
    // 8. setBatchURI
    // ---------------------------------------------------------------------------

    function test_setBatchURI_providerCanSet() public {
        uint256 batchId = _mintBatch();
        string memory newUri = "ipfs://QmXyz";

        vm.prank(provider);
        sla.setBatchURI(batchId, newUri);

        assertEq(sla.uri(batchId), newUri);
    }

    function test_setBatchURI_nonProviderReverts() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer); // not the batch provider
        vm.expectRevert(SLAFutures.NotBatchProvider.selector);
        sla.setBatchURI(batchId, "ipfs://evil");
    }

    function test_setBatchURI_unknownBatch_reverts() public {
        vm.prank(provider);
        vm.expectRevert(SLAFutures.UnknownBatch.selector);
        sla.setBatchURI(999, "ipfs://foo");
    }

    function test_setBatchURI_adminCannotSet() public {
        uint256 batchId = _mintBatch();

        vm.prank(admin); // admin owns the contract but is not the batch provider
        vm.expectRevert(SLAFutures.NotBatchProvider.selector);
        sla.setBatchURI(batchId, "ipfs://admin");
    }

    // ---------------------------------------------------------------------------
    // 9. Secondary market: buy → transfer to Alice → Alice burns slot
    // ---------------------------------------------------------------------------

    function test_secondaryMarket_buyTransferBurn() public {
        uint256 batchId = _mintBatch();

        // Buyer purchases 3 slots
        vm.prank(buyer);
        sla.buySlots(batchId, 3);
        assertEq(sla.balanceOf(buyer, batchId), 3);

        // Buyer transfers all 3 to Alice
        vm.prank(buyer);
        sla.safeTransferFrom(buyer, alice, batchId, 3, "");
        assertEq(sla.balanceOf(buyer, batchId), 0);
        assertEq(sla.balanceOf(alice, batchId), 3);

        // Alice burns one slot
        vm.prank(alice);
        sla.burnSlot(batchId);

        assertEq(sla.balanceOf(alice, batchId), 2);
        (, , , , uint256 usedSlots, , , ) = sla.batches(batchId);
        assertEq(usedSlots, 1);
    }

    // ---------------------------------------------------------------------------
    // Fuzz: buying any valid amount within capacity should always succeed
    // ---------------------------------------------------------------------------

    function testFuzz_buySlots_withinCapacity(uint256 amount) public {
        amount = bound(amount, 1, SLOTS);
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        sla.buySlots(batchId, amount);

        assertEq(sla.balanceOf(buyer, batchId), amount);
        assertEq(sla.purchased(batchId, buyer), amount);
    }

    // ---------------------------------------------------------------------------
    // setBaseURI — onlyOwner
    // ---------------------------------------------------------------------------

    function test_setBaseURI_ownerCanSet() public {
        vm.prank(admin);
        sla.setBaseURI("https://new-base.example");
        assertEq(sla.baseUri(), "https://new-base.example");
    }

    function test_setBaseURI_nonOwnerReverts() public {
        vm.prank(buyer);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        sla.setBaseURI("https://hacked");
    }

    // ---------------------------------------------------------------------------
    // cancelBatch — partial refund: some slots burned before cancel
    // ---------------------------------------------------------------------------

    function test_cancelBatch_partialBurned_correctReserve() public {
        uint256 batchId = _mintBatch();

        vm.prank(buyer);
        sla.buySlots(batchId, 4);

        // Burn 1 slot
        vm.prank(buyer);
        sla.burnSlot(batchId);

        vm.warp(block.timestamp + DURATION + 1);

        uint256 providerBalBefore = usdc.balanceOf(provider);
        // 4 sold, 1 used → 3 refundable
        vm.prank(provider);
        sla.cancelBatch(batchId);

        assertEq(usdc.balanceOf(provider), providerBalBefore - 3 * PRICE);
        assertEq(usdc.balanceOf(address(sla)), 3 * PRICE);
    }

    // ---------------------------------------------------------------------------
    // uri() fallback to baseUri
    // ---------------------------------------------------------------------------

    function test_uri_fallbackToBaseUri() public {
        uint256 batchId = _mintBatch();
        // Default URI is set at mint time: baseUri + "/" + batchId
        string memory expected = string.concat("https://sla.example", "/", "1");
        assertEq(sla.uri(batchId), expected);
    }

    function test_uri_customOverridesBatchUri() public {
        uint256 batchId = _mintBatch();
        string memory custom = "ipfs://QmCustom";

        vm.prank(provider);
        sla.setBatchURI(batchId, custom);

        assertEq(sla.uri(batchId), custom);
    }
}
