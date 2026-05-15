// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPayPerCall {
    function callService(uint256 providerId, bytes32 requestHash)
        external returns (bytes32 callId);
}
