// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Treasury.sol";

error InvalidTestUsdAddress();
error TreasuryNotFound();
error TreasuryNotRegistered();
error InvalidProposalAmount();
error InvalidVotingDeadline();
error InvalidDocumentReference();
error ProposalNotFound();

/**
 * @title DAO
 * @notice Organization DAO coordinator.
 * Has no administrator. Anyone can permissionlessly create a treasury.
 * Treasury creation deploys a Treasury contract and assigns msg.sender as its administrator.
 * Anyone can also create an event proposal against a registered treasury; proposal
 * creation does not require any voting NFTs to exist.
 */
contract DAO {
    address public immutable testUsd;

    address[] private _treasuries;
    mapping(address => bool) private _isTreasury;

    /**
     * @notice Immutable event proposal terms.
     * The creator is the event organizer and is always the payout recipient.
     * `documentReference` is the content-addressed proposal-document reference
     * (for example `ipfs://<cid>`). No field can be changed after creation.
     */
    struct Proposal {
        uint256 id;
        address treasury;
        address creator;
        uint256 amount;
        address payoutRecipient;
        uint256 votingDeadline;
        string documentReference;
    }

    /// DAO-wide proposal sequence; IDs start at 1 and are shared by all treasuries.
    uint256 public proposalCount;
    mapping(uint256 => Proposal) private _proposals;

    event TreasuryCreated(address indexed treasury, address indexed administrator);
    event ProposalCreated(
        uint256 indexed id,
        address indexed treasury,
        address indexed creator,
        uint256 amount,
        address payoutRecipient,
        uint256 votingDeadline,
        string documentReference
    );

    constructor(address _testUsd) {
        if (_testUsd == address(0)) revert InvalidTestUsdAddress();
        testUsd = _testUsd;
    }

    /**
     * @notice Permissionlessly creates a new Treasury and registers it.
     * The caller is assigned as the administrator of the created treasury.
     * @return treasuryAddress The address of the newly deployed Treasury.
     */
    function createTreasury() external returns (address treasuryAddress) {
        Treasury treasury = new Treasury(msg.sender, testUsd);
        treasuryAddress = address(treasury);

        _treasuries.push(treasuryAddress);
        _isTreasury[treasuryAddress] = true;

        emit TreasuryCreated(treasuryAddress, msg.sender);
    }

    /**
     * @notice Returns the total number of registered treasuries.
     */
    function treasuryCount() external view returns (uint256) {
        return _treasuries.length;
    }

    /**
     * @notice Returns all registered treasury addresses.
     */
    function getTreasuries() external view returns (address[] memory) {
        return _treasuries;
    }

    /**
     * @notice Returns a registered treasury address by its index.
     */
    function getTreasuryAt(uint256 index) external view returns (address) {
        if (index >= _treasuries.length) revert TreasuryNotFound();
        return _treasuries[index];
    }

    /**
     * @notice Checks whether an address is a treasury created by this DAO.
     */
    function isTreasury(address treasury) external view returns (bool) {
        return _isTreasury[treasury];
    }

    /**
     * @notice Creates an immutable event proposal against a registered treasury.
     * The caller becomes both creator (event organizer) and payout recipient.
     * Anyone may propose, including when the treasury has zero voting NFT supply.
     * @param treasury Registered treasury that would fund the event.
     * @param amount Requested TestUSD amount in the asset's smallest unit; must be positive.
     * @param votingDeadline Unix timestamp after which voting closes; must be in the future.
     * @param documentReference Content-addressed proposal-document reference; must be non-empty.
     * @return proposalId The DAO-wide incrementing proposal ID.
     */
    function createProposal(
        address treasury,
        uint256 amount,
        uint256 votingDeadline,
        string calldata documentReference
    ) external returns (uint256 proposalId) {
        if (!_isTreasury[treasury]) revert TreasuryNotRegistered();
        if (amount == 0) revert InvalidProposalAmount();
        if (votingDeadline <= block.timestamp) revert InvalidVotingDeadline();
        if (bytes(documentReference).length == 0) revert InvalidDocumentReference();

        proposalId = ++proposalCount;
        _proposals[proposalId] = Proposal({
            id: proposalId,
            treasury: treasury,
            creator: msg.sender,
            amount: amount,
            payoutRecipient: msg.sender,
            votingDeadline: votingDeadline,
            documentReference: documentReference
        });

        emit ProposalCreated(
            proposalId,
            treasury,
            msg.sender,
            amount,
            msg.sender,
            votingDeadline,
            documentReference
        );
    }

    /**
     * @notice Returns the immutable terms of a proposal.
     * This is the read interface consumed by voting, payouts, and attendance.
     */
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        if (proposalId == 0 || proposalId > proposalCount) revert ProposalNotFound();
        return _proposals[proposalId];
    }
}
