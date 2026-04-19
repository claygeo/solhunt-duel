import type { ToolDefinition } from "./provider.js";
import { SandboxManager } from "../sandbox/manager.js";
import {
  verifyPatch,
  type PatchVerification,
  type VerifyPatchArgs,
} from "../sandbox/patch-harness.js";

// Tool set for the Blue-team patcher.
//
// This is a DELIBERATELY NARROWED mirror of src/agent/tools.ts:
//   - No forge_test: the only test run that matters is routed through verify_patch,
//     which exercises the full etch+fork+exploit+benign pipeline.
//   - bash is restricted (see BlueToolExecutor below) to prevent networking /
//     writes outside /workspace.
//   - verify_patch is new: it's the oracle that decides whether Blue succeeded.
//
// The structure mirrors tools.ts so the provider layer can dispatch Blue tool
// calls with zero special-casing. See executor.ts for the Red counterpart.

export function getBlueToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "bash",
        description:
          "Run a restricted shell command inside the Docker sandbox. No network, no writes outside /workspace. Use for forge build, ls, cat, diff.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The bash command to execute",
            },
          },
          required: ["command"],
        },
      },
    },

    {
      type: "function",
      function: {
        name: "str_replace_editor",
        description:
          "View, create, or edit files inside the sandbox. Commands: view (read file), create (write new file), str_replace (find and replace text), insert (add text at line number). Use this to write the patched .sol source.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              enum: ["view", "create", "str_replace", "insert"],
              description: "The editor operation to perform",
            },
            path: {
              type: "string",
              description: "Absolute path to the file",
            },
            file_text: {
              type: "string",
              description: "File contents (for create command)",
            },
            old_str: {
              type: "string",
              description: "Text to find (for str_replace command)",
            },
            new_str: {
              type: "string",
              description: "Replacement text (for str_replace and insert commands)",
            },
            insert_line: {
              type: "number",
              description: "Line number to insert at (for insert command)",
            },
            view_range: {
              type: "array",
              items: { type: "number" },
              description:
                "Start and end line numbers [start, end] (for view command)",
            },
          },
          required: ["command", "path"],
        },
      },
    },

    {
      type: "function",
      function: {
        name: "read_file",
        description:
          "Read the contents of a file at the given path inside the sandbox.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute path to the file to read",
            },
          },
          required: ["path"],
        },
      },
    },

    {
      type: "function",
      function: {
        name: "verify_patch",
        description:
          "Build the patched project, etch its runtime bytecode onto the forked contract, rerun Red's exploit, rerun it again from a fresh attacker EOA, run the benign suite, and diff storage layout against the original. Returns a JSON verdict with exploitNeutralized, benignPassed, regressions, storageLayoutChanged, freshAttackerNeutralized, and optional error. This is the ONLY way to know if your patch succeeded.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------

export interface BlueToolResult {
  output: string;
  isError: boolean;
  verification?: PatchVerification;
}

export interface BlueExecutorArgs {
  sandbox: SandboxManager;
  containerId: string;
  /** The patched project root — where Blue's edits live. */
  patchedProjectRoot: string;
  /** The pristine original project root — used as the storage-layout baseline. */
  originalProjectRoot: string;
  /** `VerifyPatchArgs` minus the fields the executor fills in from its own state. */
  verifyArgs: Omit<
    VerifyPatchArgs,
    "sandboxId" | "originalSourcePath" | "patchedSourcePath"
  >;
  toolTimeout?: number;
}

/**
 * Blue-team tool executor. Mirrors the shape of ToolExecutor (Red's) but
 * routes through the narrower tool set and enforces the restricted bash
 * sandboxing rules the prompt promises.
 */
export class BlueToolExecutor {
  private readonly sandbox: SandboxManager;
  private readonly containerId: string;
  private readonly patchedRoot: string;
  private readonly originalRoot: string;
  private readonly verifyArgs: Omit<
    VerifyPatchArgs,
    "sandboxId" | "originalSourcePath" | "patchedSourcePath"
  >;
  private readonly toolTimeout: number;

  constructor(args: BlueExecutorArgs) {
    this.sandbox = args.sandbox;
    this.containerId = args.containerId;
    this.patchedRoot = args.patchedProjectRoot;
    this.originalRoot = args.originalProjectRoot;
    this.verifyArgs = args.verifyArgs;
    this.toolTimeout = args.toolTimeout ?? 120_000;
  }

  async execute(toolName: string, input: any): Promise<BlueToolResult> {
    switch (toolName) {
      case "bash":
        return this.executeBash(input);
      case "str_replace_editor":
        return this.executeEditor(input);
      case "read_file":
        return this.executeReadFile(input);
      case "verify_patch":
        return this.executeVerifyPatch();
      default:
        return { output: `Unknown tool: ${toolName}`, isError: true };
    }
  }

  // ---- bash (restricted) ----

  private async executeBash(input: {
    command: string;
  }): Promise<BlueToolResult> {
    if (typeof input?.command !== "string" || !input.command.trim()) {
      return { output: "bash requires a non-empty `command` string.", isError: true };
    }
    const guard = blockedCommandReason(input.command);
    if (guard) {
      return {
        output: `bash command blocked by Blue sandbox: ${guard}`,
        isError: true,
      };
    }

    try {
      // Run from the patched project root so `forge build` etc. resolve.
      const cmd = `cd '${this.patchedRoot}' && ${input.command}`;
      const result = await this.sandbox.exec(
        this.containerId,
        cmd,
        this.toolTimeout
      );
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      return {
        output: output || "(no output)",
        isError: result.exitCode !== 0,
      };
    } catch (err: any) {
      return {
        output: `Error executing command: ${err?.message ?? String(err)}`,
        isError: true,
      };
    }
  }

  // ---- str_replace_editor ----

  private async executeEditor(input: {
    command: "view" | "create" | "str_replace" | "insert";
    path: string;
    file_text?: string;
    old_str?: string;
    new_str?: string;
    insert_line?: number;
    view_range?: [number, number];
  }): Promise<BlueToolResult> {
    if (!input?.path) {
      return { output: "str_replace_editor requires `path`.", isError: true };
    }
    const resolved = this.resolvePath(input.path);
    if (!resolved) {
      return {
        output: `str_replace_editor blocked: path must be under /workspace. Got: ${input.path}`,
        isError: true,
      };
    }

    try {
      switch (input.command) {
        case "view": {
          const range = input.view_range;
          const cmd = range
            ? `sed -n '${range[0]},${range[1]}p' '${resolved}'`
            : `cat -n '${resolved}'`;
          const r = await this.sandbox.exec(this.containerId, cmd, this.toolTimeout);
          return {
            output: r.stdout || r.stderr || "(empty)",
            isError: r.exitCode !== 0,
          };
        }
        case "create": {
          if (typeof input.file_text !== "string") {
            return { output: "file_text required for create.", isError: true };
          }
          const dir = resolved.substring(0, resolved.lastIndexOf("/"));
          await this.sandbox.exec(this.containerId, `mkdir -p '${dir}'`);
          await this.sandbox.writeFile(this.containerId, resolved, input.file_text);
          return { output: `File created: ${resolved}`, isError: false };
        }
        case "str_replace": {
          if (typeof input.old_str !== "string" || typeof input.new_str !== "string") {
            return {
              output: "old_str and new_str required for str_replace.",
              isError: true,
            };
          }
          const content = await this.sandbox.readFile(this.containerId, resolved);
          if (!content.includes(input.old_str)) {
            return {
              output: `old_str not found in ${resolved}. Make sure the string matches exactly.`,
              isError: true,
            };
          }
          const updated = content.replace(input.old_str, input.new_str);
          await this.sandbox.writeFile(this.containerId, resolved, updated);
          return { output: `Replacement made in ${resolved}`, isError: false };
        }
        case "insert": {
          if (typeof input.insert_line !== "number" || typeof input.new_str !== "string") {
            return {
              output: "insert_line and new_str required for insert.",
              isError: true,
            };
          }
          const content = await this.sandbox.readFile(this.containerId, resolved);
          const lines = content.split("\n");
          lines.splice(input.insert_line, 0, input.new_str);
          await this.sandbox.writeFile(this.containerId, resolved, lines.join("\n"));
          return {
            output: `Inserted at line ${input.insert_line} in ${resolved}`,
            isError: false,
          };
        }
        default:
          return {
            output: `Unsupported editor command: ${String(input.command)}`,
            isError: true,
          };
      }
    } catch (err: any) {
      return { output: `str_replace_editor error: ${err?.message ?? err}`, isError: true };
    }
  }

  // ---- read_file ----

  private async executeReadFile(input: {
    path: string;
  }): Promise<BlueToolResult> {
    if (!input?.path) {
      return { output: "read_file requires `path`.", isError: true };
    }
    const resolved = this.resolvePath(input.path);
    if (!resolved) {
      return {
        output: `read_file blocked: path must be under /workspace. Got: ${input.path}`,
        isError: true,
      };
    }
    try {
      const content = await this.sandbox.readFile(this.containerId, resolved);
      return { output: content, isError: false };
    } catch (err: any) {
      return { output: `Failed to read file: ${err?.message ?? err}`, isError: true };
    }
  }

  // ---- verify_patch ----

  private async executeVerifyPatch(): Promise<BlueToolResult> {
    try {
      const verification = await verifyPatch(this.sandbox, {
        ...this.verifyArgs,
        sandboxId: this.containerId,
        originalSourcePath: this.originalRoot,
        patchedSourcePath: this.patchedRoot,
      });
      return {
        output: JSON.stringify(verification, null, 2),
        isError: !!verification.error,
        verification,
      };
    } catch (err: any) {
      return {
        output: `verify_patch failed to run: ${err?.message ?? String(err)}`,
        isError: true,
      };
    }
  }

  // ---- path resolution ----

  private resolvePath(path: string): string | null {
    // Absolute paths are allowed only under /workspace.
    if (path.startsWith("/")) {
      return path.startsWith("/workspace/") || path === "/workspace" ? path : null;
    }
    // Relative paths resolve into the patched project root.
    const joined = `${this.patchedRoot.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    return joined;
  }
}

// Block networking, sudo, and writes outside /workspace. Keep the blocklist
// tight enough to stop the obvious footguns without fighting the model on
// legitimate forge/cast/grep invocations.
function blockedCommandReason(cmd: string): string | null {
  const lowered = cmd.toLowerCase();
  const BLOCKED = [
    // Networking
    "curl", "wget", "nc ", "netcat", "ssh ", "scp ", "ping ",
    // Package managers that touch the network
    "apt ", "apt-get", "apk add", "pip install", "npm install", "yarn add",
    "pnpm install", "go install", "cargo install",
    // Privilege escalation
    "sudo ", "su -", "doas ",
    // Host escape
    "chroot",
  ];
  for (const needle of BLOCKED) {
    if (lowered.includes(needle)) {
      return `command contains blocked token \`${needle.trim()}\``;
    }
  }
  // Writes outside /workspace (heuristic — catches absolute paths only).
  // Does not try to parse redirection fully; a determined attacker would need
  // to go through a script, which read_file + create would flag via the path
  // guard anyway.
  const WRITE_OPS = [">", ">>", "tee ", "dd "];
  for (const op of WRITE_OPS) {
    const idx = lowered.indexOf(op);
    if (idx < 0) continue;
    const tail = cmd.slice(idx + op.length).trimStart();
    if (tail.startsWith("/") && !tail.startsWith("/workspace/") && !tail.startsWith("/tmp/")) {
      return `redirect/write target outside /workspace or /tmp: ${tail.slice(0, 40)}`;
    }
  }
  return null;
}
