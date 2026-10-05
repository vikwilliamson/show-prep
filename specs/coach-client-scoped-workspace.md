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

> **Amended 2026-10-01 (VIK-157, accepted):** a message may be marked
> human-only, in which case no bot reply is generated. See the
> "human-only messages" section at the end of this spec.

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

---

## 2026-10-01 update (VIK-154): `PATCH /api/protocols/[id]` was missed

§0 lists the routes keyed by an existing row id that use row-ownership
authorization, and named only `DELETE /api/documents/[id]` and `POST
/api/documents/[id]/reprocess`. `PATCH /api/protocols/[id]` (Confirm /
Reject / Reactivate) belongs on that list too — §1 lets a coach upload a
document for a client, which creates a *pending protocol under the client's
account*, and the coach then has to be able to confirm it. It still scoped
to `session.accountId`, so a coach's Confirm 404'd ("Update failed.").

**Decision.** The route loads the protocol by id alone and authorizes with
`authorizeRowAccess(session, protocol.accountId)`, 404ing on `false` exactly
as before. Everything after that runs against the **protocol owner's**
`accountId`, not the caller's: confirm/reactivate supersedes the *owner's*
other active protocols (a coach confirming a client's protocol must not
supersede the coach's own, and must supersede the client's previous one).
A coach still cannot touch a protocol owned by another coach or any
non-client account.

**Tests.** `tests/protocols-route.test.ts`: coach confirm / reject /
reactivate on a client's protocol, supersede stays inside the client's
account, coach-vs-other-coach boundary 404s, nonexistent id 404s, and a
coach confirming their own protocol still works.

**Still own-account only, deliberately left (not part of this fix):**
`GET /api/documents/[id]` (the UI never calls it), `PUT /api/settings`
(coach-set client targets are a separate gap), `POST /api/analysis` and
`POST /api/checkins`.

---

## 2026-10-01 update (VIK-157): human-only messages in the shared Doc Chat thread

**Status: accepted — Vik reviewed the four decisions below and signed off;
implementation tickets are filed against them.**

§2's "Every message triggers a bot reply, regardless of sender" has no
escape hatch: a coach and client can't talk to *each other* in the thread
without the bot answering every line. **This amends that rule** — a message
can now be marked *human-only*, in which case no bot reply is generated.

**Decision 1 — a per-message flag, default off.** A new boolean on the
message, `human_only`, chosen at send time via a composer toggle ("Send
without the bot"). Default is off, so every existing flow — a client's
ordinary `/chat`, a coach asking the bot about a client's documents —
behaves exactly as today; nothing changes unless someone opts in per
message. Rejected alternatives: an `@bot` mention (changes the default for
everyone and makes a typo silently route to the wrong mode); a separate
human-only thread (splits one conversation in two and loses the "mirror"
property §2 was built around).

**Decision 2 — a column, not a new `role` value.** `chat_messages.role`
keeps meaning "who produced this": `"user"` = a human typed it. Adding a
third role (e.g. `"human"`) would overload that column and force every
consumer of `role` (the Anthropic history mapping, `AiBadge` rendering) to
learn a case it should simply ignore. Schema:

```ts
humanOnly: boolean("human_only").notNull().default(false),
```

The migration adds a `NOT NULL` column, so per `AGENTS.md` it **must be
dry-run against the `test` Neon branch before merge**. The default
backfills existing rows to `false` (all of them were bot-addressed), so no
separate backfill step. `role: "assistant"` rows are always
`human_only = false`. Effort: `xhigh` (schema), same as the original §2.

**Decision 3 — the bot never sees human-only messages.** Two reasons, both
deliberate:

- **Grounding.** `answerQuestion()` takes the thread `history`
  (`.slice(-8)` in `lib/rag.ts`); a coach's "call me tomorrow" in that
  window is noise that degrades answers. `POST /api/chat` filters
  `human_only = false` *before* building `history`, so the 8-message window
  is 8 bot-relevant messages, not 8 minus however many human ones landed.
- **Data flow.** Human-only text is never sent to Anthropic. That is a
  stronger privacy statement than "coach and client both see it", worth
  stating plainly given VIK-121's undocumented-data-flow finding — a client
  can trust that a human-only message stays between the two people in the
  thread (and the database).

Human-only messages are still visible to *both* parties (same thread, same
`GET`). This is not a private channel from the other human — only from the
bot.

**Decision 4 — both roles can send human-only messages.** §2's thread is
symmetric by design (the mirror falls out of the data model), and a
coach-only toggle would leave a client unable to message their coach
without the bot interjecting — the same problem, from the other side. No
role check beyond the existing `resolveWorkspaceAccountId()` authorization.

**API.**

- `POST /api/chat` accepts optional `humanOnly: boolean` (default `false`).
  When `true`: insert the user row with `human_only = true`, skip
  `answerQuestion()`, respond `{ user }` (no `assistant` key — callers
  must not assume it's present). `senderAccountId` / `accountId` semantics
  are unchanged.
- `GET /api/chat` returns `humanOnly` per row.
- `DELETE /api/chat` is unchanged (clears the whole thread, human-only
  messages included).

**UI.** A "Send without the bot" checkbox/toggle beside the composer,
default unchecked, resetting to unchecked after each send (sticky-on would
make the next bot question silently go unanswered — the failure mode worth
designing out). Human-only bubbles use the existing sender labels
("You" / sender name) with a small "Not sent to the bot" caption and no
`AiBadge`. The existing 5–10s polling picks them up with no change.

**Explicitly deferred.**

- **Unread / new-message indicators.** With bot replies, a sender always
  sees *something* come back; a human-only message gets no immediate
  response, and the recipient only sees it if they happen to have the page
  open (polling) — there is no notification. Acceptable for v1 at current
  usage, same reasoning as §2's "polling, not real-time"; if human-only
  messaging becomes the main use, revisit (email/push notification).
- **Toggling an already-sent message** between human-only and bot-addressed
  (per-message editing is already deferred in §2).

**Sequencing (follow-up tickets, after sign-off).**

1. `chat_messages.human_only` migration — dry-run on `test` per
   `AGENTS.md`; independent of the code below (as VIK-150 was).
2. `POST`/`GET /api/chat` changes (flag, skip bot, filter `history`).
3. Composer toggle + bubble rendering — depends on 1 and 2.

**Test plan (TDD — write first).**

- `POST` with `humanOnly: true`: user row stored with `human_only = true`,
  `answerQuestion` is **not** called, response has no `assistant`; both a
  coach-into-client's-thread and a client's own send.
- `POST` without the flag (and with `humanOnly: false`): unchanged — bot
  reply appended, row `human_only = false`.
- `history` passed to `answerQuestion` excludes human-only rows, and the
  `-8` window is computed after filtering (insert >8 mixed rows, assert the
  call's `history`).
- `GET` returns `humanOnly` for both kinds of row.
- Composer: toggle defaults off, resets after send, sends `humanOnly:
  true` when checked; human-only bubble shows the caption and no `AiBadge`.
- Migration: existing rows read back `human_only = false`; the `NOT NULL`
  dry-run against `test` succeeds.
