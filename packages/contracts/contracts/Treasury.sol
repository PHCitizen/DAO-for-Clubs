// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

error UnauthorizedCaller();
error ZeroAddressParam();
error InsufficientFundingAssetBalance();

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

    event FundsReleased(address indexed recipient, uint256 amount);

    constructor(address _administrator, address _fundingAsset) {
        if (_administrator == address(0) || _fundingAsset == address(0)) revert ZeroAddressParam();
        administrator = _administrator;
        dao = msg.sender;
        fundingAsset = _fundingAsset;
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
