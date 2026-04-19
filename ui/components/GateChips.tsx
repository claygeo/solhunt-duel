const LABELS: Record<string, string> = {
  exploitNeutralized: "exploitNeutralized",
  benignPassed: "benignPassed",
  freshAttackerNeutralized: "freshAttackerNeutralized",
  storageLayoutPreserved: "storageLayoutUnchanged",
};

export default function GateChips({
  gates,
}: {
  gates: Record<string, boolean>;
}) {
  return (
    <div className="flex flex-wrap gap-2 border border-hairline p-3">
      {Object.entries(LABELS).map(([k, label]) => {
        const ok = gates[k];
        return (
          <span
            key={k}
            className={
              "inline-flex items-center gap-2 border px-3 py-[6px] font-mono text-[11px] leading-none " +
              (ok
                ? "border-mint/50 text-mint"
                : "border-coral/50 text-coral")
            }
          >
            <span className="tabular font-medium">{ok ? "PASS" : "FAIL"}</span>
            <span className="break-all">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
