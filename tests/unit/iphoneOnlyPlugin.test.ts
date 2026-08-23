// eslint-disable-next-line @typescript-eslint/no-require-imports
const withIPhoneOnly = require('../../plugins/withIPhoneOnly');

jest.mock('expo/config-plugins', () => {
  const configurations = {
    debug: { buildSettings: { PRODUCT_NAME: 'ShoppingList' } },
    release: { buildSettings: { PRODUCT_NAME: 'ShoppingList' } },
    project: { buildSettings: {} },
    debug_comment: 'Debug',
  };
  return {
    withXcodeProject: (_config: unknown, action: (config: unknown) => unknown) =>
      action({
        modResults: { pbxXCBuildConfigurationSection: () => configurations },
      }),
  };
});

it('restricts every app build configuration to iPhone', () => {
  const result = withIPhoneOnly({});
  const configurations = result.modResults.pbxXCBuildConfigurationSection();

  for (const name of ['debug', 'release']) {
    expect(configurations[name].buildSettings).toMatchObject({
      TARGETED_DEVICE_FAMILY: '1',
      SUPPORTED_PLATFORMS: '"iphoneos iphonesimulator"',
      SUPPORTS_MACCATALYST: 'NO',
      SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: 'NO',
      SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD: 'NO',
    });
  }
  expect(configurations.project.buildSettings).not.toHaveProperty('TARGETED_DEVICE_FAMILY');
});
