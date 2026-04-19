import { unifiedDiff, countAddRemove } from "@/lib/diff";

export default function DiffView({
  title,
  before,
  after,
  caption,
}: {
  title: string;
  before: string;
  after: string;
  caption?: string;
}) {
  const lines = unifiedDiff(before, after);
  const { added, removed } = countAddRemove(before, after);

  return (
    <div className="flex flex-col border border-hairline">
      <div className="flex items-center justify-between border-b border-hairline bg-[#060606] px-3 py-2">
        <span className="font-mono text-[11px] text-mute">{title}</span>
        <span className="font-mono text-[10px] text-mute">
          <span className="text-mint">+{added}</span>
          {"  "}
          <span className="text-coral">-{removed}</span>
          {caption ? <span className="ml-3">{caption}</span> : null}
        </span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-[11.5px] leading-[1.6]">
        <code>
          {lines.map((l, i) => {
            const cls =
              l.kind === "add"
                ? "diff-add"
                : l.kind === "del"
                  ? "diff-del"
                  : l.kind === "hunk"
                    ? "diff-hunk"
                    : "diff-ctx";
            return (
              <span key={i} className={`block ${cls}`}>
                {l.text}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
