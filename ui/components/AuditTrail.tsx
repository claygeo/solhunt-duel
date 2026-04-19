import type { UiFixture } from "@/lib/fixture";

export default function AuditTrail({
  entries,
}: {
  entries: UiFixture["audit"];
}) {
  return (
    <section className="border border-hairline p-4 sm:p-5">
      <div className="mb-3 font-sans text-[11px] uppercase tracking-[0.14em] text-mute">
        grounded audit trail
      </div>
      <ul className="flex flex-col gap-2.5 font-mono text-[11px] leading-[1.55] sm:text-[11.5px]">
        {entries.map((e, i) => (
          <li key={i} className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-3 sm:gap-y-1">
            <span className="shrink-0 text-amber">{e.tag}:</span>
            <span className="text-ink">{e.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
