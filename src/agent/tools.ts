import type { ToolDefinition } from "./provider.js";

// Tool definitions in OpenAI function calling format.
// This is the lingua franca — Ollama, OpenRouter, OpenAI all speak it.
// The Anthropic adapter in provider.ts converts to their format automatically.

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "bash",
        description:
          "Run a shell command inside the Docker sandbox. Returns stdout and stderr.",
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
          "View, create, or edit files inside the sandbox. Commands: view (read file), create (write new file), str_replace (find and replace text), insert (add text at line number).",
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
              description: "Start and end line numbers [start, end] (for view command)",
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
        name: "forge_test",
        description:
          "Run forge test inside the sandbox. Returns the test output including pass/fail status and call traces.",
        parameters: {
          type: "object",
          properties: {
            test_file: {
              type: "string",
              description:
                "Path to the test file relative to the project root (e.g., test/Exploit.t.sol)",
            },
            verbosity: {
              type: "number",
              description:
                "Verbosity level 1-5. Default 3 (-vvv). Higher shows more call trace detail.",
            },
            function_name: {
              type: "string",
              description:
                "Optional: specific test function to run (e.g., testExploit)",
            },
          },
          required: ["test_file"],
        },
      },
    },
  ];
}
