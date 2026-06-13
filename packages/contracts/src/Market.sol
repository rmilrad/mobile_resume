// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OutcomeToken} from "./OutcomeToken.sol";
import {ReentrancyGuard} from "./base/Auth.sol";
import {Math} from "./base/Math.sol";

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @notice Scalar LONG/SHORT performance market for one (player, fixture).
/// Complete-set minting keeps the vault fully collateralized; a Gnosis-style
/// Fixed Product Market Maker provides continuous pricing in (0,1) USDC.
/// Settlement pays LONG = PS/100, SHORT = (100-PS)/100.
/// Mirrors packages/shared/src/market/fpmm.ts exactly.
contract Market is ReentrancyGuard {
    /// USDC (6dp) -> outcome token (18dp) scaling.
    uint256 public constant SCALE = 1e12;

    enum Phase {
        OPEN,
        FROZEN,
        RESOLVED,
        VOID
    }

    IERC20 public immutable collateral;
    OutcomeToken public immutable long;
    OutcomeToken public immutable short;
    address public immutable resolver;
    address public immutable owner; // LP / liquidity seeder
    uint256 public immutable playerId;
    uint256 public immutable fixtureId;
    uint64 public immutable kickoffFreezeAt;

    uint256 public reserveLong; // 18dp
    uint256 public reserveShort; // 18dp
    Phase public phase;
    uint8 public settledPS; // 0..100
    string public psVersion;
    uint256 public voidPriceLong18; // last LONG price snapshot when voided
    bool private _seeded;

    event Seeded(uint256 usdc, uint256 reserves);
    event Bought(address indexed who, bool isLong, uint256 usdcIn, uint256 tokensOut);
    event Sold(address indexed who, bool isLong, uint256 tokensIn, uint256 usdcOut);
    event Frozen();
    event Resolved(uint8 ps, string version);
    event Voided();
    event Redeemed(address indexed who, uint256 longIn, uint256 shortIn, uint256 usdcOut);

    modifier onlyResolver() {
        require(msg.sender == resolver, "Market: not resolver");
        _;
    }

    constructor(
        address _collateral,
        uint256 _playerId,
        uint256 _fixtureId,
        uint64 _kickoffFreezeAt,
        address _resolver,
        address _owner
    ) {
        collateral = IERC20(_collateral);
        playerId = _playerId;
        fixtureId = _fixtureId;
        kickoffFreezeAt = _kickoffFreezeAt;
        resolver = _resolver;
        owner = _owner;
        long = new OutcomeToken("PitchMarket LONG", "pmLONG");
        short = new OutcomeToken("PitchMarket SHORT", "pmSHORT");
    }

    /// @notice Seed initial liquidity. Caller must have transferred `usdc` first.
    function seed(uint256 usdc) external {
        require(!_seeded, "Market: seeded");
        require(msg.sender == owner, "Market: not owner");
        require(collateral.balanceOf(address(this)) >= usdc, "Market: no funds");
        _seeded = true;
        uint256 sets = usdc * SCALE;
        long.mint(address(this), sets);
        short.mint(address(this), sets);
        reserveLong = sets;
        reserveShort = sets;
        emit Seeded(usdc, sets);
    }

    // ---------------- pricing (mirrors fpmm.ts) ----------------

    function priceLong18() public view returns (uint256) {
        return (reserveShort * 1e18) / (reserveLong + reserveShort);
    }

    function priceShort18() external view returns (uint256) {
        return 1e18 - priceLong18();
    }

    function calcBuy(bool isLong, uint256 usdcIn) public view returns (uint256) {
        require(usdcIn > 0, "Market: zero in");
        uint256 inv = usdcIn * SCALE;
        (uint256 ri, uint256 rj) = isLong ? (reserveLong, reserveShort) : (reserveShort, reserveLong);
        // buyAmount = ri + inv - floor(ri*rj / (rj + inv))
        return ri + inv - (ri * rj) / (rj + inv);
    }

    function calcSell(bool isLong, uint256 tokensIn) public view returns (uint256) {
        require(tokensIn > 0, "Market: zero in");
        (uint256 ri, uint256 rj) = isLong ? (reserveLong, reserveShort) : (reserveShort, reserveLong);
        uint256 sum = ri + rj + tokensIn;
        uint256 disc = sum * sum - 4 * tokensIn * rj;
        uint256 R = (sum - Math.sqrt(disc)) / 2; // set units (18dp)
        return R / SCALE; // USDC (6dp), floored
    }

    // ---------------- trading ----------------

    function buy(bool isLong, uint256 usdcIn, uint256 minTokensOut)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        require(phase == Phase.OPEN, "Market: not open");
        tokensOut = calcBuy(isLong, usdcIn);
        require(tokensOut >= minTokensOut, "Market: slippage");

        require(collateral.transferFrom(msg.sender, address(this), usdcIn), "Market: pay");

        uint256 inv = usdcIn * SCALE;
        long.mint(address(this), inv);
        short.mint(address(this), inv);
        reserveLong += inv;
        reserveShort += inv;

        if (isLong) {
            reserveLong -= tokensOut;
            long.transfer(msg.sender, tokensOut);
        } else {
            reserveShort -= tokensOut;
            short.transfer(msg.sender, tokensOut);
        }
        emit Bought(msg.sender, isLong, usdcIn, tokensOut);
    }

    function sell(bool isLong, uint256 tokensIn, uint256 minUsdcOut)
        external
        nonReentrant
        returns (uint256 usdcOut)
    {
        require(phase == Phase.OPEN, "Market: not open");
        usdcOut = calcSell(isLong, tokensIn);
        require(usdcOut > 0, "Market: dust");
        require(usdcOut >= minUsdcOut, "Market: slippage");
        uint256 setsBurned = usdcOut * SCALE;

        if (isLong) {
            long.transferFrom(msg.sender, address(this), tokensIn);
            reserveLong += tokensIn;
        } else {
            short.transferFrom(msg.sender, address(this), tokensIn);
            reserveShort += tokensIn;
        }

        require(reserveLong >= setsBurned && reserveShort >= setsBurned, "Market: reserves");
        reserveLong -= setsBurned;
        reserveShort -= setsBurned;
        long.burn(address(this), setsBurned);
        short.burn(address(this), setsBurned);

        require(collateral.transfer(msg.sender, usdcOut), "Market: pay out");
        emit Sold(msg.sender, isLong, tokensIn, usdcOut);
    }

    // ---------------- settlement ----------------

    function freeze() external onlyResolver {
        require(phase == Phase.OPEN, "Market: not open");
        phase = Phase.FROZEN;
        emit Frozen();
    }

    function resolve(uint8 ps, string calldata version) external onlyResolver {
        require(phase == Phase.OPEN || phase == Phase.FROZEN, "Market: settled");
        require(ps <= 100, "Market: ps range");
        settledPS = ps;
        psVersion = version;
        phase = Phase.RESOLVED;
        emit Resolved(ps, version);
    }

    function voidMarket() external onlyResolver {
        require(phase == Phase.OPEN || phase == Phase.FROZEN, "Market: settled");
        // snapshot the last market price; both sides refund at fair value.
        voidPriceLong18 = priceLong18();
        phase = Phase.VOID;
        emit Voided();
    }

    // ---------------- redemption ----------------

    /// @dev Per-token USDC payout (scaled by 1e18 numerator). long=true returns
    /// the LONG payout factor; long=false the SHORT factor.
    function _payoutFactor18(bool isLong) internal view returns (uint256) {
        if (phase == Phase.RESOLVED) {
            return isLong ? (uint256(settledPS) * 1e18) / 100 : (uint256(100 - settledPS) * 1e18) / 100;
        }
        // VOID: refund at last market price.
        return isLong ? voidPriceLong18 : (1e18 - voidPriceLong18);
    }

    /// @notice Redeem LONG and/or SHORT after settlement (RESOLVED at PS, VOID at
    /// last price). Works for single-token holders.
    function redeem(uint256 longIn, uint256 shortIn) external nonReentrant returns (uint256 usdcOut) {
        require(phase == Phase.RESOLVED || phase == Phase.VOID, "Market: not settled");
        require(longIn > 0 || shortIn > 0, "Market: zero");
        if (longIn > 0) {
            long.burn(msg.sender, longIn);
            usdcOut += (longIn * _payoutFactor18(true)) / 1e18 / SCALE;
        }
        if (shortIn > 0) {
            short.burn(msg.sender, shortIn);
            usdcOut += (shortIn * _payoutFactor18(false)) / 1e18 / SCALE;
        }
        require(collateral.transfer(msg.sender, usdcOut), "Market: pay out");
        emit Redeemed(msg.sender, longIn, shortIn, usdcOut);
    }

    /// @notice After settlement, the owner (LP) redeems the AMM's reserve tokens.
    function redeemLiquidity() external nonReentrant returns (uint256 usdcOut) {
        require(msg.sender == owner, "Market: not owner");
        require(phase == Phase.RESOLVED || phase == Phase.VOID, "Market: not settled");
        uint256 rl = reserveLong;
        uint256 rs = reserveShort;
        reserveLong = 0;
        reserveShort = 0;
        if (rl > 0) {
            long.burn(address(this), rl);
            usdcOut += (rl * _payoutFactor18(true)) / 1e18 / SCALE;
        }
        if (rs > 0) {
            short.burn(address(this), rs);
            usdcOut += (rs * _payoutFactor18(false)) / 1e18 / SCALE;
        }
        if (usdcOut > 0) require(collateral.transfer(msg.sender, usdcOut), "Market: pay out");
    }

    // ---------------- views / invariants ----------------

    /// @notice Minimum USDC the vault must hold to cover all obligations.
    function requiredCollateral() public view returns (uint256) {
        if (phase == Phase.RESOLVED) {
            return (long.totalSupply() * settledPS) / 100 / SCALE
                + (short.totalSupply() * (100 - settledPS)) / 100 / SCALE;
        }
        if (phase == Phase.VOID) {
            return (long.totalSupply() * voidPriceLong18) / 1e18 / SCALE
                + (short.totalSupply() * (1e18 - voidPriceLong18)) / 1e18 / SCALE;
        }
        // OPEN/FROZEN: balanced supplies, each set worth 1 USDC.
        return long.totalSupply() / SCALE;
    }
}
