# Coach/Client Scoped Workspace — Documents + Doc Chat — Build Spec

**Source:** VIK-146 (Documents client selector) and VIK-147 (Doc Chat shared
thread) — Vik's request for a coach-side client selector on both surfaces.
No existing spec covers this: `specs/phase-2.5-coach-dashboard.md` built the
read-only per-client dashboard (`/clients/[accountId]`) but never touched
documents or chat, which today are both entirely single-tenant — every route
reads/writes `session.accountId` and nothing else.
**This pass covers:** letting a coach select a client and act *within that
client's* document library and chat thread — upload/view/delete documents on
their behalf, and participate in a single chat thread the client can also
use, both parties talking to the same bot in the same window.
**Doesn't cover:** multi-coach scenarios (this repo's existing single-coach
assumption, `specs/client-accounts.md`, is unchanged by this work), real-time/
websocket infrastructure (see §2's "Live visibility" — polling is the
deliberate v1 choice), or any change to `lib/rag.ts`'s retrieval logic
(already scoped correctly, see §2).
**Effort:** `xhigh` per `CLAUDE.md` — §2 adds a column to `lib/db/schema.ts`,
and both §1 and §2 touch account-scoping on routes named explicitly in
`AGENTS.md`'s "core infrastructure" list. `/api/documents/[id]` in particular
is one of the two routes PR #4's cross-tenant IDOR shipped on — this is the
one area of the codebase where "just wire it up" has bitten before, so both
sections below spell out the authorization path in full rather than leaving
it to be improvised at implementation time.

---

## 0. Shared primitive: resolving which account a coach is acting on

Both features need the same thing — a coach optionally acting on a specific
client's data instead of their own — so build it once, in `lib/auth.ts`,
rather than each route reinventing it:

```ts
/** Resolves the accountId a request should operate on. Absent or matching
 *  the caller's own accountId: acts on the caller's own account (unchanged
 *  behavior for clients, and for a coach who hasn't selected a client — see
 *  specs/coach-client-scoped-workspace.md). Present and different: only a
 *  coach may act on another account, and only a real client account —
 *  never silently falls back to the caller's own account on a bad/forbidden
 *  request, since that would mask the bug instead of surfacing it. */
export async function resolveWorkspaceAccountId(
  session: SessionPayload,
  requestedAccountId: number | null,
): Promise<number | NextResponse> {
  if (requestedAccountId == null || requestedAccountId === session.accountId) {
    return session.accountId;
  }
  if (session.role !== "coach") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const client = await getClientAccount(requestedAccountId);
  if (!client) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  return client.id;
}
```

Callers: `const resolved = await resolveWorkspaceAccountId(session,
requestedId); if (resolved instanceof NextResponse) return resolved;`. This
is for routes that aren't already keyed by an existing row (list/create
endpoints) — `GET /api/documents`, `POST /api/documents`, `GET /api/protocols`,
`GET`/`POST`/`DELETE /api/chat`.

