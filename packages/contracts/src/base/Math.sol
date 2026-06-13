// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library Math {
    /// @notice Integer square root (Babylonian method).
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
