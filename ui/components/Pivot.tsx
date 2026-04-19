export default function Pivot({ text }: { text: string }) {
  return (
    <section className="border-l-2 border-amber pl-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-amber">
        autonomous pivot
      </div>
      <p className="mt-2 max-w-[780px] font-sans text-[13.5px] leading-[1.7] text-ink">
        {text}
      </p>
    </section>
  );
}
