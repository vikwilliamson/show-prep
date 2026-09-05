const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * usesCleartextTraffic can't be set via expo-build-properties (VIK-119) —
 * that writes the attribute into src/main/AndroidManifest.xml, which every
 * build variant inherits, including the release variant EAS's `preview`
 * and `production` profiles ship to testers. This project's LAN-HTTP local
 * dev workflow (README's "Setup" and "Fast iteration" sections) still needs
 * cleartext, but only for debug-variant builds: `expo run:android`'s
 * default variant, and EAS's `development` profile (which builds debug by
 * default because of `developmentClient: true`). Android's manifest merger
 * already does exactly this split natively — a manifest placed at
 * src/debug/AndroidManifest.xml merges into debug builds only, never
 * release. There's no committed native android/ directory (regenerated via
 * expo prebuild), so this plugin re-writes that overlay on every build.
 */
function getDebugCleartextManifestSource() {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:usesCleartextTraffic="true" />
</manifest>
`;
}

function withDebugCleartextTraffic(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, "app/src/debug");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "AndroidManifest.xml"), getDebugCleartextManifestSource());
      return config;
    },
  ]);
}

module.exports = withDebugCleartextTraffic;
module.exports.getDebugCleartextManifestSource = getDebugCleartextManifestSource;
