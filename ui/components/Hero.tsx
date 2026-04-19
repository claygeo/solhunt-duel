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
    <div className="flex flex-col gap-1">
      <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-mute">
        {label}
      </span>
      <span
        className={
          (mono ? "font-mono " : "font-sans ") +
          "tabular text-[15px] " +
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
    <section className="border border-hairline p-6 sm:p-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1 className="font-sans text-[28px] font-medium leading-none text-ink sm:text-[36px]">
            {fx.metadata.contractName}
          </h1>
          <span className="font-mono text-[12px] text-mute">
            {fx.metadata.contractAddress}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
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

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-hairline pt-4 font-mono text-[11px] text-mute">
          <span>
            fork: <span className="text-ink">{fx.metadata.chain}</span> @ block{" "}
            <span className="tabular text-ink">
              {fx.metadata.forkBlockNumber.toLocaleString()}
            </span>
          </span>
          <span>
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
