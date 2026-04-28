import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  CHAINS,
  resolveChain,
  getRpcUrl,
  listChainNames,
  explorerAddressUrl,
} from "../../src/config/chains.js";

describe("resolveChain", () => {
  it("returns ethereum config for 'ethereum'", () => {
    const config = resolveChain("ethereum");
    expect(config.chainId).toBe(1);
    expect(config.rpcEnv).toBe("ETH_RPC_URL");
    expect(config.explorerUrl).toBe("https://etherscan.io");
  });

  it("returns arbitrum config with correct chainId", () => {
    const config = resolveChain("arbitrum");
    expect(config.chainId).toBe(42161);
    expect(config.rpcEnv).toBe("ARB_RPC_URL");
    expect(config.explorerUrl).toBe("https://arbiscan.io");
  });

  it("returns optimism config with correct chainId", () => {
    const config = resolveChain("optimism");
    expect(config.chainId).toBe(10);
    expect(config.rpcEnv).toBe("OPT_RPC_URL");
  });

  it("returns base config with correct chainId", () => {
    const config = resolveChain("base");
    expect(config.chainId).toBe(8453);
    expect(config.rpcEnv).toBe("BASE_RPC_URL");
  });

  it("returns polygon config with correct chainId", () => {
    const config = resolveChain("polygon");
    expect(config.chainId).toBe(137);
    expect(config.rpcEnv).toBe("POLYGON_RPC_URL");
  });

  it("returns base-sepolia config with correct chainId", () => {
    const config = resolveChain("base-sepolia");
    expect(config.chainId).toBe(84532);
    expect(config.rpcEnv).toBe("BASE_SEPOLIA_RPC_URL");
  });

  it("throws on unknown chain", () => {
    expect(() => resolveChain("stellar")).toThrow(/Unknown chain "stellar"/);
  });

  it("includes supported chains in error message", () => {
    let err: Error | null = null;
    try {
      resolveChain("solana");
    } catch (e: any) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/Supported chains:/);
    expect(err!.message).toMatch(/ethereum/);
    expect(err!.message).toMatch(/arbitrum/);
    expect(err!.message).toMatch(/base/);
  });
});

describe("getRpcUrl", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.ETH_RPC_URL;
    delete process.env.ARB_RPC_URL;
    delete process.env.OPT_RPC_URL;
    delete process.env.BASE_RPC_URL;
    delete process.env.POLYGON_RPC_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns override when passed explicitly (highest precedence)", () => {
    process.env.ETH_RPC_URL = "https://from-env.example";
    const config = resolveChain("ethereum");
    expect(getRpcUrl(config, "https://override.example")).toBe(
      "https://override.example",
    );
  });

  it("returns per-chain env var when no override", () => {
    process.env.ARB_RPC_URL = "https://arb-env.example";
    const config = resolveChain("arbitrum");
    expect(getRpcUrl(config)).toBe("https://arb-env.example");
  });

  it("falls back to ETH_RPC_URL ONLY for ethereum chain", () => {
    process.env.ETH_RPC_URL = "https://eth-fallback.example";
    const config = resolveChain("ethereum");
    expect(getRpcUrl(config)).toBe("https://eth-fallback.example");
  });

  it("does NOT fall back to ETH_RPC_URL for arbitrum (silent-wrong-RPC bug guard)", () => {
    process.env.ETH_RPC_URL = "https://eth-mainnet.example";
    const config = resolveChain("arbitrum");
    expect(() => getRpcUrl(config)).toThrow(
      /No RPC URL resolved for chain="arbitrum"/,
    );
  });

  it("throws when no URL resolves (never silent failure)", () => {
    const config = resolveChain("polygon");
    expect(() => getRpcUrl(config)).toThrow(
      /No RPC URL resolved for chain="polygon"/,
    );
  });

  it("error message names the env var to set", () => {
    const config = resolveChain("base");
    expect(() => getRpcUrl(config)).toThrow(/BASE_RPC_URL/);
  });

  it("ignores empty-string override (treats as missing)", () => {
    process.env.ARB_RPC_URL = "https://arb.example";
    const config = resolveChain("arbitrum");
    expect(getRpcUrl(config, "")).toBe("https://arb.example");
  });

  it("ignores whitespace-only env var", () => {
    process.env.ARB_RPC_URL = "   ";
    const config = resolveChain("arbitrum");
    expect(() => getRpcUrl(config)).toThrow();
  });
});

describe("listChainNames", () => {
  it("returns alphabetically sorted chain names", () => {
    const names = listChainNames();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it("includes all expected chains", () => {
    const names = listChainNames();
    expect(names).toContain("ethereum");
    expect(names).toContain("arbitrum");
    expect(names).toContain("optimism");
    expect(names).toContain("base");
    expect(names).toContain("polygon");
  });
});

describe("explorerAddressUrl", () => {
  it("builds Etherscan URL for ethereum", () => {
    const config = resolveChain("ethereum");
    expect(explorerAddressUrl(config, "0xC1E088fC1323b20BCBee9bd1B9fC9546db5624C5")).toBe(
      "https://etherscan.io/address/0xC1E088fC1323b20BCBee9bd1B9fC9546db5624C5",
    );
  });

  it("builds Arbiscan URL for arbitrum", () => {
    const config = resolveChain("arbitrum");
    expect(explorerAddressUrl(config, "0x506Ba37aa8e265bE445913B9c4080852277f3c5a")).toBe(
      "https://arbiscan.io/address/0x506Ba37aa8e265bE445913B9c4080852277f3c5a",
    );
  });

  it("builds Basescan URL for base", () => {
    const config = resolveChain("base");
    expect(explorerAddressUrl(config, "0xff8cbf0bb4274cf82c23779ab04978d631a0a34e")).toBe(
      "https://basescan.org/address/0xff8cbf0bb4274cf82c23779ab04978d631a0a34e",
    );
  });
});

describe("CHAINS data integrity", () => {
  it("every chain config has required fields", () => {
    for (const [name, config] of Object.entries(CHAINS)) {
      expect(config.name).toBe(name);
      expect(config.chainId).toBeGreaterThan(0);
      expect(config.rpcEnv).toMatch(/^[A-Z_]+$/);
      expect(config.explorerUrl).toMatch(/^https:\/\//);
      expect(config.explorerUrl).not.toMatch(/\/$/); // no trailing slash
      expect(config.explorerLabel.length).toBeGreaterThan(0);
    }
  });

  it("chainIds are unique across configs", () => {
    const ids = Object.values(CHAINS).map((c) => c.chainId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rpcEnv values are unique across configs", () => {
    const envs = Object.values(CHAINS).map((c) => c.rpcEnv);
    expect(new Set(envs).size).toBe(envs.length);
  });
});
