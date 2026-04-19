export default function CodeBlock({
  title,
  code,
  caption,
}: {
  title: string;
  code: string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col border border-hairline">
      <div className="flex items-center justify-between border-b border-hairline bg-[#060606] px-3 py-2">
        <span className="font-mono text-[11px] text-mute">{title}</span>
        {caption ? (
          <span className="font-mono text-[10px] text-mute">{caption}</span>
        ) : null}
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[11.5px] leading-[1.55] text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
