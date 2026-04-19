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
    <div className="flex min-w-0 flex-col border border-hairline">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline bg-[#060606] px-3 py-2">
        <span className="truncate font-mono text-[10.5px] text-mute sm:text-[11px]">
          {title}
        </span>
        <span className="truncate font-mono text-[10px] text-mute">
          <span className="text-mint">+{added}</span>
          {"  "}
          <span className="text-coral">-{removed}</span>
          {caption ? <span className="ml-3 hidden sm:inline">{caption}</span> : null}
        </span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-[1.6] sm:p-4 sm:text-[11.5px]">
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
