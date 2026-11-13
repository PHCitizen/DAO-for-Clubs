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
error VotingClosed();
error BallotAlreadyCast();
error NotVotingNftHolder();
error InsufficientYesVotes();
error NotProposalCreator();
error ProposalNotPassed();
error FundsAlreadyReleased();
error ReentrantCall();

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

    struct VotingResult {
        uint256 yesVotes;
        uint256 noVotes;
        bool passingRecorded;
    }

    mapping(uint256 => VotingResult) private _voting;
    mapping(uint256 => mapping(uint256 => bool)) public ballotConsumed;

    event YesVoteCast(uint256 indexed proposalId, uint256 indexed tokenId, address indexed voter);
    event NoVoteCast(uint256 indexed proposalId, uint256 indexed tokenId, address indexed voter);
    event ProposalPassed(uint256 indexed proposalId);

    /// True once a proposal's fixed allocation has actually been paid; set exactly once.
    mapping(uint256 => bool) public fundsReleased;
    /// True only while the latest release attempt had sufficient balance but the asset refused the transfer; cleared by a later shortage or a successful payment.
    mapping(uint256 => bool) public paymentFailed;
    bool private _releasing;

    /// Emitted only when TestUSD actually moved to the proposal's fixed recipient.
    event FundsReleased(uint256 indexed proposalId, address indexed treasury, address indexed recipient, uint256 amount);
    /// Emitted when a release request found the treasury unable to pay; nothing moved and nothing was marked paid.
    event FundingShortage(uint256 indexed proposalId, uint256 available, uint256 required);
    /// Emitted when the balance sufficed but the asset's transfer failed; the payment was rolled back and the proposal stays retryable.
    event FundsTransferFailed(uint256 indexed proposalId, address indexed treasury, uint256 amount);

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

    /// @notice One immutable ballot per treasury credential per proposal.
    function voteYes(uint256 proposalId, uint256 tokenId) external {
        _castVote(proposalId, tokenId, true);
    }

    function voteNo(uint256 proposalId, uint256 tokenId) external {
        _castVote(proposalId, tokenId, false);
    }

    function _castVote(uint256 proposalId, uint256 tokenId, bool support) internal {
        Proposal storage proposal = _requireOpenVote(proposalId);
        if (ballotConsumed[proposalId][tokenId]) revert BallotAlreadyCast();
        if (Treasury(proposal.treasury).ownerOf(tokenId) != msg.sender) revert NotVotingNftHolder();
        ballotConsumed[proposalId][tokenId] = true;
        if (support) {
            _voting[proposalId].yesVotes++;
            emit YesVoteCast(proposalId, tokenId, msg.sender);
        } else {
            _voting[proposalId].noVotes++;
            emit NoVoteCast(proposalId, tokenId, msg.sender);
        }
        _recordPassingIfQualified(proposalId);
    }

    /**
     * @notice Permissionless passing check, reusable by fund release.
     * Records the same passing result as a qualifying ballot without requiring
     * a new vote; used after membership changes make retained yes votes
     * sufficient under the current threshold. Requires an open vote (not yet
     * passed, and before the deadline) and sufficient recorded yes votes
     * under the current supply. Passing never touches treasury funds.
     */
    function checkPassing(uint256 proposalId) external returns (bool passingRecorded) {
        _requireOpenVote(proposalId);
        if (_voting[proposalId].yesVotes < _yesThreshold(proposalId)) revert InsufficientYesVotes();
        return _recordPassingIfQualified(proposalId);
    }

    /// @dev Shared open-vote guard for later ballot and passing-check actions.
    function _requireOpenVote(uint256 proposalId) internal view returns (Proposal storage proposal) {
        if (proposalId == 0 || proposalId > proposalCount) revert ProposalNotFound();
        proposal = _proposals[proposalId];
        if (_voting[proposalId].passingRecorded || block.timestamp >= proposal.votingDeadline) revert VotingClosed();
    }

    /// @dev Call only after the open-vote guard. Passing never touches funds.
    function _recordPassingIfQualified(uint256 proposalId) internal returns (bool) {
        VotingResult storage result = _voting[proposalId];
        if (!result.passingRecorded && result.yesVotes >= _yesThreshold(proposalId)) {
            result.passingRecorded = true;
            emit ProposalPassed(proposalId);
        }
        return result.passingRecorded;
    }

    /**
     * @notice Creator-controlled payment of a passed proposal's fixed allocation.
     * Only the recorded creator may call; payment goes to the immutable payout
     * recipient and amount. A passing result remains payable after vote close;
     * a proposal that never passed is not. The actual treasury balance at
     * execution decides: a shortage does not revert, it emits FundingShortage,
     * moves nothing and leaves the proposal unpaid and retryable; an asset that
     * fails the transfer likewise rolls back and emits FundsTransferFailed. A receipt is
     * therefore not proof of payment; look for FundsReleased / fundsReleased.
     * @return paid True only if TestUSD actually moved.
     */
    function releaseFunds(uint256 proposalId) external returns (bool paid) {
        if (_releasing) revert ReentrantCall();
        if (proposalId == 0 || proposalId > proposalCount) revert ProposalNotFound();
        Proposal storage proposal = _proposals[proposalId];
        if (msg.sender != proposal.creator) revert NotProposalCreator();
        if (!_voting[proposalId].passingRecorded) revert ProposalNotPassed();
        if (fundsReleased[proposalId]) revert FundsAlreadyReleased();

        uint256 available = IERC20Token(testUsd).balanceOf(proposal.treasury);
        if (available < proposal.amount) {
            // The latest attempt is a shortage, not a refused transfer: no stale failure state.
            paymentFailed[proposalId] = false;
            emit FundingShortage(proposalId, available, proposal.amount);
            return false;
        }

        // Checks-effects-interactions plus a lock: state is final before funds move.
        _releasing = true;
        fundsReleased[proposalId] = true;
        try Treasury(proposal.treasury).releaseFunds(proposal.payoutRecipient, proposal.amount) {
            paymentFailed[proposalId] = false;
            emit FundsReleased(proposalId, proposal.treasury, proposal.payoutRecipient, proposal.amount);
            paid = true;
        } catch {
            // The asset refused the transfer: undo, so a failed transfer is never paid state.
            fundsReleased[proposalId] = false;
            paymentFailed[proposalId] = true;
            emit FundsTransferFailed(proposalId, proposal.treasury, proposal.amount);
        }
        _releasing = false;
    }

    function _yesThreshold(uint256 proposalId) internal view returns (uint256) {
        return Treasury(_proposals[proposalId].treasury).totalSupply() / 2 + 1;
    }

    /// @notice Coherent live progress and outcome using chain time, not client time.
    function getVoting(uint256 proposalId) external view returns (
        uint256 yesVotes, uint256 threshold, bool passingRecorded, bool open, uint256 noVotes
    ) {
        if (proposalId == 0 || proposalId > proposalCount) revert ProposalNotFound();
        VotingResult storage result = _voting[proposalId];
        return (result.yesVotes, _yesThreshold(proposalId), result.passingRecorded,
            !result.passingRecorded && block.timestamp < _proposals[proposalId].votingDeadline, result.noVotes);
    }
}
