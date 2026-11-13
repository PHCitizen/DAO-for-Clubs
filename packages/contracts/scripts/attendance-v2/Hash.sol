// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Poseidon2T4_BN254} from "upstream/Poseidon2T4_BN254.sol";

// Evaluation only. Never deployed to RPC; executed in Hardhat's local EVM.
contract Hash {
    function hash(uint256 domain, uint256 a, uint256 b) external pure returns (uint256) {
        return Poseidon2T4_BN254.compress(domain, a, b, 0);
    }
}
