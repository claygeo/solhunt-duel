import { SandboxManager } from "./manager.js";

export interface ReconResult {
  ethBalance: string;
  codeSize: number;
  owner: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  totalSupply: string | null;
  paused: boolean | null;
  storageSlots: Record<string, string>;
  rawResults: string[];
}

/**
 * Run quick cast queries against the target contract before the agent starts.
 * This saves 3-5 agent iterations that would otherwise be wasted on discovery.
 */
export async function runPreScanRecon(
  sandbox: SandboxManager,
  containerId: string,
  contractAddress: string
): Promise<ReconResult> {
  const RPC = "http://localhost:8545";
  const result: ReconResult = {
    ethBalance: "0",
    codeSize: 0,
    owner: null,
    tokenName: null,
    tokenSymbol: null,
    tokenDecimals: null,
    totalSupply: null,
    paused: null,
    storageSlots: {},
    rawResults: [],
  };

  // Helper: run cast call and decode the result
  async function castCallDecode(sig: string, retType: string): Promise<string | null> {
    try {
      const r = await sandbox.exec(
        containerId,
        `cast call ${contractAddress} "${sig}" --rpc-url ${RPC} 2>/dev/null | cast abi-decode "f()${retType}" 2>/dev/null`,
        10_000
      );
      if (r.exitCode === 0 && r.stdout.trim()) return r.stdout.trim();
      return null;
    } catch {
      return null;
    }
  }

  // Helper: run a simple cast command
  async function castExec(cmd: string): Promise<string | null> {
    try {
      const r = await sandbox.exec(containerId, `${cmd} 2>/dev/null`, 10_000);
      if (r.exitCode === 0 && r.stdout.trim()) return r.stdout.trim();
      return null;
    } catch {
      return null;
    }
  }

  // Run all queries in parallel (each has 10s timeout)
  const [
    balance,
    codeSize,
    owner,
    name,
    symbol,
    decimals,
    supply,
    paused,
    token0,
    token1,
    reserves,
    slot0,
    implSlot,
  ] = await Promise.all([
    castExec(`cast balance ${contractAddress} --rpc-url ${RPC}`),
    castExec(`cast codesize ${contractAddress} --rpc-url ${RPC}`),
    castCallDecode("owner()", "(address)"),
    castCallDecode("name()", "(string)"),
    castCallDecode("symbol()", "(string)"),
    castCallDecode("decimals()", "(uint8)"),
    castCallDecode("totalSupply()", "(uint256)"),
    castCallDecode("paused()", "(bool)"),
    castCallDecode("token0()", "(address)"),
    castCallDecode("token1()", "(address)"),
    castExec(`cast call ${contractAddress} "getReserves()" --rpc-url ${RPC}`),
    castExec(`cast storage ${contractAddress} 0 --rpc-url ${RPC}`),
    castExec(`cast storage ${contractAddress} 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url ${RPC}`),
  ]);

  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const ZERO_SLOT = "0x0000000000000000000000000000000000000000000000000000000000000000";

  if (balance) {
    result.ethBalance = balance;
    result.rawResults.push(`ETH balance: ${balance} wei`);
  }

  if (codeSize) {
    result.codeSize = parseInt(codeSize) || 0;
    result.rawResults.push(`Code size: ${codeSize} bytes`);
  }

  if (owner && owner !== ZERO_ADDR) {
    result.owner = owner;
    result.rawResults.push(`owner(): ${owner}`);
  }

  if (name) { result.tokenName = name; result.rawResults.push(`name(): ${name}`); }
  if (symbol) { result.tokenSymbol = symbol; result.rawResults.push(`symbol(): ${symbol}`); }
  if (decimals) { result.tokenDecimals = parseInt(decimals) || null; result.rawResults.push(`decimals(): ${decimals}`); }
  if (supply) { result.totalSupply = supply; result.rawResults.push(`totalSupply(): ${supply}`); }
  if (paused !== null) { result.paused = paused === "true"; result.rawResults.push(`paused(): ${paused}`); }

  if (token0 && token0 !== ZERO_ADDR) {
    result.rawResults.push(`token0(): ${token0}`);
  }
  if (token1 && token1 !== ZERO_ADDR) {
    result.rawResults.push(`token1(): ${token1}`);
  }

  if (reserves) {
    result.rawResults.push(`getReserves() [raw]: ${reserves}`);
  }

  if (slot0 && slot0 !== ZERO_SLOT) {
    result.storageSlots["0"] = slot0;
    result.rawResults.push(`storage[0]: ${slot0}`);
  }

  if (implSlot && implSlot !== ZERO_SLOT) {
    const addr = "0x" + implSlot.slice(-40);
    result.rawResults.push(`EIP-1967 implementation: ${addr}`);
  }

  return result;
}

/**
 * Format recon results as a string section for the analysis prompt.
 */
export function formatReconForPrompt(recon: ReconResult): string {
  if (recon.rawResults.length === 0) {
    return "";
  }

  const lines = recon.rawResults.join("\n");

  return `## Pre-scan Reconnaissance

The following data was gathered from the live fork. Use these values directly in your exploit. Do NOT waste iterations re-querying them with cast.

\`\`\`
${lines}
\`\`\`

**Use these values directly.** If token0/token1 addresses are shown, use them in your exploit interfaces and test setup. Do not run cast to re-discover them.`;
}
