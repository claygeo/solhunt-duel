// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

// Hand-written patch for the Dexible selfSwap arbitrary-external-call bug.
//
// Strategy: add an allow-list of approved routers, gated by admin, and require
// every RouterRequest to target an approved router. Nothing else changes.
//
// Storage is APPEND-ONLY: `DexibleData` gains an `approvedRouters` mapping
// after its existing fields. The live diamond-storage slot
// 0x949817... is unchanged, and all existing slot offsets inside
// `DexibleData` stay put (admin, initialized). The harness verifies this.

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
    bytes32 constant DEXIBLE_STORAGE_KEY =
        0x949817a987a8e038ef345d3c9d4fd28e49d8e4e09456e57c05a8b2ce2e62866c;

    // IMPORTANT: new fields must be APPENDED. Reordering existing fields
    // would shift storage slots and corrupt data on the live contract.
    struct DexibleData {
        address admin;                        // slot 0 (packed with bool)
        bool initialized;                     // slot 0 (packed)
        mapping(address => bool) approvedRouters; // slot 1 (new, appended)
    }

    function load() internal pure returns (DexibleData storage ds) {
        assembly {
            ds.slot := DEXIBLE_STORAGE_KEY
        }
    }
}

contract Dexible {
    event SwapExecuted(address indexed requester, uint256 routes);
    event RouterApproved(address indexed router, bool approved);

    error UnapprovedRouter(address router);

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

    function setApprovedRouter(address router, bool approved) external onlyAdmin {
        DexibleStorage.load().approvedRouters[router] = approved;
        emit RouterApproved(router, approved);
    }

    function isApprovedRouter(address router) external view returns (bool) {
        return DexibleStorage.load().approvedRouters[router];
    }

    function selfSwap(SwapTypes.SelfSwap calldata request) external {
        DexibleStorage.DexibleData storage ds = DexibleStorage.load();
        for (uint256 i = 0; i < request.routes.length; ++i) {
            SwapTypes.RouterRequest calldata rr = request.routes[i];
            // PATCH: router must be explicitly approved by admin.
            if (!ds.approvedRouters[rr.router]) {
                revert UnapprovedRouter(rr.router);
            }
            IERC20Lite(rr.routeAmount.token).approve(
                rr.spender,
                uint256(rr.routeAmount.amount)
            );
            (bool s, ) = rr.router.call(rr.routerData);
            require(s, "router call failed");
        }
        emit SwapExecuted(msg.sender, request.routes.length);
    }
}