**Routes keyed by an existing row id** (`DELETE /api/documents/[id]`,
`POST /api/documents/[id]/reprocess`) don't need a separate `accountId`
param — authorize from the row's own `accountId` instead: allow if it equals
`session.accountId`, or if `session.role === "coach"` and
`getClientAccount(row.accountId)` resolves (i.e. the row belongs to one of
this coach's clients). A coach passing a document id that isn't theirs or
any client's still 404s exactly as today — this doesn't loosen that check,
it only widens whose rows count as "theirs to act on."

**Dropdown population**: `GET /api/clients` already exists
(`app/api/clients/route.ts`), is already coach-only (`requireCoach()`), and
already returns `{id, name, createdAt}[]` from `listClientAccounts()` — no
new endpoint needed for either feature's selector.

---

## 1. Documents — client-scoped upload/library (VIK-146)

- `GET /api/documents`, `POST /api/documents`, and `GET /api/protocols`
  (the Documents page renders both together) each accept an optional
  `accountId` — query param on `GET`, form field on `POST` — resolved via
  `resolveWorkspaceAccountId()`.
- `DELETE /api/documents/[id]` and `POST /api/documents/[id]/reprocess` use
  the row-ownership authorization from §0 — no request param needed.
- **Page scoping**: selecting a client scopes the *whole* `/documents`
  page — upload target, the Library table, and Protocol history all switch
  together. A coach never uploads to client A while looking at client B's
  existing library; that mismatch would be actively confusing, not just
  inconsistent.
- **Default state**: no client selected → `session.accountId` (the coach's
  own account), identical to today's behavior. This keeps a coach who
  hasn't selected anyone — including the self-coaching demo account —
  working exactly as it does now.
- **UI**: a `<select>` at the top of `/documents`, sourced from
  `GET /api/clients`, rendered only when `session.role === "coach"` (a
  client account sees the page exactly as today — no selector, no behavior
  change). Selecting a client re-fetches documents/protocols for that
  `accountId` and re-scopes the upload form's target.
- **No schema change** — `documents` and `protocols` already carry
  `accountId`; this is purely an authorization + UI change.

---

## 2. Doc Chat — shared 2-way thread (VIK-147)

### Schema change

`chatMessages` (`lib/db/schema.ts:374`) has `accountId` + `role: "user" |
"assistant"` — nothing distinguishes *which human* sent a `"user"` row.
Add a `sender_account_id` column:

```ts
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  accountId: accountIdColumn(),        // whose thread this is — always the
                                        // client account; RAG retrieval
                                        // stays grounded in this account's
                                        // documents regardless of sender.
  senderAccountId: accountIdColumn(),  // who actually authored this row.
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  sources: jsonb("sources"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- **`senderAccountId` for `role: "assistant"` rows**: the bot has no
  account, so there's no meaningful sender to record. Rather than leaving
  the column nullable (which would need a conditional-NOT-NULL check
  constraint just for this one case), set it to the thread's own
  `accountId` for assistant rows — deliberate and documented here, not
  "whatever's convenient," per this repo's existing `source`-column
  convention precedent (`specs/phase-2-open-wearables.md` §1). The UI never
  reads `senderAccountId` for `role: "assistant"` rows anyway (they always
  render as the bot via the existing `AiBadge` styling), so this is inert
  by construction, not a real ambiguity.
- **Migration**: every existing row is self-authored (sharing didn't exist
  before this), so backfill `sender_account_id = account_id` for all
  existing rows in the same migration, then add the `NOT NULL` constraint.
  Per `AGENTS.md`'s migration rules, **this migration must be dry-run
  against the `test` Neon branch before merge** — it adds a `NOT NULL`
  constraint, exactly the case that rule exists for.

### Authorization

Same `resolveWorkspaceAccountId()` pattern as §1, applied to
`GET`/`POST`/`DELETE /api/chat`. On `POST`, the two id fields diverge:
`accountId` = the resolved target (whose thread this is — the client's, per
§0's resolution), `senderAccountId` = `session.accountId` always (whoever is
actually authenticated and typing, coach or client). A client's own
messages naturally have `senderAccountId === accountId`; a coach's messages
in that same thread have `senderAccountId` = the coach's id while
`accountId` stays the client's.

This also means **a client's ordinary `/chat` page needs no special
handling to become "shared"** — a client always operates on their own
`accountId` (unchanged), and once a coach posts into that same thread
(same `accountId`, different `senderAccountId`), the client's existing
`GET /api/chat` (no `accountId` param, defaults to self) already returns
those rows. The mirror falls out of the data model; it isn't separate
plumbing to build.

`DELETE /api/chat` (the existing "clear history" button) also resolves via
`resolveWorkspaceAccountId()` — a coach clearing a client's thread is a
real, slightly scarier destructive action than clearing your own. Update
the existing `confirm("Clear the whole conversation?")` copy to name the
client explicitly when a coach is acting on their behalf (e.g. `Clear
{clientName}'s whole conversation?`) so this isn't a silent footgun.

### Every message triggers a bot reply, regardless of sender

Confirmed reading of Vik's request ("the client and coach can both chat
with the bot") — both a coach's and a client's `role: "user"` message calls
`answerQuestion(accountId, message, history)` and appends an assistant
reply, visible to both parties in the same thread. `answerQuestion()`
itself needs no change — it's already keyed on the thread's `accountId`
(the client), so it retrieves from that client's documents regardless of
who's asking, which is the correct behavior: a coach asking "what does the
plan say about sodium" while looking at a specific client should get an
answer grounded in *that client's* uploaded documents, not the coach's own.

### Live visibility — polling, not real-time infrastructure

No websocket/real-time infrastructure exists anywhere in this codebase
today, and this is a coaching app, not a live support widget — a few
seconds of latency between a coach's message landing and a client noticing
it is fine. **Deliberate v1 choice: poll `GET /api/chat` on an interval
(e.g. every 5–10s) while the Doc Chat page is open**, for both roles. Note
this explicitly so it isn't mistaken for an oversight later — building
actual push infrastructure for this would be real, unjustified scope at
current usage levels.

### UI

- Same client-selector pattern as §1 — a `<select>` sourced from
  `GET /api/clients`, rendered only for `session.role === "coach"`,
  re-scoping `/chat` to the selected client's thread (default: the coach's
  own account, same "no behavior change if nothing's selected" rule as §1).
