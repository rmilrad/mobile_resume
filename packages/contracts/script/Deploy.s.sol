// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {Resolver} from "../src/Resolver.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

/// @notice Deploys the PitchMarket testnet stack to Base Sepolia.
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 disputeWindow = vm.envOr("DISPUTE_WINDOW", uint256(600));
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        Resolver resolver = new Resolver(deployer, disputeWindow);
        MarketFactory factory = new MarketFactory(deployer, address(usdc), address(resolver));

        vm.stopBroadcast();

        console2.log("MockUSDC     :", address(usdc));
        console2.log("Resolver     :", address(resolver));
        console2.log("MarketFactory:", address(factory));
        console2.log("Deployer     :", deployer);
    }
}
