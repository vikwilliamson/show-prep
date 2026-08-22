# Gamma Companion (Android)

React Native (Expo) app that reads MyFitnessPal + Samsung Health data from
**Health Connect** on-device and syncs it to the Gamma server's
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
3. Set **Pairing ID** — copy it from the web app's **Settings** page
   ("Companion pairing ID" section, top of the page). This is how the
   server knows which account your synced data belongs to; syncing without
   it fails immediately with "Pairing ID not configured."
4. Tap **Grant HC permissions**, approve all read permissions.
5. Tap **Sync now**.

> Health Connect only exposes data from up to 30 days before permission was
> first granted, and background reads require the app to have been used
> recently. Open the app and manual-sync if background sync looks stale.

## How to test on a Galaxy S25 (against the Vercel demo)

End-to-end test of the real MyFitnessPal / Samsung Health → Health Connect →
ingest path on your own phone, syncing into the deployed demo at
**https://show-prep-gamma.vercel.app**.

> ⚠️ **Shared demo database.** The Vercel deploy is the public portfolio demo,
> seeded with sample data. Your real device data is upserted *alongside* those
> seed rows (they never collide — seed rows use `seed-*` UIDs, yours use real
> Health Connect UIDs), so the dashboard will show a mix. See
> [Resetting the demo](#resetting-the-demo) to clean up afterward. The app only
> ever requests **read-only** HC permissions, so nothing on your phone is
> modified.

### 1. Prepare the phone

The Galaxy S25 already has Health Connect built in (Android 15). Once:

- Open **MyFitnessPal** and **Samsung Health**, and in each app's settings
  connect it to **Health Connect** (Samsung Health → Settings → Health Connect;
  MFP → Settings → Steps/Apps & Devices → Health Connect).
- Log at least a couple of days of meals/weight/water so there's data to sync.
- Enable **Developer options** (Settings → About phone → tap *Build number* 7×)
  and turn on **USB debugging** — only needed for the local build path (2b).

### 2. Build & install the companion

The companion uses a native module (`react-native-health-connect`), so it can't
run in Expo Go — you need a real build. Two options:

**2a. EAS cloud build (recommended — no Android SDK on your Mac).**

```bash
cd mobile
npm i -g eas-cli          # or: npx eas-cli@latest
eas login                 # free Expo account
eas build -p android --profile preview
```

`preview` produces a standalone **APK** (see `eas.json`). When the build
finishes, open the link on the phone (or scan the QR) and install the APK —
Chrome will ask to allow installing unknown apps; approve for this once.

**2b. Local build over USB (alternative — needs Android SDK + JDK installed).**

```bash
cd mobile
pnpm install
pnpm prebuild             # generates android/ with the HC permissions from app.json
pnpm android              # builds + installs on the USB-connected S25
```

### 3. Point it at the Vercel demo

Launch **Gamma Companion** on the phone and set:

- **Server URL:** `https://show-prep-gamma.vercel.app`
  (off-LAN requires HTTPS — Vercel is HTTPS, so this is fine.)
- **Ingest API key:** the `INGEST_API_KEY` value from the Vercel project
  (Vercel dashboard → the `show-prep` project → Settings → Environment
  Variables → `INGEST_API_KEY` → Reveal). The production ingest API is
  bearer-gated, so this is required.
- **Pairing ID:** on **show-prep-gamma.vercel.app**, sign in and open
  **Settings** — copy the "Companion pairing ID" value at the top of the
  page and paste it in. This says whose account your synced rows belong to;
  sync fails immediately without it.

Leave **Device ID** as the auto-generated `galaxy-…` value — it tags your rows'
provenance so you can tell them apart from seed data.

### 4. Grant permissions & sync

1. Tap **Grant HC permissions** and approve all the read permissions in the
   Health Connect sheet.
2. Tap **Sync now**. The first sync backfills up to 30 days (HC's history
   limit). Watch the on-screen per-type result lines — e.g. `nutrition: 24`,
   `weight: 7` — each number is how many records the server accepted.

### 5. Verify on the dashboard

Open **https://show-prep-gamma.vercel.app**, click **Enter demo** (or use the
demo password), and confirm your synced weigh-ins / meals / hydration now appear
in the dashboard trends and the current week's compliance.

> Background sync runs roughly hourly via WorkManager and only when the OS
> allows it. If numbers look stale, just open the app and tap **Sync now** — the
> per-type cursors re-read a 24h overlap window, so re-syncing is always safe.

### Resetting the demo

Re-running the seed refreshes the sample rows but **does not** remove your
device rows (different UIDs):

```bash
# from the repo root, with the deployed DB URL:
DATABASE_URL="<neon-pooled-url>" SEED_AI=1 pnpm seed
```

To fully clear your device data from the demo, delete the rows whose `source` is
`myfitnesspal` / `samsung_health` with your `galaxy-…` device id (or reset the
database and re-seed). Do this against the **deployed** DB, not a local one.

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
