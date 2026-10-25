// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IServiceRegistryV8 } from "./interfaces/IServiceRegistryV8.sol";

/// @title SLAUptime
/// @notice Gives the published `availabilityTargetBps` a consequence.
/// @dev    The registry stores an availability target per terms version but
///         never enforced it: a provider could promise 99.5 % uptime, miss calls,
///         and keep the stake. This contract turns that promise into a claim.
///
///         The metric is the availability observed **since the last check**, not
///         the lifetime ratio. Lifetime ratios go stale: a provider that drops to
///         90 % needs hundreds of calls before a cumulative score reacts. The
///         window here is `completedCalls` / `slashedCalls` deltas since the last
///         successful claim, which the registry already tracks, so no change to
///         the registry or to PayPerCall is needed.
///
///         Anyone can call `claimAvailability`. A successful claim slashes the
///         provider's stake and splits the money: `bountyBps` to the caller that
///         did the work (the keeper pattern), the rest to the treasury.
contract SLAUptime is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidAddress();
    error InvalidBps();
    error InvalidSamples();
    error InvalidCooldown();
    error NotArbiter();
    error UnknownProvider();
    error TargetUnspecified();
    error NotEnoughSamples();
    error TargetMet();
    error Cooldown();
    error NothingToSlash();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AvailabilitySlashed(
        uint256 indexed providerId,
        address indexed claimer,
        uint256 availabilityBps,
        uint16 targetBps,
        uint256 samples,
        uint256 slashAmount,
        uint256 bounty
    );
    event ArbiterChanged(address indexed previousArbiter, address indexed newArbiter);
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);
    event AvailabilitySlashBpsChanged(uint16 previousBps, uint16 newBps);
    event BountyBpsChanged(uint16 previousBps, uint16 newBps);
    event CooldownChanged(uint32 previousCooldown, uint32 newCooldown);
    event MinSamplesChanged(uint32 previousSamples, uint32 newSamples);

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Registry counters captured at the last check for a provider.
    /// @dev    `checkedAt == 0` means "never checked", so the first claim scores
    ///         the provider's whole history instead of handing out a free pass.
    struct Window {
        uint64 completed;
        uint64 slashed;
        uint64 checkedAt;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    IServiceRegistryV8 public immutable registry;
    IERC20 public immutable usdc;

    address public arbiter;
    address public treasury;

    /// @notice Slash as basis points of the provider stake when the target is missed.
    uint16 public availabilitySlashBps;
    /// @notice Share of the slash paid to the account that filed the claim.
    uint16 public bountyBps;
    /// @notice Minimum seconds between two successful claims on the same provider.
    uint32 public cooldown;
    /// @notice Minimum number of observed calls in the window before a claim is allowed.
    uint32 public minSamples;

    mapping(uint256 => Window) public windows;
    mapping(uint256 => uint32) public lastClaimAt;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(
        IERC20 _usdc,
        IServiceRegistryV8 _registry,
        address _arbiter,
        address _treasury,
        uint16 _availabilitySlashBps,
        uint16 _bountyBps,
        uint32 _cooldown,
        uint32 _minSamples
    ) {
        if (address(_usdc) == address(0) || address(_registry) == address(0)) revert InvalidAddress();
        if (_arbiter == address(0) || _treasury == address(0)) revert InvalidAddress();
        _validateBps(_availabilitySlashBps);
        _validateBps(_bountyBps);
        if (_minSamples == 0) revert InvalidSamples();

        usdc = _usdc;
        registry = _registry;
        arbiter = _arbiter;
        treasury = _treasury;
        availabilitySlashBps = _availabilitySlashBps;
        bountyBps = _bountyBps;
        cooldown = _cooldown;
        minSamples = _minSamples;
    }

    // ---------------------------------------------------------------------
    // Claim
    // ---------------------------------------------------------------------

    /// @notice Slash a provider whose observed availability missed its target.
    /// @param providerId Registry provider id.
    function claimAvailability(uint256 providerId) external nonReentrant {
        IServiceRegistryV8.ProviderView memory p = registry.getProvider(providerId);
        if (p.owner == address(0)) revert UnknownProvider();

        uint16 target = _targetBps(providerId);
        if (target == 0) revert TargetUnspecified();

        (uint256 samples, uint256 availabilityBps) = _measure(providerId, p);
        if (samples < minSamples) revert NotEnoughSamples();
        if (availabilityBps >= target) revert TargetMet();

        uint32 last = lastClaimAt[providerId];
        if (last != 0 && block.timestamp < uint256(last) + cooldown) revert Cooldown();

        uint256 slashAmount = (p.stake * availabilitySlashBps) / 10_000;
        if (slashAmount > p.stake) slashAmount = p.stake;
        if (slashAmount == 0) revert NothingToSlash();

        // Move the window and the cooldown before the external calls so a
        // reentrant claim cannot score the same calls twice.
        windows[providerId] = Window({
            completed: p.completedCalls,
            slashed: p.slashedCalls,
            checkedAt: uint64(block.timestamp)
        });
        lastClaimAt[providerId] = uint32(block.timestamp);

        registry.slash(providerId, slashAmount, address(this));

        uint256 bounty = (slashAmount * bountyBps) / 10_000;
        if (bounty > 0) {
            usdc.safeTransfer(msg.sender, bounty);
        }
        uint256 toTreasury = slashAmount - bounty;
        if (toTreasury > 0) {
            usdc.safeTransfer(treasury, toTreasury);
        }

        emit AvailabilitySlashed(providerId, msg.sender, availabilityBps, target, samples, slashAmount, bounty);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Everything a caller needs before sending the claim transaction.
    /// @return availabilityBps Observed availability in basis points.
    /// @return targetBps The provider's published target (0 = unspecified).
    /// @return samples Calls observed since the last check.
    /// @return slashAmount USDC that `claimAvailability` would take from the stake.
    /// @return cooldownEndsAt Earliest claim timestamp (`0` when never claimed).
    /// @return ready True when the claim would succeed right now.
    function previewAvailability(uint256 providerId)
        external
        view
        returns (
            uint256 availabilityBps,
            uint16 targetBps,
            uint256 samples,
            uint256 slashAmount,
            uint256 cooldownEndsAt,
            bool ready
        )
    {
        IServiceRegistryV8.ProviderView memory p = registry.getProvider(providerId);
        if (p.owner == address(0)) {
            return (0, 0, 0, 0, 0, false);
        }

        targetBps = _targetBps(providerId);
        (samples, availabilityBps) = _measure(providerId, p);

        slashAmount = (p.stake * availabilitySlashBps) / 10_000;
        if (slashAmount > p.stake) slashAmount = p.stake;

        uint32 last = lastClaimAt[providerId];
        cooldownEndsAt = last == 0 ? 0 : uint256(last) + cooldown;

        ready = targetBps != 0 && samples >= minSamples && availabilityBps < targetBps
            && (last == 0 || block.timestamp >= uint256(last) + cooldown) && slashAmount > 0;
    }

    /// @notice Observed availability and sample count for a provider right now.
    function observedAvailability(uint256 providerId) external view returns (uint256 availabilityBps, uint256 samples) {
        IServiceRegistryV8.ProviderView memory p = registry.getProvider(providerId);
        if (p.owner == address(0)) revert UnknownProvider();
        (samples, availabilityBps) = _measure(providerId, p);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setArbiter(address next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (next == address(0)) revert InvalidAddress();
        emit ArbiterChanged(arbiter, next);
        arbiter = next;
    }

    function setTreasury(address next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (next == address(0)) revert InvalidAddress();
        emit TreasuryChanged(treasury, next);
        treasury = next;
    }

    function setAvailabilitySlashBps(uint16 next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        _validateBps(next);
        emit AvailabilitySlashBpsChanged(availabilitySlashBps, next);
        availabilitySlashBps = next;
    }

    function setBountyBps(uint16 next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        _validateBps(next);
        emit BountyBpsChanged(bountyBps, next);
        bountyBps = next;
    }

    function setCooldown(uint32 next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (next > 30 days) revert InvalidCooldown();
        emit CooldownChanged(cooldown, next);
        cooldown = next;
    }

    function setMinSamples(uint32 next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (next == 0) revert InvalidSamples();
        emit MinSamplesChanged(minSamples, next);
        minSamples = next;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _validateBps(uint16 bps) internal pure {
        if (bps > 10_000) revert InvalidBps();
    }

    /// @dev Latest terms version of the provider, read through the registry. A
    ///      target of `0` means the provider never published one.
    function _targetBps(uint256 providerId) internal view returns (uint16) {
        uint32 version = registry.latestTermsVersion(providerId);
        if (version == 0) return 0;
        return registry.getTerms(providerId, version).availabilityTargetBps;
    }

    /// @dev Availability for the window since the last check. `samples == 0` is
    ///      reported as `0` bps; callers must treat it as "not enough data".
    function _measure(uint256 providerId, IServiceRegistryV8.ProviderView memory p)
        internal
        view
        returns (uint256 samples, uint256 availabilityBps)
    {
        Window memory w = windows[providerId];
        uint256 completed = p.completedCalls - w.completed;
        uint256 slashed = p.slashedCalls - w.slashed;
        samples = completed + slashed;
        availabilityBps = samples == 0 ? 0 : (completed * 10_000) / samples;
    }
}
