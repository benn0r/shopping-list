const { withXcodeProject } = require('expo/config-plugins');

const IPHONE_ONLY_SETTINGS = {
  TARGETED_DEVICE_FAMILY: '1',
  SUPPORTED_PLATFORMS: '"iphoneos iphonesimulator"',
  SUPPORTS_MACCATALYST: 'NO',
  SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: 'NO',
  SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD: 'NO',
};

module.exports = function withIPhoneOnly(config) {
  return withXcodeProject(config, (projectConfig) => {
    const configurations = projectConfig.modResults.pbxXCBuildConfigurationSection();
    for (const configuration of Object.values(configurations)) {
      if (typeof configuration !== 'object' || !configuration?.buildSettings?.PRODUCT_NAME) {
        continue;
      }
      Object.assign(configuration.buildSettings, IPHONE_ONLY_SETTINGS);
    }
    return projectConfig;
  });
};
