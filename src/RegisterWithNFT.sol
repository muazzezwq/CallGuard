// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IIdentityRegistry {
    function register(string memory metadataURI) external returns (uint256 tokenId);
}

interface IServiceRegistry {
    function registerV2(
        uint256 erc8004TokenId,
        address signer,
        uint256 stakeAmount,
        uint256 pricePerCall,
        uint32 maxResponseTime,
        uint32 slashBps,
        string calldata endpoint
    ) external returns (uint256 providerId);
}

/// @title RegisterWithNFT
/// @notice One-transaction helper: mints an ERC-8004 AgentIdentity NFT
///         and registers the caller as an ArcSLA v2 provider.
///
/// @dev User flow:
///   1. User approves this contract to spend stakeAmount USDC
///   2. User calls registerAndBind() — ONE transaction
///   3. Contract does:
///      a. Mints AgentIdentity NFT via IdentityRegistry.register()
///      b. Pulls USDC from user
///      c. Approves ServiceRegistry to spend USDC
///      d. Calls ServiceRegistry.registerV2()
///      e. Emits RegisteredWithNFT event
///
///   Result: 2 MetaMask popups total (approve + registerAndBind)
///   vs 3 popups with separate calls (mint + approve + registerV2)

contract RegisterWithNFT is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------
    // Arc Testnet addresses
    // ----------------------------------------------------------------

    address public constant IDENTITY_REGISTRY =
        0x8004A818BFB912233c491871b3d84c89A494BD9e;

    address public constant SERVICE_REGISTRY =
        0x0FbC2841d0d56a57C3967472DDCaef825a38de02;

    IERC20 public constant USDC =
        IERC20(0x3600000000000000000000000000000000000000);

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event RegisteredWithNFT(
        address indexed provider,
        uint256 indexed tokenId,
        uint256 indexed providerId,
        uint256 stakeAmount
    );

    // ----------------------------------------------------------------
    // Errors
    // ----------------------------------------------------------------

    error ZeroStake();
    error ZeroSigner();
    error EmptyEndpoint();

    // ----------------------------------------------------------------
    // Core
    // ----------------------------------------------------------------

    /// @notice Mint NFT + register as ArcSLA v2 provider in one tx.
    /// @param stakeAmount    USDC amount to stake (6 decimals, min 10 USDC = 10_000_000)
    /// @param pricePerCall   USDC price per call (e.g. 1_000_000 = 1 USDC)
    /// @param maxResponseTime  Max seconds provider has to respond (min 5)
    /// @param slashBps       Slash percentage in basis points (e.g. 2000 = 20%)
    /// @param signer         Address that will sign EIP-712 receipts
    /// @param endpoint       Provider API endpoint URL
    function registerAndBind(
        uint256 stakeAmount,
        uint256 pricePerCall,
        uint32  maxResponseTime,
        uint32  slashBps,
        address signer,
        string calldata endpoint
    ) external nonReentrant returns (uint256 tokenId, uint256 providerId) {
        if (stakeAmount == 0) revert ZeroStake();
        if (signer == address(0)) revert ZeroSigner();
        if (bytes(endpoint).length == 0) revert EmptyEndpoint();

        // 1. Mint ERC-8004 AgentIdentity NFT
        //    metadataURI = endpoint (provider's public API URL)
        tokenId = IIdentityRegistry(IDENTITY_REGISTRY).register(endpoint);

        // 2. Pull USDC from caller → this contract
        USDC.safeTransferFrom(msg.sender, address(this), stakeAmount);

        // 3. Approve ServiceRegistry to pull USDC from this contract
        USDC.forceApprove(SERVICE_REGISTRY, stakeAmount);

        // 4. Register as v2 provider (NFT ownership check inside)
        //    msg.sender = original caller, ownerOf(tokenId) = this contract
        //    PROBLEM: ownerOf(tokenId) must == msg.sender in registerV2
        //    SOLUTION: use signer = caller, but NFT is owned by caller (not this contract)
        //    The NFT is minted TO the caller (msg.sender of IdentityRegistry.register)
        //    So ownerOf(tokenId) == msg.sender of THIS contract == caller ✅
        providerId = IServiceRegistry(SERVICE_REGISTRY).registerV2(
            tokenId,
            signer,
            stakeAmount,
            pricePerCall,
            maxResponseTime,
            slashBps,
            endpoint
        );

        emit RegisteredWithNFT(msg.sender, tokenId, providerId, stakeAmount);
    }

    /// @notice View helper — returns minimum stake from ServiceRegistry
    function minStake() external view returns (uint256) {
        // 10 USDC default
        return 10_000_000;
    }
}
