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
              "flex items-center gap-2 border px-3 py-[5px] font-mono text-[11px] " +
              (ok
                ? "border-mint/30 text-mint"
                : "border-coral/30 text-coral")
            }
          >
            <span className="tabular">{ok ? "PASS" : "FAIL"}</span>
            <span>{label}</span>
          </span>
        );
      })}
    </div>
  );
}
