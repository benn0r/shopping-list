import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppTabs } from './src/navigation/AppTabs';
import { I18nProvider } from './src/i18n';
import { AuthProvider } from './src/auth';
import { createNavigationTheme } from './src/theme';

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
