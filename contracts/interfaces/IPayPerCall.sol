// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPayPerCall {
    function callService(uint256 providerId, bytes32 requestHash)
        external returns (bytes32 callId);

    function callServiceFor(uint256 providerId, bytes32 requestHash, address beneficiary)
        external returns (bytes32 callId);

    function callServiceWithAuthorization(
        uint256 providerId,
        bytes32 requestHash,
        address beneficiary,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 authNonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bytes32 callId);
}
