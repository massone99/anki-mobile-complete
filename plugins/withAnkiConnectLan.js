// Optional developer-only LAN HTTP support for AnkiConnect.
// WARNING: Android setting permits cleartext HTTP for the entire app.
// Disable this plugin in production builds unless the network surface is reviewed.
const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');
module.exports = function withAnkiConnectLan(config) {
  config = withAndroidManifest(config, config => {
    const application = config.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
  return withInfoPlist(config, config => {
    config.modResults.NSAppTransportSecurity = {
      ...(config.modResults.NSAppTransportSecurity || {}),
      NSAllowsLocalNetworking: true,
    };
    return config;
  });
};
