export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-bg">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-amber" aria-hidden />
          <span className="truncate font-mono text-[12px] tracking-[0.12em] text-ink sm:text-[13px]">
            SOLHUNT-DUEL
          </span>
          <span className="hidden font-mono text-[11px] text-mute sm:inline">
            //
          </span>
          <span className="hidden font-mono text-[11px] text-mute sm:inline">
            dexible
          </span>
        </div>
        <div className="shrink-0 font-sans text-[10px] text-mute sm:text-[11px]">
          <span className="hidden sm:inline">autonomous red vs blue audit loop</span>
          <span className="sm:hidden">red vs blue</span>
        </div>
      </div>
    </header>
  );
}
