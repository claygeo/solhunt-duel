export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-bg/95 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="h-[6px] w-[6px] rounded-full bg-amber" aria-hidden />
          <span className="font-mono text-[13px] tracking-[0.12em] text-ink">
            SOLHUNT-DUEL
          </span>
          <span className="hidden font-mono text-[11px] text-mute sm:inline">
            //
          </span>
          <span className="hidden font-mono text-[11px] text-mute sm:inline">
            dexible
          </span>
        </div>
        <div className="font-sans text-[11px] text-mute">
          autonomous red vs blue audit loop
        </div>
      </div>
    </header>
  );
}
