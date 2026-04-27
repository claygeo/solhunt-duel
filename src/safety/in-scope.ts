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

  // Inverse Finance (FiRM lending) — https://immunefi.com/bug-bounty/inversefinance/
  // Per /codex chain pick #1: small per-market contracts, isolated, prior history of
  // access-control + reentrancy exploits. solhunt's 75-83% zone. Max payout ~$100k.
  // KYC: required for payout (Clayton can pass standard KYC).
  {
    address: "0xad038eb671c44b853887a7e32528fab35dc5d710",
    program: "Inverse Finance",
    programUrl: "https://immunefi.com/bug-bounty/inversefinance/",
    contract: "DBR",
    scrapedAt: "2026-04-27",
    notes: "Codex chain #1. DBR (DOLA Borrowing Right) ERC-20 token.",
  },
  {
    address: "0x63fad99705a255fe2d500e498dbb3a9ae5aa1ee8",
    program: "Inverse Finance",
    programUrl: "https://immunefi.com/bug-bounty/inversefinance/",
    contract: "FiRMCRVMarket",
    scrapedAt: "2026-04-27",
    notes: "Codex chain #1. FiRM CRV Market (per-market lending contract).",
  },
  {
    address: "0x63df5e23db45a2066508318f172ba45b9cd37035",
    program: "Inverse Finance",
    programUrl: "https://immunefi.com/bug-bounty/inversefinance/",
    contract: "FiRMWETHMarket",
    scrapedAt: "2026-04-27",
    notes: "Codex chain #1. FiRM WETH Market.",
  },

  // ENS (Ethereum Name Service) — https://immunefi.com/bug-bounty/ens/
  // Per /codex chain pick #3 (priority for anonymity — NO KYC). Max $250k.
  // Solhunt's 75% access-control zone — registrar is heavily auth-gated.
  // Heavily audited but no-KYC + $250k justifies one shot.
  {
    address: "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85",
    program: "ENS",
    programUrl: "https://immunefi.com/bug-bounty/ens/",
    contract: "BaseRegistrarImplementation",
    scrapedAt: "2026-04-27",
    notes: "Codex chain #3. NO-KYC, $250k cap. Access-control-heavy registrar.",
  },

  // Base Azul (audit competition) — https://immunefi.com/audit-competition/audit-comp-base-azul/
  // Confirmed in-scope 2026-04-27. Ends 2026-05-04. Scaling pool: $250k Critical
  // / $125k High / $70k Medium / $30k Low / $20k floor. KYC + runnable PoC required.
  // CHAIN: Base Sepolia (84532), NOT Ethereum mainnet. solhunt's CLI hardcodes
  // chainId=1 — these scans WILL FAIL until src/index.ts:272 + ETH_RPC_URL
  // plumbing is patched. See findings/base-azul-scope.json for fit assessment.
  // Solhunt fit: LOW. Surface is TEE+ZK proof verification, AWS Nitro attestations,
  // dispute-game timing, anchor state — outside benchmark distribution. Best
  // single fit is TEEProverRegistryImpl (access-control = solhunt's 75% zone).
  {
    address: "0x498313fb340cd5055c5568546364008299a47517",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "AggregateVerifier",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia (chainId 84532). ~850 LoC TEE+ZK aggregator. Permissionless, low solhunt fit.",
  },
  {
    address: "0x92f6dd3501e51b8b20c77b959becaaebeb210e17",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "TEEVerifier",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. AWS Nitro attestation + 65-byte sig validation. Crypto-heavy, low fit.",
  },
  {
    address: "0x7d8ea07db94128dbee66bafa3ebaa9668b413d72",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "NitroEnclaveVerifier",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. CBOR + cert-chain attestation parser. Zero benchmark coverage.",
  },
  {
    address: "0xf0d7e15673fba052e83d7f2b26bb6071e86b972e",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "TEEProverRegistryProxy",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. Proxy — impl is teeProverRegistryImpl (0xF9Ab...0D849).",
  },
  {
    address: "0xf9ab55c35ce7fb183a50e611b63558499130d849",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "TEEProverRegistryImpl",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. BEST FIT for solhunt — owner/manager-gated registerSigner/setProposer/setGameType. Access-control = 75% zone. Single first scan target if/when chainId+RPC plumbing patched.",
  },
  {
    address: "0xd6e2d9d4f1f8865ac983ee848983fb1979429914",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "DelayedWETHProxy",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. Proxy — impl is delayedWETHImpl.",
  },
  {
    address: "0xbbfdb04121b74d8ae7f53fd5238ddef133ab977a",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "DelayedWETHImpl",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. Bond/withdrawal contract. Possible reentrancy surface — solhunt's 83% zone, but pattern is well-trodden OP Stack.",
  },
  {
    address: "0x45fa7cffa725e238a46a35fde9f339b63fdedbdd",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "OptimismPortal2Impl",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. SCOPE-AMBIGUOUS — scope excludes 'OP Stack components' but the proxy is part of Azul activation. Only Azul-specific changes count.",
  },
  {
    address: "0xe7f2e3c6286375c102e482c0aa2385d8baacac26",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "DisputeGameFactoryImpl",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. Standard OP Stack factory. Same scope ambiguity as Portal2.",
  },
  {
    address: "0xb1cc9f8422042eda9eb36a408002517d7c772ac7",
    program: "Base Azul",
    programUrl: "https://immunefi.com/audit-competition/audit-comp-base-azul/",
    contract: "AnchorStateRegistryImpl",
    scrapedAt: "2026-04-27",
    notes: "Base Sepolia. Cross-protocol L2 state oracle — solhunt's weakest zone.",
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
