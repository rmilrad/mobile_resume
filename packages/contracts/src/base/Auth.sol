// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal ownership + reentrancy guard (no external deps).
abstract contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed from, address indexed to);

    constructor(address _owner) {
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Auth: not owner");
        _;
    }

    function transferOwnership(address to) external onlyOwner {
        require(to != address(0), "Auth: zero owner");
        emit OwnershipTransferred(owner, to);
        owner = to;
    }
}

abstract contract ReentrancyGuard {
    uint256 private _lock = 1;

    modifier nonReentrant() {
        require(_lock == 1, "Reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }
}
