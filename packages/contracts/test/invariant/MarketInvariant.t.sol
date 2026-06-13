// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {Market} from "../../src/Market.sol";
import {MarketFactory} from "../../src/MarketFactory.sol";
import {Resolver} from "../../src/Resolver.sol";
import {OutcomeToken} from "../../src/OutcomeToken.sol";

/// @dev Stateful handler that performs random buys/sells against one market.
contract Handler is Test {
    Market public market;
    MockUSDC public usdc;

    uint256 public buys;
    uint256 public sells;

    constructor(Market _market, MockUSDC _usdc) {
        market = _market;
        usdc = _usdc;
        usdc.approve(address(market), type(uint256).max);
        market.long().approve(address(market), type(uint256).max);
        market.short().approve(address(market), type(uint256).max);
    }

    function buy(uint256 amt, bool isLong) public {
        amt = bound(amt, 1e6, 100_000e6);
        if (usdc.balanceOf(address(this)) < amt) return;
        try market.buy(isLong, amt, 0) {
            buys++;
        } catch {}
    }

    function sell(uint256 amt, bool isLong) public {
        OutcomeToken tok = isLong ? market.long() : market.short();
        uint256 bal = tok.balanceOf(address(this));
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        try market.sell(isLong, amt, 0) {
            sells++;
        } catch {}
    }
}

contract MarketInvariantTest is Test {
    MockUSDC usdc;
    Resolver resolver;
    MarketFactory factory;
    Market market;
    Handler handler;

    function setUp() public {
        usdc = new MockUSDC();
        resolver = new Resolver(address(this), 600);
        factory = new MarketFactory(address(this), address(usdc), address(resolver));
        usdc.mint(address(this), 1_000_000e6);
        usdc.approve(address(factory), type(uint256).max);
        market = Market(factory.createMarket(1, 1, uint64(block.timestamp + 1 days), 5000e6));

        handler = new Handler(market, usdc);
        usdc.mint(address(handler), 100_000_000e6); // deployer mint -> uncapped
        targetContract(address(handler));
    }

    /// @notice INVARIANT 1: the vault is always fully collateralized.
    function invariant_fullyCollateralized() public view {
        assertGe(usdc.balanceOf(address(market)), market.requiredCollateral());
    }

    /// @notice INVARIANT 2: LONG price is strictly within (0,1).
    function invariant_priceBounds() public view {
        uint256 p = market.priceLong18();
        assertGt(p, 0);
        assertLt(p, 1e18);
    }

    /// @notice INVARIANT 3: complete-set parity (supplies balanced pre-settlement).
    function invariant_supplyParity() public view {
        assertEq(market.long().totalSupply(), market.short().totalSupply());
    }

    /// @notice INVARIANT 4: AMM reserves never exceed token supply.
    function invariant_reservesSane() public view {
        assertLe(market.reserveLong(), market.long().totalSupply());
        assertLe(market.reserveShort(), market.short().totalSupply());
    }
}
