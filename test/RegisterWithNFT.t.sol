// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { RegisterWithNFT } from "../contracts/RegisterWithNFT.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// RegisterWithNFT hardcodes its collaborators as `constant` addresses:
//   IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e
//   SERVICE_REGISTRY  = 0x9cA97010464E8e6dE6E27CF25eAe9B939fbD7333
//   USDC              = 0x3600000000000000000000000000000000000000
// so the tests `vm.etch` mock runtime code at those exact addresses.
// ---------------------------------------------------------------------------

/// Minimal ERC-8004 identity: register() mints, transferFrom() moves ownership.
contract MockERC8004 {
    uint256 public nextId = 1;
    mapping(uint256 => address) public ownerOf;

    function register(string calldata) external returns (uint256 id) {
        id = nextId++;
        ownerOf[id] = msg.sender;
    }

    function transferFrom(address from, address to, uint256 id) external {
        require(ownerOf[id] == from, "not nft owner");
        ownerOf[id] = to;
    }
}

/// Minimal ServiceRegistry surface used by RegisterWithNFT, including the
/// owner-gated functions the forwarding helpers call.
contract MockRegistryForHelper {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    struct P {
        address owner;
        uint256 stake;
        bool active;
        uint256 price;
        address signer;
        uint32 cap;
    }

    uint256 public nextProviderId = 1;
    mapping(uint256 => P) public providers;

    function registerV2(
        uint256 tokenId,
        address signer,
        uint256 stakeAmount,
        uint256 pricePerCall,
        uint32,
        uint32,
        uint32 cap,
        string calldata
    ) external returns (uint256 id) {
        require(MockERC8004(IDENTITY).ownerOf(tokenId) == msg.sender, "not nft owner");
        id = nextProviderId++;
        providers[id] = P(msg.sender, stakeAmount, true, pricePerCall, signer, cap);
        IERC20(USDC).transferFrom(msg.sender, address(this), stakeAmount);
    }

    function deactivate(uint256 id) external {
        require(providers[id].owner == msg.sender, "not owner");
        providers[id].active = false;
    }

    function unstake(uint256 id) external {
        require(providers[id].owner == msg.sender, "not owner");
        require(!providers[id].active, "still active");
        uint256 a = providers[id].stake;
        providers[id].stake = 0;
        IERC20(USDC).transfer(msg.sender, a);
    }

    function updatePrice(uint256 id, uint256 p) external {
        require(providers[id].owner == msg.sender, "not owner");
        providers[id].price = p;
    }

    function updateSigner(uint256 id, address s) external {
        require(providers[id].owner == msg.sender, "not owner");
        providers[id].signer = s;
    }

    function updateMaxConcurrentCalls(uint256 id, uint32 c) external {
        require(providers[id].owner == msg.sender, "not owner");
        providers[id].cap = c;
    }
}

