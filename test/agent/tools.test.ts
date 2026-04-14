import { describe, it, expect } from "vitest";
import { getToolDefinitions } from "../../src/agent/tools.js";

describe("getToolDefinitions", () => {
  it("returns all required tools", () => {
    const tools = getToolDefinitions();
    const names = tools.map((t) => t.function.name);

    expect(names).toContain("bash");
    expect(names).toContain("str_replace_editor");
    expect(names).toContain("read_file");
    expect(names).toContain("forge_test");
  });

  it("all tools use OpenAI function calling format", () => {
    const tools = getToolDefinitions();

    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeDefined();
    }
  });

  it("bash tool has command parameter", () => {
    const tools = getToolDefinitions();
    const bash = tools.find((t) => t.function.name === "bash")!;
    expect(bash.function.parameters.properties.command).toBeDefined();
    expect(bash.function.parameters.required).toContain("command");
  });

  it("str_replace_editor has command and path parameters", () => {
    const tools = getToolDefinitions();
    const editor = tools.find((t) => t.function.name === "str_replace_editor")!;
    expect(editor.function.parameters.properties.command).toBeDefined();
    expect(editor.function.parameters.properties.path).toBeDefined();
    expect(editor.function.parameters.required).toContain("command");
    expect(editor.function.parameters.required).toContain("path");
  });

  it("custom tools have proper input parameters", () => {
    const tools = getToolDefinitions();
    const readFile = tools.find((t) => t.function.name === "read_file")!;
    const forgeTest = tools.find((t) => t.function.name === "forge_test")!;

    expect(readFile.function.parameters.properties.path).toBeDefined();

    expect(forgeTest.function.parameters.properties.test_file).toBeDefined();
    expect(forgeTest.function.parameters.required).toContain("test_file");
  });
});
