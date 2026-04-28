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
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <a
            href="/leaderboard/"
            className="font-mono text-[11px] tracking-[0.08em] text-amber underline-offset-4 hover:underline sm:text-[12px]"
          >
            LEADERBOARD
          </a>
          <span className="hidden font-sans text-[10px] text-mute sm:inline sm:text-[11px]">
            autonomous red vs blue audit loop
          </span>
        </div>
      </div>
    </header>
  );
}
