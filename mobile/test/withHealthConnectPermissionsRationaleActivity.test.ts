import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addPermissionsRationaleActivity,
  getPermissionsRationaleActivityKotlinSource,
} from "../plugins/withHealthConnectPermissionsRationaleActivity";

// Shape of `androidManifest.manifest.application[0]` after Expo's Android
// manifest mod pipeline (xml2js-parsed). Trimmed to what's actually in this
// project's generated manifest — MainActivity plus the rationale
// intent-filter react-native-health-connect's own plugin already adds.
function fixtureApplication(): any {
  return {
    $: { "android:name": ".MainApplication" },
    activity: [
      {
        $: { "android:name": ".MainActivity", "android:exported": "true" },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
          },
          {
            action: [
              {
                $: {
                  "android:name": "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

test("adds a PermissionsRationaleActivity activity", () => {
  const application = fixtureApplication();
  const out = addPermissionsRationaleActivity(application);

  const rationale = out.activity.find(
    (a: any) => a.$["android:name"] === ".PermissionsRationaleActivity",
  );
  assert.ok(rationale, "PermissionsRationaleActivity was not added");
  assert.equal(rationale.$["android:exported"], "true");
  assert.equal(
    rationale["intent-filter"][0].action[0].$["android:name"],
    "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE",
  );
});

test("adds the ViewPermissionUsageActivity alias required for Android 14+ Health Connect registration", () => {
  const application = fixtureApplication();
  const out = addPermissionsRationaleActivity(application);

  assert.ok(out["activity-alias"], "no activity-alias array was created");
  const alias = out["activity-alias"].find(
    (a: any) => a.$["android:name"] === "ViewPermissionUsageActivity",
  );
  assert.ok(alias, "ViewPermissionUsageActivity alias was not added");
  assert.equal(alias.$["android:targetActivity"], ".PermissionsRationaleActivity");
  assert.equal(alias.$["android:exported"], "true");
  assert.equal(alias.$["android:permission"], "android.permission.START_VIEW_PERMISSION_USAGE");

  const filter = alias["intent-filter"][0];
  assert.equal(filter.action[0].$["android:name"], "android.intent.action.VIEW_PERMISSION_USAGE");
  assert.equal(filter.category[0].$["android:name"], "android.intent.category.HEALTH_PERMISSIONS");
});

test("does not touch MainActivity's existing activities/intent-filters", () => {
  const application = fixtureApplication();
  const out = addPermissionsRationaleActivity(application);

  const main = out.activity.find((a: any) => a.$["android:name"] === ".MainActivity");
  assert.ok(main);
  assert.equal(main["intent-filter"].length, 2);
});

test("is idempotent — applying twice does not duplicate the activity or the alias", () => {
  const once = addPermissionsRationaleActivity(fixtureApplication());
  const twice = addPermissionsRationaleActivity(once);

  assert.equal(
    twice.activity.filter((a: any) => a.$["android:name"] === ".PermissionsRationaleActivity")
      .length,
    1,
  );
  assert.equal(
    twice["activity-alias"].filter(
      (a: any) => a.$["android:name"] === "ViewPermissionUsageActivity",
    ).length,
    1,
  );
});

test("generates Kotlin source with the correct package declaration", () => {
  const src = getPermissionsRationaleActivityKotlinSource("com.gamma.companion");
  assert.match(src, /^package com\.gamma\.companion$/m);
  assert.match(src, /class PermissionsRationaleActivity\s*:\s*AppCompatActivity\(\)/);
  assert.match(src, /loadUrl\("https:\/\/developer\.android\.com/);
});
