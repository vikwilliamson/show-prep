import { getSettings, dashboardData } from "@/lib/stats";
import { CapCalculator } from "@/components/CapCalculator";
import { BodybuildingClassCalculator } from "@/components/BodybuildingClassCalculator";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const [settings, data] = await Promise.all([getSettings(), dashboardData()]);
  const currentWeightLbs = data.latestWeight?.weightLbs ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Weight cap / class calculators</h1>
        <p className="text-sm text-muted">
          Deterministic lookups against official NPC charts — no AI involved.
        </p>
      </div>

      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Classic Physique — height-to-weight cap
        </h2>
        <CapCalculator
          defaultHeightIn={settings.heightInches}
          currentWeightLbs={currentWeightLbs}
        />
      </section>

      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Bodybuilding — weight class
        </h2>
        <BodybuildingClassCalculator defaultWeightLbs={currentWeightLbs} />
      </section>
    </div>
  );
}
