const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * We use `expo-notifications` for LOCAL notifications only (the background upload-complete / failed
 * banners in `src/features/upload/notify.ts`) — we never register for remote push (no
 * `getDevicePushTokenAsync` / `getExpoPushTokenAsync`).
 *
 * expo-notifications' iOS plugin unconditionally stamps the `aps-environment` (Apple Push
 * Notifications) entitlement, which requires the Push Notifications capability to be registered on
 * the App ID / provisioning profile — otherwise the build fails with:
 *   "Provisioning Profile … does not support the Push Notifications capability."
 *
 * Local notifications don't need APNs, so this plugin strips the entitlement, letting the app sign
 * with a plain profile. It must be listed BEFORE `expo-notifications` in app.json: entitlements
 * mods run last-registered-first, so registering earlier makes this delete run AFTER
 * expo-notifications' add (which only sets the key when absent — order the other way, it just
 * re-adds it). If remote push is ever added, remove this plugin and register Push Notifications
 * for the App ID instead.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