- `GET /api/chat` returns a `senderName` per message (joined from
  `accounts.name` server-side) alongside the existing fields, so the client
  doesn't need a separate lookup to label bubbles. Rendering rule: `role
  === "assistant"` → existing bot styling, unchanged. `role === "user" &&
  senderAccountId === session.accountId` → "You". `role === "user" &&
  senderAccountId !== session.accountId` → the returned `senderName`
  (e.g. "Your coach" if the viewer is a client, or the client's actual name
  if the viewer is the coach).

---

## Explicitly deferred

- **Read receipts / "coach is typing" indicators.** The existing
  `TypingIndicator` in `app/chat/page.tsx` is a local optimistic-send
  artifact, not a cross-party signal — stays that way. Real presence
  indicators are real scope, not justified by this ticket pair.
- **Per-message editing or deletion.** Only whole-thread clear exists today
  (`DELETE /api/chat`); this spec doesn't add per-message operations.
- **Multi-coach thread visibility rules.** Out of scope by the existing
  single-coach assumption (`specs/client-accounts.md`) — revisit only if
  that assumption is ever revisited itself, same trigger condition already
  documented there.
- **Retrieval redesign.** `lib/rag.ts`'s `answerQuestion()`/`retrieve()`
  need no change — already correctly scoped by the thread's `accountId`.

## Recommended sequencing

1. `resolveWorkspaceAccountId()` + the row-ownership authorization pattern
   (§0) — foundation, no schema change, used by both features below.
2. Documents route scoping + UI (§1, VIK-146) — no schema change, lowest
   risk, ship first.
3. `chat_messages.sender_account_id` migration (§2) — dry-run against the
   `test` Neon branch per `AGENTS.md` before merge, independent of the UI
   work below.
4. Doc Chat route scoping + UI (§2, VIK-147) — depends on 1 and 3.
5. Polling refresh in the Doc Chat UI — can land alongside 4 or as a fast
   follow-up; no other dependency.

## Test plan (TDD — write these first, per repo convention)

- `resolveWorkspaceAccountId()`: no `accountId` given → resolves to caller's
  own; coach requesting a valid client id → resolves to that client;
  coach requesting a non-client or nonexistent id → 404; a client
  requesting any id other than their own → 403, never silently falls back.
- Documents: `GET`/`POST /api/documents` and `GET /api/protocols` honor the
  resolved `accountId`; `DELETE`/`reprocess` authorize via row ownership,
  including the "coach acting on a client's document" case and the "coach
  poking at an unrelated document" 404 case.
- Chat: a coach's `POST` into a client's thread writes `senderAccountId` =
  coach id, `accountId` = client id; a client's own `POST` writes both as
  their own id; every `POST` (either sender) appends an assistant reply;
  `GET` returns the correct `senderName` for both parties; `DELETE` clears
  the resolved thread, not necessarily the requester's own.
- Migration: existing rows backfill `sender_account_id = account_id`
  correctly; the `NOT NULL` dry-run against `test` succeeds before merge.
