// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "./base/ERC20.sol";

/// @notice An 18-decimal outcome token (LONG or SHORT). Only the owning Market
/// may mint/burn it.
contract OutcomeToken is ERC20 {
    address public immutable market;

    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol, 18) {
        market = msg.sender;
    }

    modifier onlyMarket() {
        require(msg.sender == market, "Outcome: not market");
        _;
    }

    function mint(address to, uint256 amount) external onlyMarket {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMarket {
        _burn(from, amount);
    }
}
