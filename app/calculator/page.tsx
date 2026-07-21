import { getSettings, dashboardData } from "@/lib/stats";
import { CapCalculator } from "@/components/CapCalculator";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const [settings, data] = await Promise.all([getSettings(), dashboardData()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Classic Physique weight-cap calculator</h1>
        <p className="text-sm text-muted">
          Deterministic lookup against the official NPC height-to-weight chart —
          no AI involved.
        </p>
      </div>
      <section className="rounded-xl border border-borderc bg-surface p-4">
        <CapCalculator
          defaultHeightIn={settings.heightInches}
          currentWeightLbs={data.latestWeight?.weightLbs ?? null}
        />
      </section>
    </div>
  );
}
