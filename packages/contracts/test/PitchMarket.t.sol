// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {Market} from "../src/Market.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Resolver} from "../src/Resolver.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";

contract PitchMarketTest is Test {
    MockUSDC usdc;
    Resolver resolver;
    MarketFactory factory;
    Market market;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant SEED = 1000e6; // 1000 USDC
    uint256 constant ONE_USDC = 1e6;
    uint256 constant ONE_TOKEN = 1e18;

    function setUp() public {
        usdc = new MockUSDC();
        resolver = new Resolver(owner, 600); // 10 min window
        factory = new MarketFactory(owner, address(usdc), address(resolver));

        usdc.mint(owner, 1_000_000e6);
        usdc.approve(address(factory), type(uint256).max);
        address m = factory.createMarket(10, 42, uint64(block.timestamp + 1 hours), SEED);
        market = Market(m);

        // fund traders
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);
        vm.prank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(market), type(uint256).max);
    }

    // ---------- MockUSDC ----------

    function test_usdc_decimals_and_faucet() public {
        assertEq(usdc.decimals(), 6);
        uint256 before = usdc.balanceOf(alice);
        usdc.mint(alice, 100e6);
        assertEq(usdc.balanceOf(alice), before + 100e6);
    }

    function test_usdc_faucet_cap() public {
        // non-deployer is capped per call
        vm.prank(alice);
        vm.expectRevert("USDC: over faucet cap");
        usdc.mint(alice, 20_000e6);
    }

    // ---------- OutcomeToken ----------

    function test_outcome_only_market_can_mint() public {
        OutcomeToken long = market.long();
        vm.expectRevert("Outcome: not market");
        long.mint(alice, 1e18);
    }

    // ---------- seeding / pricing ----------

    function test_seed_sets_price_half() public {
        assertEq(market.priceLong18(), 0.5e18);
        assertEq(market.reserveLong(), SEED * 1e12);
        assertEq(market.reserveShort(), SEED * 1e12);
    }

    function test_price_parity() public {
        assertEq(market.priceLong18() + market.priceShort18(), 1e18);
    }

    // ---------- PARITY with TS model (packages/shared/src/market/fpmm.ts) ----------
    // Seed 1000 USDC, buy LONG with 100 USDC:
    // buyAmount = ri + inv - floor(ri*rj/(rj+inv))
    //           = 1100e18 - floor(1e42 / 1.1e21) = 190909090909090909091
    function test_parity_calcBuy_exact() public {
        uint256 out = market.calcBuy(true, 100e6);
        assertEq(out, 190909090909090909091);
    }

    // ---------- trading mechanics ----------

    function test_buy_long_raises_price() public {
        uint256 before = market.priceLong18();
        vm.prank(alice);
        market.buy(true, 100e6, 0);
        assertGt(market.priceLong18(), before);
    }

    function test_buy_short_lowers_long_price() public {
        uint256 before = market.priceLong18();
        vm.prank(alice);
        market.buy(false, 100e6, 0);
        assertLt(market.priceLong18(), before);
    }

    function test_buy_then_sell_roundtrip_no_value_creation() public {
        vm.startPrank(alice);
        uint256 usdcBefore = usdc.balanceOf(alice);
        uint256 tokens = market.buy(true, 500e6, 0);
        market.long().approve(address(market), type(uint256).max);
        market.sell(true, tokens, 0);
        uint256 usdcAfter = usdc.balanceOf(alice);
        vm.stopPrank();
        // never get back more than put in
        assertLe(usdcAfter, usdcBefore);
        // and lose at most a tiny rounding amount on a deep-ish book
        assertGe(usdcAfter, usdcBefore - 2e6);
    }

    function test_slippage_guard() public {
        vm.prank(alice);
        vm.expectRevert("Market: slippage");
        market.buy(true, 100e6, 1_000_000e18); // demand impossibly many tokens
    }

    // ---------- settlement & redemption ----------

    function test_redeem_long_pays_ps_over_100() public {
        vm.prank(alice);
        uint256 tokens = market.buy(true, 100e6, 0);

        _resolve(75);

        vm.startPrank(alice);
        market.long().approve(address(market), type(uint256).max);
        uint256 before = usdc.balanceOf(alice);
        market.redeem(tokens, 0);
        uint256 got = usdc.balanceOf(alice) - before;
        vm.stopPrank();

        assertEq(got, (tokens * 75) / 100 / 1e12);
    }

    function test_redeem_short_pays_inverse() public {
        vm.prank(bob);
        uint256 tokens = market.buy(false, 100e6, 0);
        _resolve(30);
        vm.startPrank(bob);
        market.short().approve(address(market), type(uint256).max);
        uint256 before = usdc.balanceOf(bob);
        market.redeem(0, tokens);
        uint256 got = usdc.balanceOf(bob) - before;
        vm.stopPrank();
        assertEq(got, (tokens * 70) / 100 / 1e12);
    }

    function test_cannot_trade_after_resolve() public {
        _resolve(50);
        vm.prank(alice);
        vm.expectRevert("Market: not open");
        market.buy(true, 100e6, 0);
    }

    function test_void_refunds_at_last_price() public {
        vm.prank(alice);
        uint256 tokens = market.buy(true, 100e6, 0);
        uint256 lastPrice = market.priceLong18();

        vm.prank(owner);
        resolver.voidMarket(address(market));
        assertEq(uint8(market.phase()), uint8(Market.Phase.VOID));
        assertEq(market.voidPriceLong18(), lastPrice);

        // alice redeems her LONG at the snapshot price (fair-value refund)
        vm.startPrank(alice);
        market.long().approve(address(market), type(uint256).max);
        uint256 before = usdc.balanceOf(alice);
        market.redeem(tokens, 0);
        uint256 got = usdc.balanceOf(alice) - before;
        vm.stopPrank();
        assertEq(got, (tokens * lastPrice) / 1e18 / 1e12);
    }

    // ---------- resolver ----------

    function test_resolver_propose_finalize_window() public {
        vm.prank(owner);
        resolver.proposeScore(address(market), 80, "v1");
        // too early
        vm.expectRevert("Resolver: window");
        resolver.finalizeScore(address(market));
        // after window
        vm.warp(block.timestamp + 601);
        resolver.finalizeScore(address(market));
        assertEq(uint8(market.phase()), uint8(Market.Phase.RESOLVED));
        assertEq(market.settledPS(), 80);
    }

    function test_resolver_cancel_proposal() public {
        vm.prank(owner);
        resolver.proposeScore(address(market), 80, "v1");
        vm.prank(owner);
        resolver.cancelProposal(address(market));
        vm.warp(block.timestamp + 601);
        vm.expectRevert("Resolver: none");
        resolver.finalizeScore(address(market));
    }

    function test_only_resolver_can_resolve() public {
        vm.expectRevert("Market: not resolver");
        market.resolve(50, "v1");
    }

    // ---------- factory ----------

    function test_factory_registers_market() public {
        assertEq(factory.getMarket(10, 42), address(market));
        assertEq(factory.marketCount(), 1);
    }

    function test_factory_no_duplicate() public {
        vm.expectRevert("Factory: exists");
        factory.createMarket(10, 42, uint64(block.timestamp + 1 hours), SEED);
    }

    // ---------- fuzz: collateralization ----------

    function testFuzz_buy_keeps_collateralized(uint96 amt, bool isLong) public {
        amt = uint96(bound(amt, 1e6, 50_000e6));
        vm.prank(alice);
        market.buy(isLong, amt, 0);
        assertGe(usdc.balanceOf(address(market)), market.requiredCollateral());
    }

    function testFuzz_price_stays_bounded(uint96 amt, bool isLong) public {
        amt = uint96(bound(amt, 1e6, 200_000e6));
        usdc.mint(alice, amt); // minted by deployer (this contract) -> uncapped
        vm.prank(alice);
        market.buy(isLong, amt, 0);
        uint256 p = market.priceLong18();
        assertGt(p, 0);
        assertLt(p, 1e18);
    }

    // ---------- helpers ----------

    function _resolve(uint8 ps) internal {
        vm.prank(owner);
        resolver.proposeScore(address(market), ps, "v1");
        vm.warp(block.timestamp + 601);
        resolver.finalizeScore(address(market));
    }

    function resolverEOA() internal view returns (address) {
        return address(resolver);
    }
}
