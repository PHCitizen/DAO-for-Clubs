// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Treasury.sol";

error InvalidTestUsdAddress();
error TreasuryNotFound();

/**
 * @title DAO
 * @notice Organization DAO coordinator.
 * Has no administrator. Anyone can permissionlessly create a treasury.
 * Treasury creation deploys a Treasury contract and assigns msg.sender as its administrator.
 */
contract DAO {
    address public immutable testUsd;

    address[] private _treasuries;
    mapping(address => bool) private _isTreasury;

    event TreasuryCreated(address indexed treasury, address indexed administrator);

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
}
