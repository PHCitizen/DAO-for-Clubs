// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IReleasingDao {
    function releaseFunds(uint256 proposalId) external returns (bool);
}

/**
 * @title MisbehavingFundingToken
 * @notice TEST DOUBLE ONLY. A funding asset that always reports an ample balance but
 * fails or abuses `transfer`, to prove the DAO never records a failed transfer as paid.
 */
contract MisbehavingFundingToken {
    enum Mode { Revert, ReturnFalse, Reenter }

    Mode public mode;
    IReleasingDao public dao;
    uint256 public reentryProposalId;
    /// Revert data the DAO produced when this token re-entered `releaseFunds`; empty if it never did or the DAO accepted it.
    bytes public reentryRevertData;
    bool public reentrySucceeded;

    function configure(Mode _mode, address _dao, uint256 proposalId) external {
        mode = _mode;
        dao = IReleasingDao(_dao);
        reentryProposalId = proposalId;
    }

    function balanceOf(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    function transfer(address, uint256) external returns (bool) {
        if (mode == Mode.Revert) revert("transfer refused");
        if (mode == Mode.ReturnFalse) return false;
        try dao.releaseFunds(reentryProposalId) returns (bool) {
            reentrySucceeded = true;
        } catch (bytes memory reason) {
            reentryRevertData = reason;
        }
        return true;
    }
}
