// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "./base/ERC20.sol";

/// @notice Test USDC (6 decimals) with an open, capped faucet. TESTNET ONLY.
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_CAP = 10_000 * 1e6; // 10k USDC per call
    address public immutable deployer;

    constructor() ERC20("Mock USD Coin", "USDC", 6) {
        deployer = msg.sender;
    }

    /// @notice Public faucet for testnet funding. Deployer may mint any amount
    /// (for seeding/admin); everyone else is capped per call.
    function mint(address to, uint256 amount) external {
        if (msg.sender != deployer) {
            require(amount <= FAUCET_CAP, "USDC: over faucet cap");
        }
        _mint(to, amount);
    }
}
