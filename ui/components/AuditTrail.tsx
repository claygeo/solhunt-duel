import type { UiFixture } from "@/lib/fixture";

export default function AuditTrail({
  entries,
}: {
  entries: UiFixture["audit"];
}) {
  return (
    <section className="border border-hairline p-5">
      <div className="mb-3 font-sans text-[11px] uppercase tracking-[0.14em] text-mute">
        grounded audit trail
      </div>
      <ul className="flex flex-col gap-2 font-mono text-[11.5px] leading-[1.55]">
        {entries.map((e, i) => (
          <li key={i} className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="shrink-0 text-amber">{e.tag}:</span>
            <span className="text-ink">{e.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
