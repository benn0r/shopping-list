import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import type { ColorValue } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShoppingScreen } from './src/screens/ShoppingScreen';
import { colors } from './src/components/ui';
import { I18nProvider, useI18n } from './src/i18n';
import { AuthProvider } from './src/auth';
import { createNavigationTheme } from './src/theme';

const Tab = createBottomTabNavigator();

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ color, fontSize: 24, fontWeight: '500', lineHeight: 27 }}>{symbol}</Text>;
}

function ShoppingListTabIcon({ color }: { color: ColorValue }) {
  return (
    <View style={[tabIconStyles.list, { borderColor: color }]} testID="shopping-list-tab-icon">
      {[0, 1, 2].map((row) => (
        <View key={row} style={tabIconStyles.listRow}>
          <View style={[tabIconStyles.listCheck, { borderColor: color }]} />
          <View style={[tabIconStyles.listLine, { backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
}

function ShoppingCartTabIcon({ color }: { color: ColorValue }) {
  return (
    <View style={tabIconStyles.cartWrap} testID="shopping-cart-tab-icon">
      <View style={[tabIconStyles.cartHandle, { backgroundColor: color }]} />
      <View
        style={[tabIconStyles.cartBasket, { borderColor: color }]}
        testID="shopping-cart-tab-icon-basket"
      />
      <View
        style={[tabIconStyles.cartWheel, tabIconStyles.cartWheelLeft, { backgroundColor: color }]}
      />
      <View
        style={[tabIconStyles.cartWheel, tabIconStyles.cartWheelRight, { backgroundColor: color }]}
      />
    </View>
  );
}

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
          backgroundColor: colors.bar,
          borderTopColor: colors.separator,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Scan"
        component={ScannerScreen}
        options={{
          tabBarLabel: t('shoppingList'),
          tabBarButtonTestID: 'tab-scan',
          tabBarIcon: ({ color }) => <ShoppingListTabIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingScreen}
        options={{
          tabBarLabel: t('shopping'),
          tabBarButtonTestID: 'tab-shopping',
          tabBarIcon: ({ color }) => <ShoppingCartTabIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: t('settings'),
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ color }) => <TabIcon symbol="⚙︎" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

const tabIconStyles = StyleSheet.create({
  list: {
    width: 22,
    height: 24,
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 4,
    justifyContent: 'space-between',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  listCheck: {
    width: 4,
    height: 4,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    transform: [{ rotate: '-45deg' }],
  },
  listLine: { flex: 1, height: 1.5, borderRadius: 1 },
  cartWrap: { width: 27, height: 25 },
  cartHandle: { position: 'absolute', left: 1, top: 3, width: 6, height: 2, borderRadius: 1 },
  cartBasket: {
    position: 'absolute',
    left: 5,
    top: 5,
    width: 20,
    height: 13,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    transform: [{ skewX: '-8deg' }],
  },
  cartWheel: { position: 'absolute', bottom: 1, width: 4, height: 4, borderRadius: 2 },
  cartWheelLeft: { left: 8 },
  cartWheelRight: { right: 3 },
});

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
