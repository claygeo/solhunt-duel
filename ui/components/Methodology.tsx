export default function Methodology({ text }: { text: string }) {
  return (
    <section className="border-t border-hairline pt-6">
      <div className="mb-2 font-sans text-[11px] uppercase tracking-[0.14em] text-mute">
        methodology
      </div>
      <p className="max-w-[820px] font-sans text-[12.5px] leading-[1.7] text-mute">
        {text}
      </p>
    </section>
  );
}
