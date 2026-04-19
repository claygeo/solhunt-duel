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
    <div className="flex min-w-0 flex-col border border-hairline">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline bg-[#060606] px-3 py-2">
        <span className="truncate font-mono text-[10.5px] text-mute sm:text-[11px]">
          {title}
        </span>
        {caption ? (
          <span className="truncate font-mono text-[10px] text-mute">
            {caption}
          </span>
        ) : null}
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-[1.55] text-ink sm:p-4 sm:text-[11.5px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
