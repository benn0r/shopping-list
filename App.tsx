import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShoppingScreen } from './src/screens/ShoppingScreen';
import { colors, GlassSurface, NativeIcon } from './src/components/ui';
import { I18nProvider, useI18n } from './src/i18n';
import { AuthProvider } from './src/auth';
import { createNavigationTheme } from './src/theme';

const Tab = createBottomTabNavigator();

function AppTabs({ dark }: { dark: boolean }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? '#72D5CA' : '#237F78',
        tabBarInactiveTintColor: dark ? '#A7B1AF' : '#74817E',
        tabBarStyle: {
          height: 50 + insets.bottom,
          paddingTop: 5,
          paddingBottom: Math.max(insets.bottom, 5),
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarBackground: () => (
          <GlassSurface
            fallbackColor={colors.bar}
            style={StyleSheet.absoluteFill}
            testID="liquid-glass-tab-bar"
          />
        ),
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Scan"
        component={ScannerScreen}
        options={{
          tabBarLabel: t('shoppingList'),
          tabBarButtonTestID: 'tab-scan',
          tabBarIcon: ({ color }) => (
            <NativeIcon
              ios="checklist"
              android="checklist"
              color={color}
              size={24}
              weight="semibold"
              testID="shopping-list-tab-icon"
            />
          ),
        }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingScreen}
        options={{
          tabBarLabel: t('shopping'),
          tabBarButtonTestID: 'tab-shopping',
          tabBarIcon: ({ color }) => (
            <NativeIcon
              ios="cart.fill"
              android="shopping_cart"
              color={color}
              size={25}
              weight="semibold"
              testID="shopping-cart-tab-icon"
            />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: t('settings'),
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ color }) => (
            <NativeIcon
              ios="gearshape.fill"
              android="settings"
              color={color}
              size={24}
              testID="settings-tab-icon"
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const theme = createNavigationTheme(scheme);
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <NavigationContainer theme={theme}>
            <StatusBar style="auto" />
            <AppTabs dark={scheme === 'dark'} />
          </NavigationContainer>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
