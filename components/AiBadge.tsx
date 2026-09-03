// Shared "AI-assisted" label for every AI-generated surface in the app
// (doc chat, check-in draft, Weekly Analysis, document extraction, coach
// brief) — see specs/phase-4-ai-transparency.md. One component, not five
// bespoke labels, so the marker stays visually consistent everywhere.

export function AiBadge({
  detail,
  className = "",
}: {
  /** What specifically grounded this output — shown in the tooltip. Keep
   *  it short and concrete, e.g. "Grounded in this week's synced macro,
   *  weight, water, and sleep data." Every call site should say what the
   *  model actually saw, not fall back to a generic string. */
  detail: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent ${className}`}
      title={detail}
    >
      AI-assisted
    </span>
  );
}
