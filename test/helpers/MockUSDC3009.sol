// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { MockUSDC } from "./MockUSDC.sol";

/// @title MockUSDC3009
/// @notice Test-only USDC with a permissive EIP-3009 surface. Signature
///         verification is intentionally out of scope here; these tests exercise
///         PayPerCallV8's authorization state checks and settlement ordering.
contract MockUSDC3009 is MockUSDC {
    mapping(address => mapping(bytes32 => bool)) private _authorizationState;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationState[authorizer][nonce];
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256,
        uint256,
        bytes32 nonce,
        uint8,
        bytes32,
        bytes32
    ) external {
        require(!_authorizationState[from][nonce], "authorization used");
        _authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }
}
