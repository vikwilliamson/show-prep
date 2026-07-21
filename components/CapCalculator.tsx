"use client";

import { useState } from "react";
import {
  CLASSIC_PHYSIQUE_CHART,
  classicPhysiqueWeightCap,
  formatHeight,
} from "@/lib/classic-physique";

export function CapCalculator({
  defaultHeightIn,
  currentWeightLbs,
}: {
  defaultHeightIn: number | null;
  currentWeightLbs: number | null;
}) {
  const initial = defaultHeightIn ?? 70;
  const [feet, setFeet] = useState(Math.floor(initial / 12));
  const [inches, setInches] = useState(
    Math.round((initial % 12) * 10) / 10,
  );
  const heightIn = feet * 12 + inches;
  const valid = heightIn > 36 && heightIn < 96;
  const result = valid ? classicPhysiqueWeightCap(heightIn) : null;
  const margin =
    result && currentWeightLbs != null
      ? Math.round((result.maxWeightLbs - currentWeightLbs) * 10) / 10
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Feet</span>
          <input
            type="number"
            min={4}
            max={7}
            value={feet}
            onChange={(e) => setFeet(Number(e.target.value))}
            className="w-20 rounded-md border border-borderc bg-background px-3 py-1.5 tabular-nums"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Inches</span>
          <input
            type="number"
            min={0}
            max={11.9}
            step={0.5}
            value={inches}
            onChange={(e) => setInches(Number(e.target.value))}
            className="w-20 rounded-md border border-borderc bg-background px-3 py-1.5 tabular-nums"
          />
        </label>
        {result && (
          <div className="rounded-xl border border-borderc bg-background px-4 py-2">
            <p className="text-2xl font-semibold tabular-nums">
              {result.maxWeightLbs} lbs
              <span className="ml-2 text-sm font-normal text-muted">
                ({result.maxWeightKg} kg) max at {formatHeight(heightIn)}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Bracket: {result.row.label}
              {margin != null && (
                <span className={margin >= 0 ? "text-good" : "text-bad"}>
                  {" "}
                  · you are {Math.abs(margin)} lbs {margin >= 0 ? "under" : "OVER"} the cap
                  {currentWeightLbs != null && ` at ${currentWeightLbs} lbs`}
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      <table className="w-full max-w-xl text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-1.5 pr-3">Height</th>
            <th className="py-1.5 pr-3">Max weight (lbs)</th>
            <th className="py-1.5">Max weight (kg)</th>
          </tr>
        </thead>
        <tbody>
          {CLASSIC_PHYSIQUE_CHART.map((row) => {
            const active = result?.row.label === row.label;
            return (
              <tr
                key={row.label}
                className={`border-t border-borderc ${active ? "bg-accent/10 font-medium" : ""}`}
              >
                <td className="py-1.5 pr-3">{row.label}</td>
                <td className="py-1.5 pr-3 tabular-nums">{row.maxWeightLbs}</td>
                <td className="py-1.5 tabular-nums">{row.maxWeightKg}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted">
        Source: NPC/NPC Worldwide Classic Physique chart (2023 update, effective
        Aug 2, 2023). Fractional heights round up to the next bracket.
      </p>
    </div>
  );
}
