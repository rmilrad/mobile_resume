// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "./base/Auth.sol";

interface IMarket {
    function resolve(uint8 ps, string calldata version) external;
    function voidMarket() external;
    function freeze() external;
}

/// @notice Oracle endpoint. The keeper proposes a Performance Score, then after
/// a dispute window finalizes it onto the market. The owner can cancel a bad
/// proposal during the window. (MVP trust model; upgrade path: Chainlink/UMA.)
contract Resolver is Ownable {
    uint256 public disputeWindow;

    struct Proposal {
        uint8 ps;
        string version;
        uint64 proposedAt;
        bool exists;
    }

    mapping(address => Proposal) public proposals; // market => proposal

    event Proposed(address indexed market, uint8 ps, string version, uint64 at);
    event Finalized(address indexed market, uint8 ps);
    event Cancelled(address indexed market);
    event MarketVoided(address indexed market);

    constructor(address _owner, uint256 _disputeWindow) Ownable(_owner) {
        disputeWindow = _disputeWindow;
    }

    function setDisputeWindow(uint256 w) external onlyOwner {
        disputeWindow = w;
    }

    function freezeMarket(address market) external onlyOwner {
        IMarket(market).freeze();
    }

    function proposeScore(address market, uint8 ps, string calldata version) external onlyOwner {
        require(ps <= 100, "Resolver: ps range");
        proposals[market] = Proposal({ps: ps, version: version, proposedAt: uint64(block.timestamp), exists: true});
        emit Proposed(market, ps, version, uint64(block.timestamp));
    }

    function cancelProposal(address market) external onlyOwner {
        require(proposals[market].exists, "Resolver: none");
        delete proposals[market];
        emit Cancelled(market);
    }

    function finalizeScore(address market) external {
        Proposal memory p = proposals[market];
        require(p.exists, "Resolver: none");
        require(block.timestamp >= p.proposedAt + disputeWindow, "Resolver: window");
        delete proposals[market];
        IMarket(market).resolve(p.ps, p.version);
        emit Finalized(market, p.ps);
    }

    function voidMarket(address market) external onlyOwner {
        IMarket(market).voidMarket();
        emit MarketVoided(market);
    }
}
