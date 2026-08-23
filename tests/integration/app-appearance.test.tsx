import { render } from '@testing-library/react-native';
import type { ColorSchemeName } from 'react-native';
import App from '../../App';

const mockUseColorScheme = jest.fn<ColorSchemeName, []>();

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockUseColorScheme(),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ...actual,
    NavigationContainer: ({ children, theme }: { children: React.ReactNode; theme: object }) => {
      const props: import('react-native').ViewProps & { theme: object } = {
        testID: 'navigation-container',
        theme,
      };
      return React.createElement(View, props, children);
    },
  };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({
        children,
        screenOptions,
      }: {
        children: React.ReactNode;
        screenOptions: object;
      }) => {
        const props: import('react-native').ViewProps & { screenOptions: object } = {
          testID: 'tab-navigator',
          screenOptions,
        };
        return React.createElement(View, props, children);
      },
      Screen: ({ name, options }: { name: string; options: object }) => {
        const props: import('react-native').ViewProps & { options: object } = {
          testID: `screen-${name}`,
          options,
        };
        return React.createElement(View, props);
      },
    }),
  };
});

jest.mock('expo-status-bar', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    StatusBar: ({ style }: { style: string }) => {
      const props: import('react-native').ViewProps & { statusBarStyle: string } = {
        testID: 'status-bar',
        statusBarStyle: style,
      };
      return React.createElement(View, props);
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaProvider: ({ children }: { children: import('react').ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
  };
});

jest.mock('../../src/i18n', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../../src/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  LoginModal: () => null,
}));

jest.mock('../../src/screens/ScannerScreen', () => ({ ScannerScreen: () => null }));
jest.mock('../../src/screens/ShoppingScreen', () => ({ ShoppingScreen: () => null }));
jest.mock('../../src/screens/SettingsScreen', () => ({ SettingsScreen: () => null }));

describe('application appearance wiring', () => {
  it.each([
    [
      'light',
      {
        primary: '#237F78',
        background: '#F2F8F6',
        card: '#F8FDFB',
        text: '#171717',
        active: '#237F78',
        inactive: '#74817E',
      },
    ],
    [
      'dark',
      {
        primary: '#72D5CA',
        background: '#101615',
        card: '#1B2422',
        text: '#FFFFFF',
        active: '#72D5CA',
        inactive: '#A7B1AF',
      },
    ],
  ] as const)(
    'follows the %s system appearance throughout the app shell',
    async (scheme, expected) => {
      mockUseColorScheme.mockReturnValue(scheme);
      const screen = await render(<App />);

      const theme = screen.getByTestId('navigation-container').props.theme;
      expect(theme.dark).toBe(scheme === 'dark');
      expect(theme.colors).toMatchObject({
        primary: expected.primary,
        background: expected.background,
        card: expected.card,
        text: expected.text,
      });

      const options = screen.getByTestId('tab-navigator').props.screenOptions;
      expect(options.tabBarActiveTintColor).toBe(expected.active);
      expect(options.tabBarInactiveTintColor).toBe(expected.inactive);
      expect(options.tabBarStyle).toMatchObject({ height: 84, paddingBottom: 34 });
      expect(screen.getByTestId('status-bar').props.statusBarStyle).toBe('auto');
      expect(screen.getByTestId('screen-Scan').props.options.tabBarButtonTestID).toBe('tab-scan');
      expect(screen.getByTestId('screen-Shopping').props.options.tabBarButtonTestID).toBe(
        'tab-shopping',
      );
      expect(screen.getByTestId('screen-Settings').props.options.tabBarButtonTestID).toBe(
        'tab-settings',
      );

      const scanIcon = await render(
        screen.getByTestId('screen-Scan').props.options.tabBarIcon({ color: expected.active }),
      );
      expect(scanIcon.getByText('▦')).toHaveStyle({ color: expected.active });
      const shoppingIcon = await render(
        screen.getByTestId('screen-Shopping').props.options.tabBarIcon({ color: expected.active }),
      );
      expect(shoppingIcon.getByText('✓')).toHaveStyle({ color: expected.active });
      const settingsIcon = await render(
        screen.getByTestId('screen-Settings').props.options.tabBarIcon({
          color: expected.inactive,
        }),
      );
      expect(settingsIcon.getByText('⚙︎')).toHaveStyle({ color: expected.inactive });
    },
  );
});
