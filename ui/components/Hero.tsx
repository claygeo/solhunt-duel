import type { UiFixture } from "@/lib/fixture";

function Metric({
  label,
  value,
  accent,
  mono = true,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-mute">
        {label}
      </span>
      <span
        className={
          (mono ? "font-mono " : "font-sans ") +
          "tabular truncate text-[15px] sm:text-[16px] " +
          (accent ? "text-amber" : "text-ink")
        }
      >
        {value}
      </span>
    </div>
  );
}

export default function Hero({ fx }: { fx: UiFixture }) {
  const wall = (fx.stats.wallTimeSec / 60).toFixed(1);
  return (
    <section className="border border-hairline p-4 sm:p-7 lg:p-8">
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-6 sm:gap-y-2">
          <h1 className="font-sans text-[30px] font-medium leading-[1.05] text-ink sm:text-[36px]">
            {fx.metadata.contractName}
          </h1>
          <span className="truncate font-mono text-[11px] text-mute sm:text-[12px]">
            {fx.metadata.contractAddress}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-5 lg:grid-cols-6">
          <Metric label="vuln class" value={fx.metadata.vulnerabilityClass} />
          <Metric label="value @ risk" value={fx.metadata.valueImpacted} />
          <Metric
            label="convergence"
            value={fx.stats.convergence.toUpperCase()}
            accent
          />
          <Metric
            label="rounds"
            value={String(fx.stats.roundsExecuted)}
          />
          <Metric label="wall time" value={`${wall} min`} />
          <Metric
            label="real cost"
            value={`$${fx.stats.realCostUsd.toFixed(2)}`}
            accent
          />
        </div>

        <div className="flex flex-col gap-1.5 border-t border-hairline pt-4 font-mono text-[11px] text-mute sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
          <span className="truncate">
            fork: <span className="text-ink">{fx.metadata.chain}</span> @ block{" "}
            <span className="tabular text-ink">
              {fx.metadata.forkBlockNumber.toLocaleString()}
            </span>
          </span>
          <span className="truncate">
            fresh addr:{" "}
            <span className="text-ink">{fx.metadata.freshAddress}</span>
          </span>
          <span>
            notional:{" "}
            <span className="tabular text-ink">
              ${fx.stats.notionalCostUsd.toFixed(2)}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
