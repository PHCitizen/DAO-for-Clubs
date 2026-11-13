// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

error UnauthorizedCaller();
error ZeroAddressParam();
error InsufficientFundingAssetBalance();
error NonexistentVotingNft();
error VotingNftTransferDisabled();

interface IERC20Token {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title Treasury
 * @notice An event-funding pool created through the DAO.
 * Its creator is its administrator and will control minting and burning of that treasury's
 * voting NFTs. The treasury holds shared TestUSD for event proposals.
 * Arbitrary administrator withdrawals are explicitly prohibited.
 */
contract Treasury {
    address public immutable administrator;
    address public immutable dao;
    address public immutable fundingAsset;

    /// Live voting NFT supply for this treasury.
    uint256 public totalSupply;
    /// Monotonic allocator; token IDs start at 1 and are never reused.
    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256[]) private _holderTokens;
    mapping(uint256 => uint256) private _holderTokenIndex;

    event FundsReleased(address indexed recipient, uint256 amount);
    /// ERC-721 mint event: voting NFT identity is (this treasury, tokenId).
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    constructor(address _administrator, address _fundingAsset) {
        if (_administrator == address(0) || _fundingAsset == address(0)) revert ZeroAddressParam();
        administrator = _administrator;
        dao = msg.sender;
        fundingAsset = _fundingAsset;
    }

    /**
     * @notice Mints a fresh non-transferable voting NFT to a holder.
     * Only this treasury's administrator may mint; token IDs are allocated
     * monotonically and never reused, even after a later burn.
     */
    function mintVotingNft(address holder) external returns (uint256 tokenId) {
        if (msg.sender != administrator) revert UnauthorizedCaller();
        if (holder == address(0)) revert ZeroAddressParam();

        tokenId = _nextTokenId++;
        _ownerOf[tokenId] = holder;
        _holderTokenIndex[tokenId] = _holderTokens[holder].length;
        _holderTokens[holder].push(tokenId);
        totalSupply += 1;

        emit Transfer(address(0), holder, tokenId);
    }

    /// Removes current membership only; proposal ballots and consumption are untouched.
    function burnVotingNft(uint256 tokenId) external {
        if (msg.sender != administrator) revert UnauthorizedCaller();
        address holder = _ownerOf[tokenId];
        if (holder == address(0)) revert NonexistentVotingNft();

        uint256[] storage tokens = _holderTokens[holder];
        uint256 index = _holderTokenIndex[tokenId];
        uint256 lastTokenId = tokens[tokens.length - 1];
        tokens[index] = lastTokenId;
        _holderTokenIndex[lastTokenId] = index;
        tokens.pop();
        delete _holderTokenIndex[tokenId];
        delete _ownerOf[tokenId];
        totalSupply -= 1;
        emit Transfer(holder, address(0), tokenId);
    }

    /// Current owner of a voting NFT minted by this treasury.
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _ownerOf[tokenId];
        if (owner == address(0)) revert NonexistentVotingNft();
        return owner;
    }

    /// Number of live voting NFTs held by `holder` in this treasury.
    function balanceOf(address holder) external view returns (uint256) {
        return _holderTokens[holder].length;
    }

    /// Token IDs of the live voting NFTs held by `holder` in this treasury.
    function tokensOfHolder(address holder) external view returns (uint256[] memory) {
        return _holderTokens[holder];
    }

    /// Voting NFTs are non-transferable; every transfer path rejects.
    function transferFrom(address, address, uint256) external pure {
        revert VotingNftTransferDisabled();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert VotingNftTransferDisabled();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert VotingNftTransferDisabled();
    }

    function approve(address, uint256) external pure {
        revert VotingNftTransferDisabled();
    }

    function setApprovalForAll(address, bool) external pure {
        revert VotingNftTransferDisabled();
    }

    /**
     * @notice Narrowly scoped integration interface for proposal fund release.
     * Can only be triggered by the DAO or authorized proposal executor;
     * arbitrary administrator withdrawals are disallowed.
     */
    function releaseFunds(address recipient, uint256 amount) external {
        if (msg.sender != dao) revert UnauthorizedCaller();
        if (recipient == address(0)) revert ZeroAddressParam();

        bool success = IERC20Token(fundingAsset).transfer(recipient, amount);
        if (!success) revert InsufficientFundingAssetBalance();

        emit FundsReleased(recipient, amount);
    }
}
