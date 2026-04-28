// Multichain configuration for solhunt v1.2.
//
// Maps human chain names ("ethereum", "arbitrum", ...) to chainId + RPC env
// var + block explorer URL. Single source of truth — referenced from CLI flag
// validation, Etherscan v2 client, sandbox/fork RPC resolution, and finding
// rendering.
//
// Etherscan v2 multichain API: ONE Etherscan API key works across all listed
// chains. The chainId param tells the v2 API which chain to look up. See:
// https://docs.etherscan.io/etherscan-v2/getting-started/v2-quickstart
//
// Chain resolution flow:
// ==========================================================
//   CLI: --chain <name> [--rpc-url <url>]
//        │
//        ▼
//   resolveChain(name) → throws on unknown
//        │
//        ├─ chainConfig.chainId  → fetchContractSource(addr, key, chainId)
//        │
//        └─ rpcUrl precedence:
//               flag > process.env[chainConfig.rpcEnv] > ETH_RPC_URL (only ethereum) > error
//               │
//               ▼
//        SandboxManager.createContainer({ rpcUrl })
//               │
//               ▼
//        ForkManager.start({ chain: name, rpcUrl, hardfork? })
// ==========================================================

export interface ChainConfig {
  /** Lowercase chain name used as the --chain flag value. */
  name: string;
  /** Numeric chainId per https://chainid.network/ */
  chainId: number;
  /** Env var name to look up if no --rpc-url is passed. */
  rpcEnv: string;
  /** Block explorer base URL (no trailing slash). */
  explorerUrl: string;
  /** Human-readable explorer name for finding render. */
  explorerLabel: string;
  /**
   * Optional Anvil hardfork override. Chains with non-mainnet gas models
   * may need this so Anvil doesn't reject txs at the wrong opcode level.
   */
  hardfork?: string;
}

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: "ethereum",
    chainId: 1,
    rpcEnv: "ETH_RPC_URL",
    explorerUrl: "https://etherscan.io",
    explorerLabel: "Etherscan",
  },
  arbitrum: {
    name: "arbitrum",
    chainId: 42161,
    rpcEnv: "ARB_RPC_URL",
    explorerUrl: "https://arbiscan.io",
    explorerLabel: "Arbiscan",
  },
  optimism: {
    name: "optimism",
    chainId: 10,
    rpcEnv: "OPT_RPC_URL",
    explorerUrl: "https://optimistic.etherscan.io",
    explorerLabel: "Optimistic Etherscan",
  },
  base: {
    name: "base",
    chainId: 8453,
    rpcEnv: "BASE_RPC_URL",
    explorerUrl: "https://basescan.org",
    explorerLabel: "Basescan",
  },
  polygon: {
    name: "polygon",
    chainId: 137,
    rpcEnv: "POLYGON_RPC_URL",
    explorerUrl: "https://polygonscan.com",
    explorerLabel: "Polygonscan",
  },
  "base-sepolia": {
    name: "base-sepolia",
    chainId: 84532,
    rpcEnv: "BASE_SEPOLIA_RPC_URL",
    explorerUrl: "https://sepolia.basescan.org",
    explorerLabel: "Base Sepolia Basescan",
  },
};

/**
 * Look up a chain by name. Throws explicitly on unknown — never silently
 * defaults. The caller should always pass a CLI-validated name.
 */
export function resolveChain(name: string): ChainConfig {
  const config = CHAINS[name];
  if (!config) {
    const supported = Object.keys(CHAINS).sort().join(", ");
    throw new Error(
      `Unknown chain "${name}". Supported chains: ${supported}. ` +
        `If you need a chain that's not listed, add it to src/config/chains.ts.`,
    );
  }
  return config;
}

/**
 * Resolve an RPC URL for the given chain config. Precedence:
 *   1. Explicit override (--rpc-url flag)
 *   2. Per-chain env var (ARB_RPC_URL for Arbitrum, etc.)
 *   3. ETH_RPC_URL fallback ONLY for the ethereum chain (preserves v1.1
 *      behavior; never silently used for non-Ethereum scans)
 *   4. Throw — never proceed with empty RPC.
 *
 * The hard error in step 4 is intentional: a scan that "succeeds" against
 * the wrong chain's RPC produces fake findings.
 */
export function getRpcUrl(config: ChainConfig, override?: string): string {
  if (override && override.trim() !== "") {
    return override;
  }
  const fromEnv = process.env[config.rpcEnv];
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv;
  }
  if (config.name === "ethereum") {
    const fallback = process.env.ETH_RPC_URL;
    if (fallback && fallback.trim() !== "") {
      return fallback;
    }
  }
  throw new Error(
    `No RPC URL resolved for chain="${config.name}". ` +
      `Set ${config.rpcEnv} in your environment, or pass --rpc-url <url>.`,
  );
}

/** Convenience: list all supported chain names sorted alphabetically. */
export function listChainNames(): string[] {
  return Object.keys(CHAINS).sort();
}

/**
 * Build a block-explorer URL for a contract address on a given chain.
 * Used by finding-bundle README rendering so reviewer-facing artifacts
 * link to the right explorer.
 */
export function explorerAddressUrl(config: ChainConfig, address: string): string {
  return `${config.explorerUrl}/address/${address}`;
}
