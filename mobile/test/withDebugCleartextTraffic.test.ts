import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getDebugCleartextManifestSource } from "../plugins/withDebugCleartextTraffic";

test("debug manifest overlay declares cleartext traffic on the application tag", () => {
  const xml = getDebugCleartextManifestSource();
  assert.match(
    xml,
    /<manifest[^>]*xmlns:android="http:\/\/schemas\.android\.com\/apk\/res\/android"/,
  );
  assert.match(xml, /<application[^>]*android:usesCleartextTraffic="true"/);
});

test("app.json does not enable cleartext traffic for every build type", () => {
  const appJson = JSON.parse(readFileSync(join(__dirname, "..", "app.json"), "utf8"));
  const buildProperties = appJson.expo.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === "expo-build-properties",
  );
  assert.ok(buildProperties, "expo-build-properties plugin entry not found");
  assert.notEqual(
    buildProperties[1]?.android?.usesCleartextTraffic,
    true,
    "usesCleartextTraffic must not be set unconditionally in expo-build-properties " +
      "(applies to every build variant, including release builds shipped to testers)",
  );

  assert.ok(
    appJson.expo.plugins.includes("./plugins/withDebugCleartextTraffic"),
    "app.json must register the debug-only cleartext-traffic plugin",
  );
});
