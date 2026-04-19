// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

// Minimal faithful reproduction of the Dexible selfSwap vulnerability
// that led to the February 2023 exploit (~$2M).
//
// Original: https://etherscan.io/address/0x33e690aea97e4ef25f0d140f1bf044d663091daf
// Exploit:  https://github.com/SunWeb3Sec/DeFiHackLabs/blob/main/src/test/2023-02/Dexible_exp.sol
//
// The vulnerable surface is the `(bool s, ) = rr.router.call(rr.routerData);`
// pattern in `fill()` — `router` and `routerData` come straight from user input,
// so an attacker can make Dexible invoke transferFrom() on any ERC20, moving
// tokens from any victim that has approved Dexible.
//
// Stripped for Phase 0: fee accounting, DXBL rewards, gas estimation,
// community vault, admin/pause — none of them matter to the vulnerability or
// its patch. Storage uses the real diamond-storage slot so memory layout
// stays compatible with the live deployment.

library TokenTypes {
    struct TokenAmount {
        uint112 amount;
        address token;
    }
}

library SwapTypes {
    struct RouterRequest {
        address router;
        address spender;
        TokenTypes.TokenAmount routeAmount;
        bytes routerData;
    }

    struct SelfSwap {
        address feeToken;
        TokenTypes.TokenAmount tokenIn;
        TokenTypes.TokenAmount tokenOut;
        RouterRequest[] routes;
    }
}

interface IERC20Lite {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

library DexibleStorage {
    // Same diamond-storage slot as the live Dexible contract.
    bytes32 constant DEXIBLE_STORAGE_KEY =
        0x949817a987a8e038ef345d3c9d4fd28e49d8e4e09456e57c05a8b2ce2e62866c;

    struct DexibleData {
        address admin;
        bool initialized;
    }

    function load() internal pure returns (DexibleData storage ds) {
        assembly {
            ds.slot := DEXIBLE_STORAGE_KEY
        }
    }
}

contract Dexible {
    event SwapExecuted(address indexed requester, uint256 routes);

    modifier onlyAdmin() {
        require(msg.sender == DexibleStorage.load().admin, "not admin");
        _;
    }

    function initialize(address admin_) external {
        DexibleStorage.DexibleData storage ds = DexibleStorage.load();
        require(!ds.initialized, "already initialized");
        ds.initialized = true;
        ds.admin = admin_;
    }

    function admin() external view returns (address) {
        return DexibleStorage.load().admin;
    }

    /**
     * The vulnerable entry point. Faithfully reproduces the key sink from
     * the real Dexible.selfSwap -> fill() path:
     *   1) safeApprove arbitrary spender for arbitrary token
     *   2) arbitrary-target / arbitrary-calldata low-level call
     *
     * Missing: any allow-list of routers, any check that `router` is a DEX.
     */
    function selfSwap(SwapTypes.SelfSwap calldata request) external {
        for (uint256 i = 0; i < request.routes.length; ++i) {
            SwapTypes.RouterRequest calldata rr = request.routes[i];
            // Approve the "spender" for the claimed routeAmount.
            IERC20Lite(rr.routeAmount.token).approve(
                rr.spender,
                uint256(rr.routeAmount.amount)
            );
            // VULNERABILITY: arbitrary external call with attacker-controlled
            // target + calldata. Attacker passes router=<ERC20>,
            // routerData=transferFrom(victim, attacker, ...). Since the
            // victim approved Dexible, the transferFrom succeeds.
            (bool s, ) = rr.router.call(rr.routerData);
            require(s, "router call failed");
        }
        emit SwapExecuted(msg.sender, request.routes.length);
    }
}
