// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Market} from "./Market.sol";
import {Ownable} from "./base/Auth.sol";

interface IERC20Min {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @notice Deploys and registers per-(player,fixture) markets, seeding each
/// with initial protocol liquidity so there is always a book.
contract MarketFactory is Ownable {
    address public immutable collateral;
    address public immutable resolver;

    mapping(bytes32 => address) public markets; // key => market
    address[] public allMarkets;

    event MarketCreated(
        address indexed market, uint256 indexed playerId, uint256 indexed fixtureId, uint256 seed
    );

    constructor(address _owner, address _collateral, address _resolver) Ownable(_owner) {
        collateral = _collateral;
        resolver = _resolver;
    }

    function key(uint256 playerId, uint256 fixtureId) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(playerId, fixtureId));
    }

    function getMarket(uint256 playerId, uint256 fixtureId) external view returns (address) {
        return markets[key(playerId, fixtureId)];
    }

    function marketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    /// @notice Create a market. Caller must approve `seed` USDC to this factory.
    function createMarket(
        uint256 playerId,
        uint256 fixtureId,
        uint64 kickoffFreezeAt,
        uint256 seed
    ) external onlyOwner returns (address) {
        bytes32 k = key(playerId, fixtureId);
        require(markets[k] == address(0), "Factory: exists");
        require(seed > 0, "Factory: seed");

        Market market = new Market(collateral, playerId, fixtureId, kickoffFreezeAt, resolver, address(this));

        // fund + seed liquidity
        require(IERC20Min(collateral).transferFrom(msg.sender, address(market), seed), "Factory: fund");
        market.seed(seed);

        markets[k] = address(market);
        allMarkets.push(address(market));
        emit MarketCreated(address(market), playerId, fixtureId, seed);
        return address(market);
    }

    /// @notice Owner reclaims residual liquidity from a settled market.
    function reclaimLiquidity(address market) external onlyOwner returns (uint256) {
        uint256 out = Market(market).redeemLiquidity();
        if (out > 0) IERC20Min(collateral).transfer(owner, out);
        return out;
    }
}
