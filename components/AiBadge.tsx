// Shared "AI-assisted" label for every AI-generated surface in the app
// (doc chat, check-in draft, Weekly Analysis, document extraction, coach
// brief) — see specs/phase-4-ai-transparency.md. One component, not five
// bespoke labels, so the marker stays visually consistent everywhere.

export function AiBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent ${className}`}
      title="Drafted by AI — review before relying on it."
    >
      AI-assisted
    </span>
  );
}
