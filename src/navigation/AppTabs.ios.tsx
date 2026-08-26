import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { ScannerScreen } from '../screens/ScannerScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShoppingScreen } from '../screens/ShoppingScreen';
import { useI18n } from '../i18n';

const Tab = createNativeBottomTabNavigator();

export function AppTabs({ dark }: { dark: boolean }) {
  const { t } = useI18n();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? '#72D5CA' : '#237F78',
        tabBarInactiveTintColor: dark ? '#A7B1AF' : '#74817E',
        tabBarControllerMode: 'tabBar',
        tabBarMinimizeBehavior: 'onScrollDown',
      }}
    >
      <Tab.Screen
        name="Scan"
        component={ScannerScreen}
        options={{
          tabBarLabel: t('shoppingList'),
          tabBarIcon: { type: 'sfSymbol', name: 'checklist' },
        }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingScreen}
        options={{
          tabBarLabel: t('shopping'),
          tabBarIcon: { type: 'sfSymbol', name: 'cart.fill' },
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: t('settings'),
          tabBarIcon: { type: 'sfSymbol', name: 'gearshape.fill' },
          headerShown: true,
          title: t('settings'),
        }}
      />
    </Tab.Navigator>
  );
}
