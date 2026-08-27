const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const RATIONALE_ACTIVITY_NAME = ".PermissionsRationaleActivity";
const ALIAS_NAME = "ViewPermissionUsageActivity";

/**
 * Android 14+ (the platform-bundled Health Connect, not the old
 * com.google.android.apps.healthdata Play Store app) discovers an app as a
 * Health Connect client via a manifest-declared <activity-alias> named
 * ViewPermissionUsageActivity, handling VIEW_PERMISSION_USAGE +
 * HEALTH_PERMISSIONS. Without it, Health Connect doesn't recognize the app
 * at all — a requestPermission() call resolves instantly with nothing
 * granted and no dialog, and the app never shows up in Health Connect's own
 * "App permissions" list. react-native-health-connect's own Expo plugin only
 * adds the older (pre-Android-14) rationale intent-filter to MainActivity —
 * it doesn't add this alias. Mirrors the library maintainer's own official
 * example fix: https://github.com/matinzd/react-native-health-connect/pull/60
 */
function addPermissionsRationaleActivity(application) {
  application.activity = application.activity ?? [];
  if (!application.activity.some((a) => a.$["android:name"] === RATIONALE_ACTIVITY_NAME)) {
    application.activity.push({
      $: {
        "android:name": RATIONALE_ACTIVITY_NAME,
        "android:exported": "true",
      },
      "intent-filter": [
        {
          action: [
            { $: { "android:name": "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" } },
          ],
        },
      ],
    });
  }

  application["activity-alias"] = application["activity-alias"] ?? [];
  if (!application["activity-alias"].some((a) => a.$["android:name"] === ALIAS_NAME)) {
    application["activity-alias"].push({
      $: {
        "android:name": ALIAS_NAME,
        "android:exported": "true",
        "android:targetActivity": RATIONALE_ACTIVITY_NAME,
        "android:permission": "android.permission.START_VIEW_PERMISSION_USAGE",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.intent.action.VIEW_PERMISSION_USAGE" } }],
          category: [{ $: { "android:name": "android.intent.category.HEALTH_PERMISSIONS" } }],
        },
      ],
    });
  }

  return application;
}

function getPermissionsRationaleActivityKotlinSource(packageName) {
  return `package ${packageName}

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

// Backs the "learn more" link Health Connect's own permission screen shows.
// No hosted privacy policy for this personal-use app, so this points at
// Android's own Health Connect docs — same placeholder the library
// maintainer's official example uses.
class PermissionsRationaleActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val webView = WebView(this)
    webView.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        return false
      }
    }

    webView.loadUrl("https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started")

    setContentView(webView)
  }
}
`;
}

function withHealthConnectPermissionsRationaleActivity(config) {
  config = withAndroidManifest(config, (config) => {
    addPermissionsRationaleActivity(config.modResults.manifest.application[0]);
    return config;
  });

  return withDangerousMod(config, [
    "android",
    (config) => {
      const packagePath = config.android.package.replace(/\./g, "/");
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java",
        packagePath,
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "PermissionsRationaleActivity.kt"),
        getPermissionsRationaleActivityKotlinSource(config.android.package),
      );
      return config;
    },
  ]);
}

module.exports = withHealthConnectPermissionsRationaleActivity;
module.exports.addPermissionsRationaleActivity = addPermissionsRationaleActivity;
module.exports.getPermissionsRationaleActivityKotlinSource = getPermissionsRationaleActivityKotlinSource;
