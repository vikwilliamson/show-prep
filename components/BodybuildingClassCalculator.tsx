"use client";

import { useState } from "react";
import { BODYBUILDING_WEIGHT_CLASSES, bodybuildingWeightClass } from "@/lib/bodybuilding";

export function BodybuildingClassCalculator({
  defaultWeightLbs,
}: {
  defaultWeightLbs: number | null;
}) {
  const [weight, setWeight] = useState(defaultWeightLbs ?? 180);
  const valid = weight > 0 && weight < 400;
  const result = valid ? bodybuildingWeightClass(weight) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Bodyweight (lbs)</span>
          <input
            type="number"
            min={1}
            max={399}
            step={0.5}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-28 rounded-md border border-borderc bg-background px-3 py-1.5 tabular-nums"
          />
        </label>
        {result && (
          <div className="rounded-xl border border-borderc bg-background px-4 py-2">
            <p className="text-2xl font-semibold">
              {result.label}
              <span className="ml-2 text-sm font-normal text-muted">
                at {weight} lbs
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {result.toNextClassLbs != null
                ? `${result.toNextClassLbs} lbs to the next class up`
                : "Top class — no ceiling"}
            </p>
          </div>
        )}
      </div>

      <table className="w-full max-w-xl text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-1.5 pr-3">Class</th>
            <th className="py-1.5">Weight range (lbs)</th>
          </tr>
        </thead>
        <tbody>
          {BODYBUILDING_WEIGHT_CLASSES.map((row, i) => {
            const prevMax = BODYBUILDING_WEIGHT_CLASSES[i - 1]?.maxWeightLbs ?? 0;
            const active = result?.row.label === row.label;
            return (
              <tr
                key={row.label}
                className={`border-t border-borderc ${active ? "bg-accent/10 font-medium" : ""}`}
              >
                <td className="py-1.5 pr-3">{row.label}</td>
                <td className="py-1.5 tabular-nums">
                  {Number.isFinite(row.maxWeightLbs)
                    ? i === 0
                      ? `up to ${row.maxWeightLbs}`
                      : `${prevMax}–${row.maxWeightLbs}`
                    : `over ${prevMax}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted">
        Source: NPC official bodybuilding rules (npcnewsonline.com), 6-class
        format. Shows may run fewer or more classes (2–7) depending on
        entries — this isn&apos;t a cap, just which bracket you&apos;re judged
        in.
      </p>
    </div>
  );
}
