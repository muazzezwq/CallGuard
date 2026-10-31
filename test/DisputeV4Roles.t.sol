// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { DisputeV3 } from "../contracts/DisputeV3.sol";
import { DisputeV4, ISLAEvidenceV2 } from "../contracts/DisputeV4.sol";
import { IDisputeV2 } from "../contracts/interfaces/IDisputeV2.sol";
import { SLAEvidenceRegistryV2 } from "../contracts/SLAEvidenceRegistryV2.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

/// @notice Who may do what on the live dispute contract, and where the boundary is.
///
///         `DisputeV4` has three named roles and no `Ownable`: the arbiter resolves
///         first-instance disputes *and* holds every admin lever, the appeal arbiter
///         resolves appeals and nothing else, and the treasury only receives bonds.
///         The registry's admin is a fourth, separate authority that can revoke this
///         contract's slasher rights but cannot steer a dispute.
///
///         These tests pin the boundary, not the outcome of any dispute. The
///         deployment currently maps all three roles to one wallet
///         (`docs/decisions.md`, "Arbitration roles"); separating them is a
///         constructor argument, not a migration.
contract DisputeV4RolesTest is Test {
    MockUSDC internal usdc;
    ServiceRegistryV8 internal registry;
    PayPerCallV8 internal payPerCall;
    SLAEvidenceRegistryV2 internal evidence;
    DisputeV3 internal legacy;
    DisputeV4 internal dispute;

    address internal admin = address(0xA11CE);
    address internal arbiter = address(0xA4B);
    address internal appealArbiter = address(0xA4B2);
    address internal treasury = address(0x7EA5);
    address internal outsider = address(0xBAD);

    uint256 internal constant MIN_STAKE = 10e6;
    uint256 internal constant BOND = 2e6;
    uint256 internal constant APPEAL_BOND = 3e6;
    uint16 internal constant SLASH_BPS = 1_000;

    function setUp() public {
        vm.startPrank(admin);
        usdc = new MockUSDC();
        registry = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);
        payPerCall = new PayPerCallV8(IERC20(address(usdc)), registry);
        evidence = new SLAEvidenceRegistryV2(admin);
        legacy = new DisputeV3(
            IERC20(address(usdc)),
            registry,
            payPerCall,
            arbiter,
            appealArbiter,
            treasury,
            BOND,
            APPEAL_BOND,
            1 days,
            1 days,
            2 days,
            SLASH_BPS
        );
        dispute = new DisputeV4(
            IERC20(address(usdc)),
            registry,
            payPerCall,
            arbiter,
            appealArbiter,
            treasury,
            BOND,
            APPEAL_BOND,
            1 days,
            1 days,
            2 days,
            SLASH_BPS,
            ISLAEvidenceV2(address(evidence)),
            legacy
        );
        vm.stopPrank();
    }

    /// Every admin lever answers to the arbiter alone — not to the appeal arbiter,
    /// not to the registry admin, not to an outsider.
    function test_adminLeversAreArbiterOnly() public {
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = keccak256("zk-execution");

        address[2] memory wrongCallers = [appealArbiter, admin];
        for (uint256 i = 0; i < wrongCallers.length; ++i) {
            address caller = wrongCallers[i];
            vm.startPrank(caller);
            vm.expectRevert(DisputeV4.NotArbiter.selector);
            dispute.setArbiter(caller);
            vm.expectRevert(DisputeV4.NotArbiter.selector);
            dispute.setAppealArbiter(caller);
            vm.expectRevert(DisputeV4.NotArbiter.selector);
            dispute.setTreasury(caller);
            vm.expectRevert(DisputeV4.NotArbiter.selector);
            dispute.setDisputeBond(1);
            vm.expectRevert(DisputeV4.NotArbiter.selector);
            dispute.setAppealBond(1);
            vm.expectRevert(DisputeV4.NotArbiter.selector);
            dispute.setDisputeSlashBps(1);
            vm.expectRevert(DisputeV4.NotArbiter.selector);
            dispute.setEvidenceKinds(kinds);
            vm.stopPrank();
        }

        vm.prank(outsider);
        vm.expectRevert(DisputeV4.NotArbiter.selector);
        dispute.setTreasury(outsider);
    }

    /// The two adjudicators are not interchangeable: the appeal arbiter cannot
    /// decide a first-instance dispute and the arbiter cannot decide an appeal.
    function test_adjudicatorsAreNotInterchangeable() public {
        vm.prank(appealArbiter);
        vm.expectRevert(DisputeV4.NotArbiter.selector);
        dispute.resolve(1, true);

        vm.prank(arbiter);
        vm.expectRevert(DisputeV4.NotAppealArbiter.selector);
        dispute.resolveAppeal(1, true);

        vm.prank(treasury);
        vm.expectRevert(DisputeV4.NotArbiter.selector);
        dispute.resolve(1, true);
    }

    /// Handing the role over is one call with no second key: the old arbiter is
    /// out immediately and the new one holds every lever.
    function test_arbiterHandoverMovesEveryLever() public {
        address next = address(0xBEEF);

        vm.prank(arbiter);
        vm.expectEmit(true, true, false, false, address(dispute));
        emit IDisputeV2.ArbiterChanged(arbiter, next);
        dispute.setArbiter(next);

        assertEq(dispute.arbiter(), next);

        vm.prank(arbiter);
        vm.expectRevert(DisputeV4.NotArbiter.selector);
        dispute.setTreasury(arbiter);

        vm.prank(next);
        dispute.setTreasury(next);
        assertEq(dispute.treasury(), next);
    }

    /// A zero address would brick the lever that can restore it, so it is refused.
    function test_rolesCannotBeSetToZero() public {
        vm.startPrank(arbiter);
        vm.expectRevert(DisputeV4.InvalidAddress.selector);
        dispute.setArbiter(address(0));
        vm.expectRevert(DisputeV4.InvalidAddress.selector);
        dispute.setAppealArbiter(address(0));
        vm.expectRevert(DisputeV4.InvalidAddress.selector);
        dispute.setTreasury(address(0));
        vm.stopPrank();
    }

    /// The constructor refuses a deployment that would leave a role unowned.
    function test_constructorRejectsEmptyRoles() public {
        vm.expectRevert(DisputeV4.InvalidAddress.selector);
        new DisputeV4(
            IERC20(address(usdc)),
            registry,
            payPerCall,
            address(0),
            appealArbiter,
            treasury,
            BOND,
            APPEAL_BOND,
            1 days,
            1 days,
            2 days,
            SLASH_BPS,
            ISLAEvidenceV2(address(evidence)),
            legacy
        );
    }

    /// The registry admin's authority stops at the slasher list: it can revoke this
    /// contract, and it cannot replace the arbiter or reach the bond recipient.
    function test_registryAdminCannotSteerADispute() public {
        vm.prank(admin);
        vm.expectRevert(DisputeV4.NotArbiter.selector);
        dispute.setArbiter(admin);

        vm.prank(admin);
        registry.revokeSlasher(address(dispute));
        assertFalse(registry.authorizedSlashers(address(dispute)));
        assertEq(dispute.arbiter(), arbiter);
    }

    /// Funding the contract does not make the funder an adjudicator or a claimant.
    function test_fundingConfersNoAuthority() public {
        usdc.mint(outsider, 10e6);
        vm.prank(outsider);
        usdc.transfer(address(dispute), 10e6);

        vm.prank(outsider);
        vm.expectRevert(DisputeV4.NotArbiter.selector);
        dispute.setDisputeSlashBps(2_000);
    }
}