contract RegisterWithNFTTest is Test {
    address internal constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address internal constant SERVICE = 0x9cA97010464E8e6dE6E27CF25eAe9B939fbD7333;
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    RegisterWithNFT internal helper;
    MockERC8004 internal identity;
    MockRegistryForHelper internal registry;
    MockUSDC internal usdc;

    address internal user = makeAddr("user");
    address internal stranger = makeAddr("stranger");
    address internal signer = makeAddr("signer");

    uint256 internal constant STAKE = 100e6;

    function setUp() public {
        vm.etch(IDENTITY, address(new MockERC8004()).code);
        identity = MockERC8004(IDENTITY);

        vm.etch(SERVICE, address(new MockRegistryForHelper()).code);
        registry = MockRegistryForHelper(SERVICE);

        vm.etch(USDC_ADDR, address(new MockUSDC()).code);
        usdc = MockUSDC(USDC_ADDR);

        helper = new RegisterWithNFT();

        usdc.mint(user, 1_000e6);
        vm.prank(user);
        usdc.approve(address(helper), type(uint256).max);
    }

    function _register() internal returns (uint256 tokenId, uint256 providerId) {
        vm.prank(user);
        (tokenId, providerId) =
            helper.registerAndBind(STAKE, 1e6, 30, 1_000, 10, signer, "https://endpoint.example");
    }

    // -----------------------------------------------------------------------

    function test_registerAndBind_movesStake_andBindsUser() public {
        (uint256 tokenId, uint256 providerId) = _register();

        assertEq(helper.userOfProvider(providerId), user, "user recorded");
        assertEq(identity.ownerOf(tokenId), user, "NFT forwarded to user");
        assertEq(usdc.balanceOf(user), 1_000e6 - STAKE, "stake pulled from user");
        assertEq(usdc.balanceOf(SERVICE), STAKE, "stake custodied by registry");

        (address owner, uint256 stake, bool active,,, ) = registry.providers(providerId);
        assertEq(owner, address(helper), "registry owner is helper");
        assertEq(stake, STAKE, "stake recorded");
        assertTrue(active, "provider active");
    }

    function test_directRegistryCall_byUserReverts() public {
        (, uint256 providerId) = _register();
        vm.prank(user);
        vm.expectRevert(bytes("not owner"));
        registry.updatePrice(providerId, 5e6);
    }

    function test_deactivateThenUnstake_returnsStakeToUser() public {
        (, uint256 providerId) = _register();

        vm.prank(user);
        helper.deactivate(providerId);
        (, , bool active,,, ) = registry.providers(providerId);
        assertFalse(active, "deactivated via forwarder");

        vm.prank(user);
        helper.unstake(providerId);

        assertEq(usdc.balanceOf(user), 1_000e6, "stake returned to user");
        assertEq(usdc.balanceOf(address(helper)), 0, "helper holds nothing");
    }

    function test_updateForwarders_workForUser() public {
        (, uint256 providerId) = _register();

        address newSigner = makeAddr("newSigner");
        vm.startPrank(user);
        helper.updatePrice(providerId, 42e6);
        helper.updateSigner(providerId, newSigner);
        helper.updateMaxConcurrentCalls(providerId, 7);
        vm.stopPrank();

        (, uint256 stake, bool active, uint256 price, address s, uint32 cap) = registry.providers(providerId);
        assertEq(price, 42e6, "price forwarded");
        assertEq(s, newSigner, "signer forwarded");
        assertEq(cap, 7, "cap forwarded");
        assertEq(stake, STAKE, "stake unchanged");
        assertTrue(active, "still active");
    }

    function test_forwarders_revertForStranger() public {
        (, uint256 providerId) = _register();

        vm.startPrank(stranger);
        vm.expectRevert(RegisterWithNFT.NotProviderUser.selector);
        helper.deactivate(providerId);
        vm.expectRevert(RegisterWithNFT.NotProviderUser.selector);
        helper.unstake(providerId);
        vm.expectRevert(RegisterWithNFT.NotProviderUser.selector);
        helper.updatePrice(providerId, 1);
        vm.expectRevert(RegisterWithNFT.NotProviderUser.selector);
        helper.updateSigner(providerId, stranger);
        vm.expectRevert(RegisterWithNFT.NotProviderUser.selector);
        helper.updateMaxConcurrentCalls(providerId, 1);
        vm.stopPrank();
    }

    function test_unstakeBeforeDeactivate_reverts() public {
        (, uint256 providerId) = _register();
        vm.prank(user);
        vm.expectRevert(bytes("still active"));
        helper.unstake(providerId);
    }

    function test_registerAndBind_zeroStake_reverts() public {
        vm.prank(user);
        vm.expectRevert(RegisterWithNFT.ZeroStake.selector);
        helper.registerAndBind(0, 1e6, 30, 1_000, 10, signer, "https://endpoint.example");
    }

    function test_registerAndBind_zeroSigner_reverts() public {
        vm.prank(user);
        vm.expectRevert(RegisterWithNFT.ZeroSigner.selector);
        helper.registerAndBind(STAKE, 1e6, 30, 1_000, 10, address(0), "https://endpoint.example");
    }
}
