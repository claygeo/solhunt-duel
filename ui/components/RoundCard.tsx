import type { UiFixture } from "@/lib/fixture";
import CodeBlock from "./CodeBlock";
import DiffView from "./DiffView";
import GateChips from "./GateChips";

type Round = UiFixture["rounds"][number];

function formatMs(ms: number) {
  const s = Math.round(ms / 100) / 10;
  return `${s}s`;
}

export default function RoundCard({ round }: { round: Round }) {
  const r1 = round.round === 1 && round.red.found && round.blue;

  return (
    <section className="flex flex-col gap-4 border border-hairline p-5 sm:p-6 lg:p-7">
      <div className="flex flex-col gap-2 border-b border-hairline pb-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between">
        <h2 className="font-mono text-[12px] tracking-[0.14em] text-ink sm:text-[13px]">
          {round.label}
        </h2>
        <span className="font-mono text-[10.5px] text-mute sm:text-[11px]">
          <span className="text-ink">red</span> {round.red.turns} turns ·{" "}
          {formatMs(round.red.durationMs)}
          {round.blue ? (
            <>
              {"  ·  "}
              <span className="text-ink">blue</span> {round.blue.turns} turns ·{" "}
              {formatMs(round.blue.durationMs)}
            </>
          ) : null}
        </span>
      </div>

      {r1 && round.red.exploitSource && round.blue ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CodeBlock
              title="red / test/Exploit.t.sol"
              code={round.red.exploitSource}
              caption={`${round.red.model} · ${round.red.turns} turns · forge PASS`}
            />
            <DiffView
              title="blue / DexibleProxy.sol"
              before={round.blue.originalSource}
              after={round.blue.patchedSource}
              caption={`${round.blue.model} · ${round.blue.turns} turns`}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="font-sans text-[13px] leading-[1.65] text-ink">
              <span className="mr-1 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">
                patch rationale.
              </span>
              {round.blue.rationale}
            </div>
            {round.verification ? (
              <GateChips gates={round.verification as Record<string, boolean>} />
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          {round.summary ? (
            <p className="font-sans text-[13px] leading-relaxed text-ink">
              {round.summary}
            </p>
          ) : null}
          {round.red.reconSnippet ? (
            <CodeBlock
              title="red / recon trace"
              code={round.red.reconSnippet}
              caption={`${round.red.model} · ${round.red.turns} turns · found=${round.red.found ? "true" : "false"}`}
            />
          ) : null}
          <div className="flex flex-wrap gap-2 font-mono text-[11px]">
            <span className="inline-flex items-center border border-hairline px-3 py-[6px] leading-none text-[#8a8a8a]">
              patch held
            </span>
            <span className="inline-flex items-center border border-hairline px-3 py-[6px] leading-none text-[#8a8a8a]">
              no alt pivot
            </span>
            <span className="inline-flex items-center border border-amber/60 px-3 py-[6px] leading-none text-amber">
              convergence: hardened
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
