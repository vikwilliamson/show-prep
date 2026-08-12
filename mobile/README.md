# Show Prep Companion (Android)

React Native (Expo) app that reads MyFitnessPal + Samsung Health data from
**Health Connect** on-device and syncs it to the Show Prep server's
`/api/ingest/*` endpoints. It is the only component that touches Health
Connect — HC has no cloud API.

## What it syncs

| Health Connect record | Ingest endpoint | Notes |
|---|---|---|
| `Nutrition` | `/api/ingest/nutrition` | MFP meal summaries; custom meal names arrive as "Other" |
| `Weight` | `/api/ingest/weight` | From Samsung Health (MFP does not sync weight through HC) |
| `Hydration` | `/api/ingest/hydration` | |
| `SleepSession` | `/api/ingest/sleep` | |
| `ExerciseSession` | `/api/ingest/exercise` | Server derives strength vs cardio |
| `Steps` + `TotalCaloriesBurned` | `/api/ingest/activity` | Aggregated to one row per day |

Sync design:

- **Idempotent**: every record is sent with its HC `metadata.id`; the server
  upserts on it, so overlapping syncs are safe.
- **Incremental**: per-type cursors in AsyncStorage; each run re-reads a 24h
  overlap window. First run reaches back 30 days (the HC history limit —
  grant permissions soon after installing).
- **Background**: `expo-background-task` (WorkManager) roughly hourly, plus a
  manual "Sync now" button.

## Setup

```bash
cd mobile
pnpm install
pnpm prebuild          # generates android/ with HC permissions from app.json
pnpm android           # build + install on a connected device (Galaxy S25)
```

Requirements: Android 14+ (Health Connect built in), MyFitnessPal and Samsung
Health both connected to Health Connect on the phone.

In the app:

1. Set **Server URL** (e.g. `http://<your-mac-ip>:3210` on the same Wi-Fi, or
   your deployed URL — must be HTTPS off-LAN).
2. Set the **Ingest API key** if the server has `INGEST_API_KEY` configured.
3. Tap **Grant HC permissions**, approve all read permissions.
4. Tap **Sync now**.

> Health Connect only exposes data from up to 30 days before permission was
> first granted, and background reads require the app to have been used
> recently. Open the app and manual-sync if background sync looks stale.

## Tests

```bash
pnpm test        # unit + integration (node:test via tsx, no device needed)
pnpm typecheck
```

The suite runs headlessly under Node — no emulator or phone required. The two
native boundaries (`react-native-health-connect` and AsyncStorage) plus the two
Expo background modules are swapped for in-memory fakes via `tsconfig.test.json`
`paths`, so the real `sync.ts`, `healthConnect.ts`, `config.ts`, and
`background.ts` execute against programmable data with `fetch` stubbed.

- `test/mapper.test.ts` — pure HC-record → wire-contract mapping (no mocks).
- `test/config.test.ts` — AsyncStorage-backed settings, cursors, status.
- `test/healthConnect.test.ts` — `readAll` pagination + init memoization.
- `test/sync.test.ts` — full read→map→post pipeline: windows (first 30d / 24h
  overlap), batching, auth header, per-type failure isolation, cursor advance.
- `test/background.test.ts` — WorkManager task result mapping + registration.

`App.tsx` (the UI shell) is intentionally not unit-tested; verify it on a
device or an Android emulator (see below).

## On-device / emulator verification

The logic is covered headlessly above. What still needs a real Android runtime
is the UI shell and the actual Health Connect integration. Note Health Connect
has **no cloud API and no emulator data provider** — the standard AVD image
ships the Health Connect app but MyFitnessPal/Samsung Health don't run there, so
an emulator can only exercise the UI and permission flow against an *empty* HC
store. End-to-end sync of real MFP/Samsung data must happen on a physical
Samsung phone.

Two lanes:

1. **Emulator (UI + permission flow, no real health data)** — Android Studio →
   Device Manager → create a Pixel/API-34 AVD, then `pnpm android`. Good for
   catching UI regressions and confirming the HC permission request renders. You
   can seed synthetic HC rows with `adb shell` + the Health Connect toolbox, but
   it won't reflect MFP/Samsung.
2. **Physical Samsung (true e2e)** — the only way to validate the full
   MFP/Samsung Health → HC → ingest path. Safe workflow:
   - Point **Server URL** at a throwaway/dev deployment (or your Mac's LAN IP),
     never production, so seed and real data never mix.
   - Use a distinct `deviceId` and, if the server sets `INGEST_API_KEY`, a
     dev-only key.
   - The app requests **read-only** HC permissions — it never writes to Health
     Connect, so your MFP/Samsung data is never modified.
   - First sync backfills 30 days; watch the on-screen per-type result lines,
     then confirm rows landed via the server dashboard.
