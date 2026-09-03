// Client-side, read-only view of a coach's weekly brief
// (specs/phase-3-ai-weekly-coach-brief.md §4, client side). Renders nothing
// until the coach has approved a brief for the week — a draft is an
// internal coach-facing document, not something the client sees.

import { AiBadge } from "@/components/AiBadge";

export function CoachBriefCard({
  brief,
}: {
  brief: { status: string; content: string } | null;
}) {
  if (!brief || brief.status !== "approved") return null;

  return (
    <section className="rounded-xl border border-borderc bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
        This week from your coach
      </h2>
      <div className="space-y-3">
        <AiBadge detail="Grounded in this week's synced data." />
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{brief.content}</div>
      </div>
    </section>
  );
}
