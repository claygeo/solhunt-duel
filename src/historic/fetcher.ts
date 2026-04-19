// Historic-patch fetcher.
//
// For a DatasetEntry whose `referenceExploit` URL points at a DeFiHackLabs
// exploit file, try to locate what the protocol ACTUALLY shipped as a patch
// after the exploit, via a 3-tier waterfall:
//
//   1. DeFiHackLabs repo (README / adjacent files in the event dir)
//   2. Rekt.news post-mortem (best-effort URL surfacing)
//   3. Etherscan (contract source at blockNumber + ~30k heuristic)
//
// If all three fail, return source: "unavailable" — never fabricate.
//
// No API tokens required for tier 1/2. Tier 3 reuses the existing Etherscan
// integration which takes a per-call key from env.

import type { DatasetEntry } from "../duel/orchestrator.js";
import { fetchContractSource } from "../ingestion/etherscan.js";
import { getChainId } from "../ingestion/defi-hacks.js";

export interface HistoricPatch {
  contractName: string;
  source: "defihacklabs" | "rekt_news" | "etherscan" | "unavailable";
  sourceUrl: string;
  patchedSource?: string;
  patchedFunction?: string;
  patchCommitHash?: string;
  patchedAtBlock?: number;
  rationale?: string;
  notes?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
// Budget the whole waterfall to ~30 min max per contract, as per plan.
// In practice we'll hit this much sooner — each tier has its own timeout.
const TOTAL_BUDGET_MS = 30 * 60_000;

// ──────────────────────────────────────────────────────────────────────────
// Tier 1: DeFiHackLabs
// ──────────────────────────────────────────────────────────────────────────

// Given an exploit URL like
//   https://github.com/SunWeb3Sec/DeFiHackLabs/blob/main/src/test/2023-02/Dexible_exp.sol
// return { owner, repo, branch, dirPath, fileName }.
export function parseGithubBlobUrl(url: string): null | {
  owner: string;
  repo: string;
  branch: string;
  dirPath: string;
  fileName: string;
} {
  // github.com/<owner>/<repo>/blob/<branch>/<path>
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const [, owner, repo, branch, fullPath] = m;
  const parts = fullPath.split("/");
  const fileName = parts.pop() ?? "";
  const dirPath = parts.join("/");
  return { owner, repo, branch, dirPath, fileName };
}

async function githubListDir(
  owner: string,
  repo: string,
  branch: string,
  dirPath: string,
  timeoutMs: number
): Promise<Array<{ name: string; path: string; type: string; download_url: string | null }>> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "solhunt-historic" },
      signal: ctl.signal,
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function githubFetchRaw(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  timeoutMs: number
): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "solhunt-historic" },
      signal: ctl.signal,
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Pull likely-patch signals out of README / adjacent Solidity files.
// We look for:
//   - any 40-hex git commit SHA
//   - any 0x<40-hex> contract address that is NOT the pre-exploit victim
//   - URLs to etherscan / goerli / optimistic linking patched contracts
//   - URLs to rekt.news post-mortems
export function extractPatchSignals(
  text: string,
  excludeAddress: string
): {
  commitHashes: string[];
  contractAddresses: string[];
  rektUrls: string[];
  etherscanUrls: string[];
} {
  const excludedLower = excludeAddress.toLowerCase();
  const commitHashes = Array.from(
    new Set((text.match(/\b[0-9a-f]{40}\b/gi) ?? []).map((s) => s.toLowerCase()))
  );
  const contractAddresses = Array.from(
    new Set(
      (text.match(/0x[0-9a-fA-F]{40}\b/g) ?? []).map((s) => s.toLowerCase())
    )
  ).filter((a) => a !== excludedLower);
  const rektUrls = Array.from(
    new Set(text.match(/https?:\/\/rekt\.news\/[^\s)<>"']+/gi) ?? [])
  );
  const etherscanUrls = Array.from(
    new Set(text.match(/https?:\/\/(?:\w+\.)?etherscan\.io\/[^\s)<>"']+/gi) ?? [])
  );
  return { commitHashes, contractAddresses, rektUrls, etherscanUrls };
}

async function tryDefiHackLabs(
  entry: DatasetEntry,
  timeoutMs: number
): Promise<HistoricPatch | null> {
  if (!entry.referenceExploit) return null;
  const parsed = parseGithubBlobUrl(entry.referenceExploit);
  if (!parsed) return null;

  const { owner, repo, branch, dirPath, fileName } = parsed;

  // 1. Grab the exploit file itself (may cite patch commits in its header comment).
  const exploitRaw = await githubFetchRaw(owner, repo, branch, `${dirPath}/${fileName}`, timeoutMs);

  // 2. List the directory; look for README-ish files and any _fix / _patched Solidity.
  const listing = await githubListDir(owner, repo, branch, dirPath, timeoutMs);
  const readmeEntries = listing.filter((e) => /readme/i.test(e.name));
  const patchCandidates = listing.filter((e) =>
    /(_fix|_patch|_patched|_mitigation|_hardened)\.sol$/i.test(e.name)
  );

  // 3. Also peek at the top-level README for repo-wide references.
  const topReadme = await githubFetchRaw(owner, repo, branch, "README.md", timeoutMs);

  // 4. Grab any contract-named file in the same dir that shares the exploit's prefix.
  //    e.g. if exploit is Dexible_exp.sol, try Dexible.sol / DexiblePatched.sol / DexibleFix.sol.
  const baseName = fileName.replace(/_exp\.sol$/i, "").replace(/\.sol$/i, "");
  const siblingMatches = listing.filter((e) => {
    const n = e.name.toLowerCase();
    return (
      n !== fileName.toLowerCase() &&
      n.startsWith(baseName.toLowerCase()) &&
      n.endsWith(".sol")
    );
  });

  const readmeTexts: string[] = [];
  for (const r of readmeEntries) {
    const txt = await githubFetchRaw(owner, repo, branch, r.path, timeoutMs);
    if (txt) readmeTexts.push(txt);
  }

  const combined =
    [exploitRaw, topReadme, ...readmeTexts].filter((x): x is string => !!x).join("\n\n") || "";
  const signals = extractPatchSignals(combined, entry.contractAddress);

  // If we found a dedicated _fix/_patch sibling, that's the strongest signal.
  if (patchCandidates.length > 0) {
    const pc = patchCandidates[0];
    const raw = pc.download_url ? await githubFetchRaw(owner, repo, branch, pc.path, timeoutMs) : null;
    return {
      contractName: entry.name,
      source: "defihacklabs",
      sourceUrl: `https://github.com/${owner}/${repo}/blob/${branch}/${pc.path}`,
      patchedSource: raw ?? undefined,
      patchCommitHash: signals.commitHashes[0],
      rationale: readmeTexts[0]?.slice(0, 1200),
      notes: `Dedicated patch file found adjacent to exploit.`,
    };
  }

  // If DeFiHackLabs README mentions patch commits but no explicit file, surface that.
  if (signals.commitHashes.length > 0 || signals.contractAddresses.length > 0) {
    return {
      contractName: entry.name,
      source: "defihacklabs",
      sourceUrl: `https://github.com/${owner}/${repo}/tree/${branch}/${dirPath}`,
      patchedSource: undefined,
      patchCommitHash: signals.commitHashes[0],
      rationale: readmeTexts[0]?.slice(0, 1200),
      notes:
        `DeFiHackLabs references ${signals.commitHashes.length} commit SHA(s) and ` +
        `${signals.contractAddresses.length} post-exploit address(es). ` +
        `Siblings: ${siblingMatches.map((s) => s.name).join(", ") || "none"}. ` +
        `Rekt URLs: ${signals.rektUrls.join(", ") || "none"}.`,
    };
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Tier 2: Rekt.news
// ──────────────────────────────────────────────────────────────────────────

// Very light Rekt search — we don't have a Rekt API, so we heuristically
// slug-ify the contract name and check if rekt.news/<slug> exists. Rekt uses
// kebab-case slugs. This is best-effort URL surfacing, not full extraction.
async function tryRektNews(
  entry: DatasetEntry,
  timeoutMs: number
): Promise<HistoricPatch | null> {
  const slugs = [
    entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    entry.name.toLowerCase().replace(/\s+/g, ""),
  ];
  for (const slug of slugs) {
    if (!slug) continue;
    const url = `https://rekt.news/${slug}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "solhunt-historic" },
        signal: ctl.signal,
        redirect: "follow",
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      // Heuristic: Rekt articles mention "post-mortem", "fix", "patch" if the
      // protocol shipped a remediation. We don't parse the body — we surface
      // the URL + a small excerpt and let the Blue/demo UI link out.
      if (html.length < 500) continue;
      const excerpt = extractRektExcerpt(html);
      return {
        contractName: entry.name,
        source: "rekt_news",
        sourceUrl: url,
        rationale: excerpt,
        notes:
          "Rekt.news post-mortem found via slug heuristic. Body not parsed — " +
          "reviewer should read the article for the actual patch description.",
      };
    } catch {
      // ignore, try next slug
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function extractRektExcerpt(html: string): string {
  // Meta description is usually the TL;DR of the incident.
  const meta =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ??
    html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (meta) return meta[1].slice(0, 500);
  // Fallback: first <p>.
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (p) return p[1].replace(/<[^>]+>/g, "").trim().slice(0, 500);
  return "";
}

// ──────────────────────────────────────────────────────────────────────────
// Tier 3: Etherscan at post-patch block
// ──────────────────────────────────────────────────────────────────────────

// Heuristic: fetch the current verified source for the same address. If the
// protocol redeployed to a new address there's nothing we can do without more
// signal, but if they upgraded a proxy in place, Etherscan's current source is
// the patched version. We don't try to chase blockNumber + 30k because
// getsourcecode doesn't take a block — it returns whatever's verified now.
async function tryEtherscan(entry: DatasetEntry): Promise<HistoricPatch | null> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return null;
  let chainId: number;
  try {
    chainId = getChainId(entry.chain);
  } catch {
    return null;
  }
  try {
    const info = await fetchContractSource(entry.contractAddress, apiKey, chainId);
    const primary =
      info.sources.find((s) =>
        s.filename.toLowerCase().includes(entry.name.toLowerCase())
      ) ?? info.sources[0];
    return {
      contractName: entry.name,
      source: "etherscan",
      sourceUrl: `https://etherscan.io/address/${entry.contractAddress}#code`,
      patchedSource: primary?.content,
      patchedAtBlock: entry.blockNumber,
      notes:
        `Etherscan verified source at ${entry.contractAddress}. ` +
        `This is the CURRENT verified source — if the protocol upgraded in-place ` +
        `it reflects the patch; if they abandoned this address it does not.`,
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export async function fetchHistoricPatch(
  entry: DatasetEntry
): Promise<HistoricPatch> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  const notesBreadcrumbs: string[] = [];

  // Tier 1
  if (Date.now() < deadline) {
    try {
      const res = await tryDefiHackLabs(entry, timeoutMs);
      if (res) return res;
      notesBreadcrumbs.push("defihacklabs: no patch signals extracted");
    } catch (e) {
      notesBreadcrumbs.push(`defihacklabs error: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // Tier 2
  if (Date.now() < deadline) {
    try {
      const res = await tryRektNews(entry, timeoutMs);
      if (res) return res;
      notesBreadcrumbs.push("rekt_news: no matching article via slug heuristic");
    } catch (e) {
      notesBreadcrumbs.push(`rekt_news error: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // Tier 3
  if (Date.now() < deadline) {
    try {
      const res = await tryEtherscan(entry);
      if (res) return res;
      notesBreadcrumbs.push(
        process.env.ETHERSCAN_API_KEY
          ? "etherscan: source unverified or fetch failed"
          : "etherscan: skipped (ETHERSCAN_API_KEY not set)"
      );
    } catch (e) {
      notesBreadcrumbs.push(`etherscan error: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  return {
    contractName: entry.name,
    source: "unavailable",
    sourceUrl: entry.referenceExploit ?? "",
    notes:
      `All three tiers exhausted. ${notesBreadcrumbs.join("; ")}. ` +
      `Reviewer note: this is an honest unavailable, not a fabrication.`,
  };
}
