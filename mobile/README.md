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
