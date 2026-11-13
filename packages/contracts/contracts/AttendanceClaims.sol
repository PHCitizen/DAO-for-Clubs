// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./DAO.sol";

error NotEventOrganizer();
error RootAlreadyFinalized();
error InvalidAttendanceRoot();
error AttendanceNotFinalized();
error InvalidMerkleProof();
error EntryAlreadyConsumed();

/**
 * @title AttendanceClaims
 * @notice Proof-of-concept opt-in public attendance claims (spec 09).
 *
 * This is a development fixture, not a TODO-01-approved production format:
 * - `finalizeAttendanceRoot` is a stand-in for feature 07's unbuilt
 *   organizer-funded IPFS attendance-publication pipeline. It only records a
 *   root the organizer supplies; it does not pin, validate, or canonicalize
 *   any attendance dataset.
 * - The sorted-pair keccak256 Merkle convention used to verify membership is
 *   a POC choice (see `packages/frontend/src/attendanceMerkle.ts`), not the
 *   canonical cryptographic format TODO-01 is investigating.
 *
 * Entry derivation reuses the frozen v1 credential format from spec 06
 * (`docs/attendance-credentials.md`): entry = sha256(abi.encode(proposalId,
 * secret)). No ZK verifier is required: this purposely discloses the secret
 * and Merkle path on-chain, exactly as the spec 09 user stories describe.
 * Copying a disclosed secret/path lets another sender claim first; this is
 * an accepted weakness, not something this contract defends against. Once
 * an entry is consumed, no sender can ever claim it again.
 */
contract AttendanceClaims {
    DAO public immutable dao;

    /// Organizer-finalized attendance root per proposal; zero until set.
    mapping(uint256 => bytes32) public attendanceRoot;
    /// True once a proposal's root has been finalized; finalization is one-time.
    mapping(uint256 => bool) public attendanceFinalized;
    /// Entries already consumed by a successful public claim, scoped per proposal.
    mapping(uint256 => mapping(bytes32 => bool)) public entryConsumed;

    event AttendanceRootFinalized(uint256 indexed proposalId, bytes32 root);
    /// Intentionally omits the secret/entry preimage relationship beyond the entry itself; never includes the recovery signature.
    event PublicAttendanceClaimed(uint256 indexed proposalId, address indexed claimant, bytes32 indexed entry);

    constructor(address daoAddress) {
        dao = DAO(daoAddress);
    }

    /**
     * @notice Organizer-only, one-time finalization of a proposal's attendance root.
     * @dev Reverts with the DAO's own `ProposalNotFound` for an unknown proposal.
     */
    function finalizeAttendanceRoot(uint256 proposalId, bytes32 root) external {
        DAO.Proposal memory proposal = dao.getProposal(proposalId);
        if (msg.sender != proposal.creator) revert NotEventOrganizer();
        if (attendanceFinalized[proposalId]) revert RootAlreadyFinalized();
        if (root == bytes32(0)) revert InvalidAttendanceRoot();

        attendanceFinalized[proposalId] = true;
        attendanceRoot[proposalId] = root;
        emit AttendanceRootFinalized(proposalId, root);
    }

    /**
     * @notice Derives the entry from `secret`, verifies its membership against
     * the proposal's finalized root, and records a permanent public
     * association for the transaction sender. Reverts without recording
     * anything if the proof or secret is wrong, the root is not finalized,
     * or the derived entry was already consumed (by any sender).
     */
    function claimPublicAttendance(uint256 proposalId, bytes32 secret, bytes32[] calldata proof) external {
        if (!attendanceFinalized[proposalId]) revert AttendanceNotFinalized();

        bytes32 entry = sha256(abi.encode(proposalId, secret));
        if (entryConsumed[proposalId][entry]) revert EntryAlreadyConsumed();
        if (!_verifyProof(proof, attendanceRoot[proposalId], entry)) revert InvalidMerkleProof();

        entryConsumed[proposalId][entry] = true;
        emit PublicAttendanceClaimed(proposalId, msg.sender, entry);
    }

    function _verifyProof(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computed = _hashPair(computed, proof[i]);
        }
        return computed == root;
    }

    /// @dev Commutative pair hashing: proof order does not depend on left/right position.
    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }
}
