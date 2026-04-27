// Hard-coded allowlist of in-scope Immunefi targets. Block scans against
// addresses not in this list unless caller passes --i-acknowledge-out-of-scope.
//
// Source of truth: each Immunefi program scope page. When you add a target,
// paste the program URL + scrape date so future-you can verify the scope
// hasn't changed under us.
//
// Adding a target here is a manual, deliberate act. Do NOT auto-populate.

export interface InScopeTarget {
  address: string; // lowercased
  program: string; // human label
  programUrl: string; // immunefi.com/bug-bounty/...
  contract: string; // contract name
  scrapedAt: string; // ISO date the scope was confirmed
  notes?: string;
}

const TARGETS: InScopeTarget[] = [
  // Drips Network — https://immunefi.com/bug-bounty/drips/scope/
  // Confirmed in-scope 2026-04-27 via /codex outside-voice review.
  // Max payout: $100k critical (10% of funds, $50k floor) | $40k high | $20k medium. No KYC.
  // In-scope vuln classes: theft, freezing, NFT alteration, insolvency, governance, griefing.
  {
    address: "0xd0dd053392db676d57317cd4fe96fc2ccf42d0b4",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "Drips",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0xb0c9b6d67608be300398d0e4fb0cca3891e1b33f",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "DripsLogic",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0x60f25ac5f289dc7f640f948521d486c964a248e5",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "Caller",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0x1455d9bd6b98f95dd8feb2b3d60ed825fcef0610",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "AddressDriver",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0x3ea1e774f98cc4c6359bbcb3238e3e60365fa5c9",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "AddressDriverLogic",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0xcf9c49b0962edb01cdaa5326299ba85d72405258",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "NFTDriver",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0x3b11537d0d4276ba9e41ffe04e9034280bd7af50",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "NFTDriverLogic",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0x1212975c0642b07f696080ec1916998441c2b774",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "ImmutableSplitsDriver",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0x2c338cdf00dfd5a9b3b6b0b78bb95352079aaf71",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "ImmutableSplitsDriverLogic",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0x770023d55d09a9c110694827f1a6b32d5c2b373e",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "RepoDriver",
    scrapedAt: "2026-04-27",
    notes: "Post-2024 module, AnyApi->Gelato migration. First-pass target.",
  },
  {
    address: "0xa928d4b087ad35c46ba83331d8eeddb83152319b",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "RepoDriverAnyApiOperator",
    scrapedAt: "2026-04-27",
  },
  {
    address: "0xfc446db5e1255e837e95db90c818c6feb8e93ab0",
    program: "Drips Network",
    programUrl: "https://immunefi.com/bug-bounty/drips/",
    contract: "RepoDriverLogic",
    scrapedAt: "2026-04-27",
    notes: "Deprecated impl per Etherscan EIP-1967 readout. Kept in allowlist because Immunefi scope page still lists it. First scan against this produced false positive (function removed in current impl 0x56f2a96d...).",
  },

  // Twyne — https://immunefi.com/bug-bounty/twyne/scope/
  // Confirmed in-scope 2026-04-27 via /codex outside-voice (research pass 2).
  // Max payout: $50k critical, no KYC. Scope explicitly excludes Euler/Aave-side
  // bugs ("issues with Euler won't count") — only native Twyne logic is in scope.
  // Solhunt strike zones:
  //   - Factories (Collateral / Intermediate Vault) = access-control + logic
  //   - Wrappers (awstETH) = math/share-accounting/donation-attacks
  // AVOID: Intermediate Credit Vaults, Leverage Operators, Teleport Operator,
  //   Oracle Router, Vault Manager — all stateful cross-protocol surfaces
  //   that are solhunt's weakest zone (50-57%).
  {
    address: "0x7613d202af490c3d1ce1873b0a7022a34e89815f",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "eWSTETHIntermediateCreditVault",
    scrapedAt: "2026-04-27",
    notes: "Stateful Euler-mediated. Codex flagged AVOID for solhunt.",
  },
  {
    address: "0x75029a47f28550c93ad5a3bbd2d9b5315204b561",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "aWSTETHIntermediateCreditVault",
    scrapedAt: "2026-04-27",
    notes: "Stateful Aave-mediated. Codex flagged AVOID.",
  },
  {
    address: "0x87b8081a3ace680f35125f469526ac10f5418ca7",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "eWETHIntermediateCreditVault",
    scrapedAt: "2026-04-27",
    notes: "Stateful Euler-mediated. Codex flagged AVOID.",
  },
  {
    address: "0xb5eb1d005e389bef38161691e2083b4d86ff647a",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "IntermediateVaultFactory",
    scrapedAt: "2026-04-27",
    notes: "Codex runner-up #1. Native Twyne factory logic.",
  },
  {
    address: "0x335ab81f1c3d9f72639004d3e982902458cf29b3",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "EulerLeverageOperator",
    scrapedAt: "2026-04-27",
    notes: "Stateful Euler. Codex flagged AVOID.",
  },
  {
    address: "0xb001f039d76ba48e577a17c04b6940db37af8648",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "EulerOracleRouter",
    scrapedAt: "2026-04-27",
    notes: "Oracle router. Codex flagged AVOID (oracle/price territory = solhunt's 57% zone).",
  },
  {
    address: "0x0acd3a3c8ab6a5f7b5a594c88dfa28999da858ac",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "VaultManager",
    scrapedAt: "2026-04-27",
    notes: "Central orchestrator. Codex flagged AVOID (high cross-contract state surface).",
  },
  {
    address: "0xa1517cce0be75700a8838ea1cee0dc383cd3a332",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "CollateralVaultFactory",
    scrapedAt: "2026-04-27",
    notes: "CODEX TOP PICK. Factory = native Twyne access-control + logic. Bug classes: uninit vault, predictable salt, owner spoof, init front-run.",
  },
  {
    address: "0xfaba8f777996c0c28fe9e6554d84cb30ca3e1881",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "awstETHWrapper",
    scrapedAt: "2026-04-27",
    notes: "Codex runner-up #2. Wrapper = share/math logic; classic donation/rounding attack territory.",
  },
  {
    address: "0x868a21426852a775395d4b90de23b3e3e662bd78",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "AaveV3TeleportOperator",
    scrapedAt: "2026-04-27",
    notes: "Stateful Aave. Codex flagged AVOID.",
  },
  {
    address: "0x451949bde57abe2f5dbd4758cd50c6dcfc093a4c",
    program: "Twyne",
    programUrl: "https://immunefi.com/bug-bounty/twyne/",
    contract: "AaveV3LeverageOperator",
    scrapedAt: "2026-04-27",
    notes: "Stateful Aave leverage. Codex flagged AVOID.",
  },
];

export function isInScope(address: string): InScopeTarget | undefined {
  const a = address.toLowerCase();
  return TARGETS.find((t) => t.address === a);
}

export function listInScope(): InScopeTarget[] {
  return [...TARGETS];
}

export function assertInScopeOrAcknowledged(
  address: string,
  acknowledgedOutOfScope: boolean,
): InScopeTarget | null {
  const match = isInScope(address);
  if (match) return match;
  if (acknowledgedOutOfScope) return null;
  throw new Error(
    `Address ${address} is NOT in the Immunefi in-scope allowlist (src/safety/in-scope.ts). ` +
      "Refusing to scan a target without an active bounty program. " +
      "If you have authorization outside Immunefi, pass --i-acknowledge-out-of-scope to override.",
  );
}
