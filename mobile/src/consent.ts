import AsyncStorage from "@react-native-async-storage/async-storage";

// Data-sharing consent (specs/phase-2-open-wearables.md §4, specs/prd.md).
// Required for every account before any health data leaves the device — no
// exceptions, internal testers included. Stored on-device only for now (see
// the spec's 2026-10-08 addendum). Bump CONSENT_VERSION whenever the copy
// below changes in a way that needs a fresh yes: older acceptances stop
// counting and the screen is shown again.
//
// Vendor-neutral on purpose: the aggregator (whichever one is current) is
// never named in product copy.

export const CONSENT_VERSION = 1;

const CONSENT_KEY = "companion.consent";

export interface ConsentRecord {
  version: number;
  acceptedAt: string;
}

export const CONSENT_COPY = {
  title: "Before you connect your health data",
  intro:
    "Gamma Companion reads health data from your phone and sends it to your Gamma account so your coach can see how you're doing. Please read how that works, then choose whether to continue.",
  sections: [
    {
      heading: "What we collect",
      body: "Weight, sleep, water intake, steps and calories burned, workouts, and nutrition (meals and macros) that your phone's health apps record. Nothing is read until you agree here and then grant permission for each type of data.",
    },
    {
      heading: "How it's processed",
      body: "Your data is sent to our server, and may pass through a health-data aggregation service that acts only as a processor on our behalf — it can't use your data for its own purposes. You are identified to it only by an opaque, randomly generated ID, never your name, email address, or phone number.",
    },
    {
      heading: "Where it's stored",
      body: "In our database, tied to your Gamma account. In the app, only you and your coach can see it.",
    },
    {
      heading: "Your choices",
      body: "Syncing stops as soon as you withdraw consent, which you can do any time from the Setup tab. You can also revoke permissions in your phone's Health Connect settings, and ask your coach to delete your account and the data with it.",
    },
  ],
  acknowledge: "I understand and agree",
} as const;

export async function loadConsent(): Promise<ConsentRecord | null> {
  const raw = await AsyncStorage.getItem(CONSENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (typeof parsed.version === "number" && typeof parsed.acceptedAt === "string") {
      return { version: parsed.version, acceptedAt: parsed.acceptedAt };
    }
  } catch {
    // Corrupt record — treat as never consented, so the screen is shown again.
  }
  return null;
}

/** True only for consent given to the current version of the copy. */
export async function hasConsent(): Promise<boolean> {
  const record = await loadConsent();
  return record !== null && record.version === CONSENT_VERSION;
}

export async function saveConsent(now: Date = new Date()): Promise<ConsentRecord> {
  const record: ConsentRecord = { version: CONSENT_VERSION, acceptedAt: now.toISOString() };
  await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  return record;
}

export async function clearConsent(): Promise<void> {
  await AsyncStorage.removeItem(CONSENT_KEY);
}
