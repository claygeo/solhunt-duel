import type { UiFixture } from "@/lib/fixture";
import fixture from "@/public/fixtures/dexible.json";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Pivot from "@/components/Pivot";
import RoundCard from "@/components/RoundCard";
import AuditTrail from "@/components/AuditTrail";
import Methodology from "@/components/Methodology";

const fx = fixture as UiFixture;

export default function Page() {
  return (
    <main className="min-h-screen bg-bg">
      <Header />
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-8">
        <Hero fx={fx} />
        <Pivot text={fx.pivot.narrative} />
        {fx.rounds.map((r) => (
          <RoundCard key={r.round} round={r} />
        ))}
        <AuditTrail entries={fx.audit} />
        <Methodology text={fx.methodology} />
      </div>
    </main>
  );
}
