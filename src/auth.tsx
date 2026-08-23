import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionButton,
  colors,
  Field,
  Notice,
  Section,
  Separator,
  sheetModal,
  ui,
} from './components/ui';
import { connectionError, useI18n } from './i18n';
import { loadLists } from './services/bringApi';
import {
  clearCredentials,
  clearSelectedList,
  loadCredentials,
  loadBringSyncEnabled,
  loadSelectedList,
  saveCredentials,
  saveBringSyncEnabled,
  saveSelectedList,
} from './services/storage';
import { BringList, Credentials } from './types';

type AuthValue = {
  credentials: Credentials | null;
  lists: BringList[];
  selectedList: BringList | null;
  initializing: boolean;
  bringSyncEnabled: boolean;
  setBringSyncEnabled: (enabled: boolean) => Promise<void>;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  selectList: (list: BringList) => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  credentials: null,
  lists: [],
  selectedList: null,
  initializing: true,
  bringSyncEnabled: false,
  setBringSyncEnabled: async () => {},
  login: async () => {},
  logout: async () => {},
  selectList: async () => {},
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [lists, setLists] = useState<BringList[]>([]);
  const [selectedList, setSelectedList] = useState<BringList | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [bringSyncEnabled, setBringSyncEnabledState] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([loadCredentials(), loadSelectedList(), loadBringSyncEnabled()])
      .then(([stored, storedList, syncEnabled]) => {
        if (!live) return;
        setCredentials(stored);
        setSelectedList(stored ? storedList : null);
        setBringSyncEnabledState(syncEnabled);
        setInitializing(false);
        if (!stored && storedList) clearSelectedList().catch(() => {});
        if (syncEnabled && stored) {
          loadLists(stored)
            .then((loadedLists) => live && setLists(loadedLists))
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!live) return;
        setCredentials(null);
        setLists([]);
        setSelectedList(null);
        setInitializing(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      credentials,
      lists,
      selectedList,
      initializing,
      bringSyncEnabled,
      setBringSyncEnabled: async (enabled) => {
        await saveBringSyncEnabled(enabled);
        setBringSyncEnabledState(enabled);
        if (!enabled) {
          setLists([]);
        } else if (credentials) {
          setLists(await loadLists(credentials));
        }
      },
      login: async (next) => {
        const normalized = { email: next.email.trim(), password: next.password };
        const loadedLists = await loadLists(normalized);
        await clearSelectedList();
        await saveCredentials(normalized);
        setSelectedList(null);
        setLists(loadedLists);
        setCredentials(normalized);
      },
      logout: async () => {
        await Promise.all([clearCredentials(), clearSelectedList()]);
        setSelectedList(null);
        setLists([]);
        setCredentials(null);
      },
      selectList: async (list) => {
        await saveSelectedList(list);
        setSelectedList(list);
      },
    }),
    [bringSyncEnabled, credentials, initializing, lists, selectedList],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function LoginModal() {
  const { bringSyncEnabled, credentials, initializing, login, setBringSyncEnabled } = useAuth();
  const { language, t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!email.trim() || !password) {
      setError(t('enterCredentials'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login({ email, password });
      setEmail('');
      setPassword('');
    } catch {
      setError(connectionError(language));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await setBringSyncEnabled(false);
      setEmail('');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={!initializing && bringSyncEnabled && !credentials}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={() => {}}
      testID="login-modal"
    >
      <View style={sheetModal.backdrop}>
        <SafeAreaView
          edges={['bottom']}
          style={[styles.safe, sheetModal.sheet]}
          testID="login-sheet"
        >
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {t('signInToBring')}
            </Text>
          </View>
          <ScrollView
            style={ui.screen}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Section footer={t('loginRequired')}>
              <Field
                label={t('email')}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                placeholder="you@example.com"
              />
              <Separator />
              <Field
                label={t('password')}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setError('');
                }}
                secureTextEntry
                textContentType="password"
                placeholder={t('required')}
              />
              <Separator />
              <ActionButton title={t('signIn')} onPress={submit} loading={busy} />
              <Separator />
              <ActionButton title={t('cancel')} onPress={cancel} disabled={busy} />
            </Section>
          </ScrollView>
          {error ? (
            <View pointerEvents="none" style={styles.status} testID="login-status">
              <Notice>{error}</Notice>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.systemGroupedBackground },
  header: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.bar,
  },
  title: { color: colors.label, fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 28 },
  status: { position: 'absolute', zIndex: 10, bottom: 12, left: 16, right: 16 },
});
