import appConfig from '../../app.json';
import packageConfig from '../../package.json';
import { colors } from '../../src/components/ui';
import { createNavigationTheme } from '../../src/theme';

describe('system appearance', () => {
  it('allows Expo to follow the device appearance', () => {
    expect(appConfig.expo.userInterfaceStyle).toBe('automatic');
    expect(packageConfig.dependencies['expo-system-ui']).toBe('~57.0.3');
  });

  it('uses the light navigation palette in light mode', () => {
    const theme = createNavigationTheme('light');

    expect(theme.dark).toBe(false);
    expect(theme.colors).toMatchObject({
      primary: '#237F78',
      background: '#F2F8F6',
      card: '#F8FDFB',
      text: '#171717',
      border: '#D5E0DD',
      notification: '#237F78',
    });
  });

  it('uses the dark navigation palette in dark mode', () => {
    const theme = createNavigationTheme('dark');

    expect(theme.dark).toBe(true);
    expect(theme.colors).toMatchObject({
      primary: '#72D5CA',
      background: '#101615',
      card: '#1B2422',
      text: '#FFFFFF',
      border: '#394946',
      notification: '#72D5CA',
    });
  });

  it.each([
    ['tint', '#237F78', '#72D5CA'],
    ['brand', '#56B5AA', '#72D5CA'],
    ['secondaryLabel', '#667370', '#A7B1AF'],
    ['tertiaryLabel', '#89928F', '#7E8986'],
    ['separator', '#D5E0DD', '#394946'],
    ['systemBackground', '#FFFFFF', '#121817'],
    ['secondarySystemBackground', '#EDF5F3', '#202B29'],
    ['systemGroupedBackground', '#F2F8F6', '#101615'],
    ['secondaryGroupedBackground', '#FFFFFF', '#1B2422'],
    ['bar', 'rgba(248,253,251,0.96)', 'rgba(24,33,31,0.96)'],
    ['errorBackground', '#FDE9EB', '#4B1C21'],
    ['successBackground', '#E3F5F0', '#133A34'],
    ['success', '#237F62', '#72D5B0'],
  ] as const)('provides light and dark variants for %s', (name, light, dark) => {
    expect(colors[name]).toEqual({
      dynamic: { light, dark, highContrastLight: undefined, highContrastDark: undefined },
    });
  });

  it('uses the native adaptive iOS label and destructive colors', () => {
    expect(colors.label).toEqual({ semantic: ['labelColor'] });
    expect(colors.destructive).toEqual({ semantic: ['systemRedColor'] });
  });
});
