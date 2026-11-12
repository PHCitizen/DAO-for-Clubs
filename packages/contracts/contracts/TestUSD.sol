// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

error UnauthorizedCurrencyAdmin();
error InsufficientBalance();
error InsufficientAllowance();
error ZeroAddress();

/**
 * @title TestUSD
 * @notice Shared POC test currency held by treasuries and used to fund event proposals.
 * A separately designated currency administrator can mint it; treasury administration
 * does not confer currency-minting authority.
 */
contract TestUSD {
    string public constant name = "Test USD";
    string public constant symbol = "TUSD";
    uint8 public constant decimals = 18;

    address public immutable currencyAdmin;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(address _currencyAdmin) {
        if (_currencyAdmin == address(0)) revert ZeroAddress();
        currencyAdmin = _currencyAdmin;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != currencyAdmin) revert UnauthorizedCurrencyAdmin();
        if (to == address(0)) revert ZeroAddress();

        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();

        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();

        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = currentAllowance - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
