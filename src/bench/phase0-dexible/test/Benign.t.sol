// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "forge-std/Test.sol";

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

interface IDexible {
    function selfSwap(SwapTypes.SelfSwap calldata request) external;
    function initialize(address admin) external;
    function admin() external view returns (address);
}

// Patched-only calls. On the unpatched contract these selectors will
// NOT EXIST (the function returns empty data / reverts). Benign tests
// only call them when the harness declares we're running against the
// patched bytecode, via env var.
interface IDexiblePatched is IDexible {
    function setApprovedRouter(address router, bool approved) external;
    function isApprovedRouter(address router) external view returns (bool);
}

/**
 * Mock router that accepts calls and records them. Represents a legitimate
 * DEX aggregator the admin would allow-list. It doesn't actually swap —
 * Phase 0's benign tests don't care about the actual DEX output, they care
 * that the allow-listed-router call path works AND that the no-op owner
 * workflow (initialize, setApprovedRouter) is unchanged.
 */
contract MockRouter {
    uint256 public callCount;
    bytes public lastData;

    function execute(bytes calldata data) external returns (bool) {
        callCount++;
        lastData = data;
        return true;
    }

    fallback() external payable {
        callCount++;
        lastData = msg.data;
    }
}

contract TestToken {
    string public constant name = "TestToken";
    string public constant symbol = "TT";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

/**
 * BenignTest — happy-path suite. Must PASS on both the unpatched and the
 * patched bytecode. The harness sets DEXIBLE_PATCHED env var to "1" before
 * invoking the patched run; unpatched run leaves it unset.
 */
contract BenignTest is Test {
    address constant TARGET = 0xDE62E1b0edAa55aAc5ffBE21984D321706418024;

    TestToken internal token;
    MockRouter internal router;
    address internal owner;
    address internal trader;

    bool internal isPatched;

    function setUp() public {
        // Same fork-and-etch pattern as Exploit.t.sol.
        string memory rpc = vm.envString("ETH_RPC_URL");
        uint256 forkBlock = vm.envOr("DEXIBLE_FORK_BLOCK", uint256(16646021));
        vm.createSelectFork(rpc, forkBlock);

        bytes memory code = vm.envBytes("DEXIBLE_RUNTIME_BYTECODE");
        vm.etch(TARGET, code);

        token = new TestToken();
        router = new MockRouter();
        owner = makeAddr("owner");
        trader = makeAddr("trader");

        isPatched = vm.envOr("DEXIBLE_PATCHED", uint256(0)) == 1;

        // Initialize is idempotent-ish: on the unpatched contract this sets
        // admin; if the live contract is already initialized we swallow.
        try IDexible(TARGET).initialize(owner) {} catch {}

        // On the patched contract, admin approves the legit router.
        if (isPatched) {
            // Pre-seed the initialized slot if `initialize` was silently
            // skipped (live state may already have an admin). We force the
            // owner to whatever the live admin is — but we only run this in
            // a post-etch context, so admin() returns whatever initialize
            // just set.
            address currentAdmin = IDexible(TARGET).admin();
            vm.prank(currentAdmin);
            IDexiblePatched(TARGET).setApprovedRouter(address(router), true);
        }
    }

    /// Happy path: valid owner call to selfSwap with an approved router succeeds.
    function testApprovedRouterSwapSucceeds() external {
        if (!isPatched) {
            // On unpatched, any router works (that's the whole vuln). Prove
            // the happy-path still resolves — attacker path is tested in
            // Exploit.t.sol; here we just show normal use compiles + runs.
            _callSelfSwap();
            assertEq(router.callCount(), 1, "router should have been called once");
            return;
        }
        _callSelfSwap();
        assertEq(router.callCount(), 1, "approved router should execute");
    }

    /// Patched-only: unapproved router must revert with the right error.
    function testUnapprovedRouterReverts() external {
        if (!isPatched) return; // no-op on unpatched (function doesn't exist)
        MockRouter evil = new MockRouter();

        SwapTypes.RouterRequest[] memory routes = new SwapTypes.RouterRequest[](1);
        routes[0] = SwapTypes.RouterRequest({
            router: address(evil),
            spender: TARGET,
            routeAmount: TokenTypes.TokenAmount({amount: 0, token: address(token)}),
            routerData: abi.encodeWithSignature("execute(bytes)", bytes(""))
        });
        SwapTypes.SelfSwap memory req = SwapTypes.SelfSwap({
            feeToken: address(token),
            tokenIn: TokenTypes.TokenAmount({amount: 0, token: address(token)}),
            tokenOut: TokenTypes.TokenAmount({amount: 0, token: address(token)}),
            routes: routes
        });

        vm.prank(trader);
        vm.expectRevert();
        IDexible(TARGET).selfSwap(req);
    }

    /// Patched-only: only the admin can call setApprovedRouter.
    function testOnlyAdminCanApprove() external {
        if (!isPatched) return;
        address notAdmin = makeAddr("notAdmin");
        vm.prank(notAdmin);
        vm.expectRevert(bytes("not admin"));
        IDexiblePatched(TARGET).setApprovedRouter(address(0xBEEF), true);
    }

    /// Patched-only: admin can toggle router approval both ways.
    function testAdminCanToggleRouterApproval() external {
        if (!isPatched) return;
        address r = address(0xC0DE);
        address a = IDexible(TARGET).admin();

        vm.prank(a);
        IDexiblePatched(TARGET).setApprovedRouter(r, true);
        assertTrue(IDexiblePatched(TARGET).isApprovedRouter(r));

        vm.prank(a);
        IDexiblePatched(TARGET).setApprovedRouter(r, false);
        assertFalse(IDexiblePatched(TARGET).isApprovedRouter(r));
    }

    /// admin() view should remain stable across initialize.
    function testAdminViewStable() external view {
        address a = IDexible(TARGET).admin();
        assertTrue(a != address(0), "admin should be set");
    }

    function _callSelfSwap() internal {
        SwapTypes.RouterRequest[] memory routes = new SwapTypes.RouterRequest[](1);
        routes[0] = SwapTypes.RouterRequest({
            router: address(router),
            spender: TARGET,
            routeAmount: TokenTypes.TokenAmount({amount: 0, token: address(token)}),
            routerData: abi.encodeWithSignature("execute(bytes)", bytes(""))
        });
        SwapTypes.SelfSwap memory req = SwapTypes.SelfSwap({
            feeToken: address(token),
            tokenIn: TokenTypes.TokenAmount({amount: 0, token: address(token)}),
            tokenOut: TokenTypes.TokenAmount({amount: 0, token: address(token)}),
            routes: routes
        });

        vm.prank(trader);
        IDexible(TARGET).selfSwap(req);
    }
}
