// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IIdentityRegistry {
    function register(string memory agentURI) external returns (uint256 agentId);
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

interface IERC721Transfer {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @title RegisterWithNFT
/// @notice One-transaction helper: mints an ERC-8004 AgentIdentity NFT
///         and registers the caller as an ArcSLA v2 provider.
///
/// @dev IMPORTANT FIX vs first version:
///   IdentityRegistry.register() uses _safeMint(), which requires the
///   recipient contract to implement onERC721Received(). The first version
///   did NOT implement it, so register() reverted at the mint step.
///   This version implements IERC721Receiver, then transfers the minted
///   NFT to the caller after registerV2() succeeds.
contract RegisterWithNFT is ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    address public constant IDENTITY_REGISTRY =
        0x8004A818BFB912233c491871b3d84c89A494BD9e;

    address public constant SERVICE_REGISTRY =
        0x0FbC2841d0d56a57C3967472DDCaef825a38de02;

    IERC20 public constant USDC =
        IERC20(0x3600000000000000000000000000000000000000);

    event RegisteredWithNFT(
        address indexed provider,
        uint256 indexed tokenId,
        uint256 indexed providerId,
        uint256 stakeAmount
    );

    error ZeroStake();
    error ZeroSigner();
    error EmptyEndpoint();

    /// @notice Required so IdentityRegistry._safeMint() can mint to this contract.
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Mint NFT + register as ArcSLA v2 provider in one tx.
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

        // 1. Mint ERC-8004 AgentIdentity NFT (to this contract).
        //    onERC721Received() above allows _safeMint to succeed.
        tokenId = IIdentityRegistry(IDENTITY_REGISTRY).register(endpoint);

        // 2. Pull USDC from caller -> this contract
        USDC.safeTransferFrom(msg.sender, address(this), stakeAmount);

        // 3. Approve ServiceRegistry to pull USDC from this contract
        USDC.forceApprove(SERVICE_REGISTRY, stakeAmount);

        // 4. Register as v2 provider.
        //    registerV2 checks ownerOf(tokenId) == msg.sender.
        //    Both are this contract here, so the check passes.
        providerId = IServiceRegistry(SERVICE_REGISTRY).registerV2(
            tokenId,
            signer,
            stakeAmount,
            pricePerCall,
            maxResponseTime,
            slashBps,
            endpoint
        );

        // 5. Transfer the NFT to the caller so the user owns their identity.
        IERC721Transfer(IDENTITY_REGISTRY).transferFrom(
            address(this),
            msg.sender,
            tokenId
        );

        emit RegisteredWithNFT(msg.sender, tokenId, providerId, stakeAmount);
    }
}
