import { createTwoFilesPatch, structuredPatch } from "diff";

export interface DiffLine {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
}

/**
 * Produce a unified-diff line list from two source strings.
 * No external CSS — we render styled spans ourselves.
 */
export function unifiedDiff(before: string, after: string): DiffLine[] {
  const patch = structuredPatch(
    "before.sol",
    "after.sol",
    before,
    after,
    "",
    "",
    { context: 2 },
  );

  const lines: DiffLine[] = [];
  for (const hunk of patch.hunks) {
    lines.push({
      kind: "hunk",
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    });
    for (const raw of hunk.lines) {
      const sigil = raw[0];
      const body = raw.slice(1);
      if (sigil === "+") lines.push({ kind: "add", text: "+ " + body });
      else if (sigil === "-") lines.push({ kind: "del", text: "- " + body });
      else lines.push({ kind: "ctx", text: "  " + body });
    }
  }
  return lines;
}

export function countAddRemove(before: string, after: string): {
  added: number;
  removed: number;
} {
  const patch = createTwoFilesPatch("a", "b", before, after, "", "", {
    context: 0,
  });
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
  }
  return { added, removed };
}
