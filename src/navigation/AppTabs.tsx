import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, GlassSurface, NativeIcon } from '../components/ui';
import { ScannerScreen } from '../screens/ScannerScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShoppingScreen } from '../screens/ShoppingScreen';
import { useI18n } from '../i18n';

const Tab = createBottomTabNavigator();

function TabIcon({
  ios,
  android,
  testID,
  color,
}: {
  ios: 'checklist' | 'cart.fill' | 'gearshape.fill';
  android: string;
  testID: string;
  color: string;
}) {
  return <NativeIcon ios={ios} android={android} color={color} testID={testID} />;
}

export function AppTabs({ dark }: { dark: boolean }) {
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
            <TabIcon
              ios="checklist"
              android="checklist"
              testID="shopping-list-tab-icon"
              color={color}
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
            <TabIcon
              ios="cart.fill"
              android="shopping_cart"
              testID="shopping-cart-tab-icon"
              color={color}
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
            <TabIcon
              ios="gearshape.fill"
              android="settings"
              testID="settings-tab-icon"
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
