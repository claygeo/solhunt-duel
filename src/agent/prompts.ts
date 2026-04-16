import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "../../prompts");

export function getSystemPrompt(): string {
  return readFileSync(resolve(PROMPTS_DIR, "system.md"), "utf-8");
}

export function buildAnalysisPrompt(params: {
  contractAddress: string;
  contractName: string;
  chain: string;
  blockNumber?: number;
  sourceFiles: { filename: string; content: string }[];
  reconData?: string;
}): string {
  const sourceList = params.sourceFiles
    .map((f) => `- src/${f.filename}`)
    .join("\n");

  // Include source code directly in the prompt to reduce tool-use iterations.
  // Truncate if total source is too large (prevents prompt overflow on local models).
  const MAX_SOURCE_CHARS = 30_000;
  let totalChars = params.sourceFiles.reduce((sum, f) => sum + f.content.length, 0);

  let sourceContents: string;
  if (totalChars <= MAX_SOURCE_CHARS) {
    sourceContents = params.sourceFiles
      .map((f) => `### ${f.filename}\n\`\`\`solidity\n${f.content}\n\`\`\``)
      .join("\n\n");
  } else {
    // For large contracts: include first file in full, summarize the rest
    const primary = params.sourceFiles[0];
    const primaryContent = primary.content.length > MAX_SOURCE_CHARS
      ? primary.content.slice(0, MAX_SOURCE_CHARS) + "\n// ... [truncated, use read_file to see full source]"
      : primary.content;
    const otherFiles = params.sourceFiles.slice(1).map(f =>
      `- \`src/${f.filename}\` (${f.content.length} chars)`
    ).join("\n");
    sourceContents = `### ${primary.filename}\n\`\`\`solidity\n${primaryContent}\n\`\`\`\n\n` +
      (otherFiles ? `### Other source files (use read_file or bash to inspect):\n${otherFiles}` : "");
  }

  const reconSection = params.reconData ? `\n${params.reconData}\n` : "";

  return `## Target Contract

**Address:** \`${params.contractAddress}\`
**Name:** ${params.contractName}
**Chain:** ${params.chain}
**Fork Block:** ${params.blockNumber ?? "latest"}

The Anvil fork is running at \`http://localhost:8545\`. The contract is LIVE at its real address on the fork.

Source code is in \`/workspace/scan/src/\`:
${sourceList}

${sourceContents}
${reconSection}
## Your Plan

1. Read the source above. Identify the vulnerability class.
2. Write \`test/Exploit.t.sol\` using an INTERFACE (not source imports) targeting the real address \`${params.contractAddress}\`.
3. Run forge_test. If it fails, fix and retry.
4. Output your report.

**DO NOT deploy a new contract instance.** Use the existing one at \`${params.contractAddress}\` on the fork.
**DO NOT import from src/.** Define a minimal interface in your test file.
**Write code by iteration 4 at the latest.** Reading without writing is wasted budget.`;
}
