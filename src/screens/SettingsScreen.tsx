import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionButton,
  colors,
  Field,
  LargeTitle,
  ListRow,
  Notice,
  Section,
  Separator,
  ui,
} from '../components/ui';
import { NativeSheet } from '../components/NativeSheet';
import { NativeLink } from '../components/NativeLink';
import {
  DEFAULT_LOOKUP_PREFERENCES,
  createShoppingList,
  createStore,
  deleteShoppingList,
  deleteStore,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadListViewMode,
  loadMealieConfig,
  loadMealieSyncEnabled,
  loadShoppingLists,
  loadStores,
  saveCustomBarcodes,
  saveLookupPreferences,
  saveListViewMode,
  saveMealieConfig,
  saveMealieSyncEnabled,
  clearMealieConfig,
  renameShoppingList,
  renameStore,
  setShoppingListSyncTarget,
  subscribeShoppingLists,
} from '../services/storage';
import {
  CustomBarcode,
  LabelStyle,
  ListViewMode,
  LookupPreferences,
  ProductLanguage,
  ProviderList,
  ShoppingListDefinition,
  StoreDefinition,
  SyncProviderId,
} from '../types';
import { PRODUCT_DATABASES } from '../productDatabases';
import { APP_LANGUAGES, connectionError, translate, useI18n } from '../i18n';
import { useAuth } from '../auth';
import { loadMealieLists } from '../services/mealieApi';

const LANGUAGES: { value: ProductLanguage; title: string }[] = [
  { value: 'auto', title: 'Automatic' },
  { value: 'de', title: 'German' },
  { value: 'en', title: 'English' },
  { value: 'fr', title: 'French' },
  { value: 'it', title: 'Italian' },
];
const LABEL_STYLES: { value: LabelStyle; title: string; detail: string }[] = [
  { value: 'generic', title: 'Generic', detail: 'Toilet paper' },
  { value: 'exact', title: 'Exact Product', detail: 'Brand, variant and quantity' },
  { value: 'ask', title: 'Ask Every Time', detail: 'Start with the exact name and edit it' },
];

export function SettingsScreen() {
  const { language: appLanguage, setLanguage: setAppLanguage, t } = useI18n();
  const { bringSyncEnabled, credentials, lists, login, logout, setBringSyncEnabled } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [label, setLabel] = useState('');
  const [custom, setCustom] = useState<CustomBarcode[]>([]);
  const [preferences, setPreferences] = useState<LookupPreferences>(DEFAULT_LOOKUP_PREFERENCES);
  const [listViewMode, setListViewMode] = useState<ListViewMode>('list');
  const [shoppingLists, setShoppingLists] = useState<ShoppingListDefinition[]>([]);
  const [listEditorId, setListEditorId] = useState<string | 'new' | null>(null);
  const [listEditorName, setListEditorName] = useState('');
  const [listEditorRemoteId, setListEditorRemoteId] = useState<string | null>(null);
  const [listEditorProvider, setListEditorProvider] = useState<SyncProviderId | null>(null);
  const [mealieEnabled, setMealieEnabled] = useState(false);
  const [mealieBaseUrl, setMealieBaseUrl] = useState('');
  const [mealieToken, setMealieToken] = useState('');
  const [mealieLists, setMealieLists] = useState<ProviderList[]>([]);
  const [mealieConfigured, setMealieConfigured] = useState(false);
  const [bringEmail, setBringEmail] = useState<string | null>(null);
  const [bringPassword, setBringPassword] = useState<string | null>(null);
  const [bringBusy, setBringBusy] = useState(false);
  const [stores, setStores] = useState<StoreDefinition[]>([]);
  const [storeEditorId, setStoreEditorId] = useState<string | 'new' | null>(null);
  const [storeEditorName, setStoreEditorName] = useState('');
  const [error, setError] = useState('');
  const [, setSuccess] = useState('');
  const [customBarcodesVisible, setCustomBarcodesVisible] = useState(false);
  useEffect(() => {
    const load = () => {
      Promise.all([
        loadCustomBarcodes(),
        loadLookupPreferences(),
        loadListViewMode(),
        loadShoppingLists(),
        loadStores(),
        loadMealieSyncEnabled(),
        loadMealieConfig(),
      ])
        .then(async ([b, p, viewMode, storedLists, storedStores, storedMealieEnabled, mealie]) => {
          setCustom(b);
          setPreferences(p);
          setListViewMode(viewMode);
          setShoppingLists(storedLists);
          setStores(storedStores);
          setMealieEnabled(storedMealieEnabled);
          setMealieBaseUrl(mealie?.baseUrl || '');
          setMealieToken(mealie?.token || '');
          setMealieConfigured(Boolean(mealie));
          if (storedMealieEnabled && mealie) {
            setMealieLists(await loadMealieLists(mealie).catch(() => []));
          }
        })
        .catch(() => {});
    };
    load();
    return subscribeShoppingLists(load);
  }, []);
  async function signOut() {
    await logout();
    setError('');
    setSuccess('');
  }
  async function connectBring() {
    const email = bringEmail ?? credentials?.email ?? '';
    const password = bringPassword ?? credentials?.password ?? '';
    if (!email.trim() || !password) {
      setError(t('enterCredentials'));
      return;
    }
    setBringBusy(true);
    setError('');
    try {
      await login({ email, password });
      await setBringSyncEnabled(true);
      setSuccess(t('bringConnected'));
    } catch {
      setError(connectionError(appLanguage));
    } finally {
      setBringBusy(false);
    }
  }
  async function disconnectBring() {
    setBringBusy(true);
    try {
      await signOut();
      await setBringSyncEnabled(false);
      setBringEmail('');
      setBringPassword('');
    } finally {
      setBringBusy(false);
    }
  }
  async function saveSyncTarget(
    localList: ShoppingListDefinition,
    provider: SyncProviderId | null,
    remoteId: string | null,
  ) {
    const remoteList =
      provider === 'bring'
        ? lists
            .map((list) => ({ id: list.listUuid, name: list.name }))
            .find((candidate) => candidate.id === remoteId)
        : provider === 'mealie'
          ? mealieLists.find((candidate) => candidate.id === remoteId)
          : null;
    return setShoppingListSyncTarget(
      localList.id,
      remoteList
        ? {
            provider: provider!,
            remoteListId: remoteList.id,
            remoteListName: remoteList.name,
          }
        : null,
    );
  }
  async function createLocalList() {
    if (!listEditorName.trim()) return;
    const created = await createShoppingList(listEditorName);
    setShoppingLists(await saveSyncTarget(created, listEditorProvider, listEditorRemoteId));
    setListEditorId(null);
    setListEditorName('');
    setListEditorRemoteId(null);
    setListEditorProvider(null);
    setSuccess(t('listCreated', { name: created.name }));
  }
  async function renameLocalList(list: ShoppingListDefinition) {
    const name = listEditorName.trim();
    if (!name) return;
    const renamed = name !== list.name;
    if (renamed) await renameShoppingList(list.id, name);
    setShoppingLists(await saveSyncTarget(list, listEditorProvider, listEditorRemoteId));
    setListEditorId(null);
    setListEditorName('');
    setListEditorRemoteId(null);
    setListEditorProvider(null);
    const remoteName =
      listEditorProvider === 'bring'
        ? lists.find((candidate) => candidate.listUuid === listEditorRemoteId)?.name
        : mealieLists.find((candidate) => candidate.id === listEditorRemoteId)?.name;
    setSuccess(
      renamed
        ? t('listRenamed', { name })
        : remoteName
          ? t('selected', { name: remoteName })
          : t('notSynced'),
    );
  }
  async function toggleMealie(enabled: boolean) {
    setMealieEnabled(enabled);
    await saveMealieSyncEnabled(enabled);
    if (!enabled) setMealieLists([]);
    else if (mealieBaseUrl && mealieToken) {
      setMealieLists(
        await loadMealieLists({ baseUrl: mealieBaseUrl, token: mealieToken }).catch(() => []),
      );
    }
  }
  async function connectMealie() {
    try {
      const parsed = new URL(mealieBaseUrl.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || !mealieToken.trim()) throw new Error();
      const config = { baseUrl: parsed.toString().replace(/\/$/, ''), token: mealieToken.trim() };
      const remoteLists = await loadMealieLists(config);
      await Promise.all([saveMealieConfig(config), saveMealieSyncEnabled(true)]);
      setMealieBaseUrl(config.baseUrl);
      setMealieToken(config.token);
      setMealieLists(remoteLists);
      setMealieConfigured(true);
      setMealieEnabled(true);
      setError('');
      setSuccess(t('mealieConnected'));
    } catch {
      setError(t('mealieConnectionFailed'));
    }
  }
  async function disconnectMealie() {
    await Promise.all([clearMealieConfig(), saveMealieSyncEnabled(false)]);
    setMealieEnabled(false);
    setMealieLists([]);
    setMealieConfigured(false);
    setMealieBaseUrl('');
    setMealieToken('');
  }
  async function deleteLocalListNow(list: ShoppingListDefinition) {
    try {
      const next = await deleteShoppingList(list.id);
      setShoppingLists(next);
      setListEditorId(null);
      setListEditorName('');
      setSuccess(t('listDeleted', { name: list.name }));
    } catch {
      setError(t('cannotDeleteLastList'));
    }
  }
  function confirmDeleteList(list: ShoppingListDefinition) {
    if (shoppingLists.length === 1) {
      setError(t('cannotDeleteLastList'));
      return;
    }
    if (Platform.OS === 'web') {
      if (globalThis.confirm(t('deleteListBody', { name: list.name }))) {
        void deleteLocalListNow(list);
      }
      return;
    }
    Alert.alert(t('deleteListTitle'), t('deleteListBody', { name: list.name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => void deleteLocalListNow(list) },
    ]);
  }
  async function saveStore() {
    const name = storeEditorName.trim();
    if (!name) return;
    const editedStore = stores.find((store) => store.id === storeEditorId);
    if (editedStore) {
      setStores(await renameStore(editedStore.id, name));
      setSuccess(t('storeRenamed', { name }));
    } else {
      setStores(await createStore(name));
      setSuccess(t('storeCreated', { name }));
    }
    setStoreEditorId(null);
    setStoreEditorName('');
  }
  async function deleteStoreNow(store: StoreDefinition) {
    setStores(await deleteStore(store.id));
    setStoreEditorId(null);
    setStoreEditorName('');
    setSuccess(t('storeDeleted', { name: store.name }));
  }
  function confirmDeleteStore(store: StoreDefinition) {
    if (Platform.OS === 'web') {
      if (globalThis.confirm(t('deleteStoreBody', { name: store.name })))
        void deleteStoreNow(store);
      return;
    }
    Alert.alert(t('deleteStoreTitle'), t('deleteStoreBody', { name: store.name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => void deleteStoreNow(store) },
    ]);
  }
  async function addCustom() {
    const clean = barcode.replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(clean) || !label.trim()) return setError(t('invalidCustom'));
    const next = [
      ...custom.filter((item) => item.barcode !== clean),
      { barcode: clean, label: label.trim() },
    ];
    await saveCustomBarcodes(next);
    setCustom(next);
    setBarcode('');
    setLabel('');
    setError('');
    setSuccess(t('customSaved'));
  }
  function openCustomBarcodes() {
    setError('');
    setSuccess('');
    setCustomBarcodesVisible(true);
  }
  function closeCustomBarcodes() {
    setError('');
    setSuccess('');
    setCustomBarcodesVisible(false);
  }
  async function deleteCustom(value: string) {
    const next = custom.filter((item) => item.barcode !== value);
    await saveCustomBarcodes(next);
    setCustom(next);
    setError('');
    setSuccess(t('customRemoved'));
  }
  function removeCustom(value: string) {
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${t('removeCustomTitle')}\n\n${t('removeCustomBody')}`)) {
        void deleteCustom(value);
      }
      return;
    }
    Alert.alert(t('removeCustomTitle'), t('removeCustomBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('remove'),
        style: 'destructive',
        onPress: () => void deleteCustom(value),
      },
    ]);
  }
  async function updatePreferences(update: Partial<LookupPreferences>, confirmation: string) {
    const next = { ...preferences, ...update };
    setPreferences(next);
    await saveLookupPreferences(next);
    setError('');
    setSuccess(confirmation);
  }

  const editedList =
    listEditorId && listEditorId !== 'new'
      ? shoppingLists.find((list) => list.id === listEditorId) || null
      : null;
  const editedStore = stores.find((store) => store.id === storeEditorId) || null;

  return (
    <SafeAreaView edges={['top']} style={ui.safe}>
      <View style={ui.header}>
        <LargeTitle>{t('settings')}</LargeTitle>
      </View>
      {!customBarcodesVisible && error && (
        <View pointerEvents="none" style={styles.statusSlot} testID="settings-status">
          <Notice>{error}</Notice>
        </View>
      )}
      <ScrollView
        style={ui.screen}
        contentContainerStyle={ui.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Section footer={t('bringSyncFooter')}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('enableBringSync')}</Text>
            <Switch
              accessibilityLabel={t('enableBringSync')}
              testID="bring-sync-switch"
              value={bringSyncEnabled}
              onValueChange={(enabled) => void setBringSyncEnabled(enabled)}
              trackColor={{ true: colors.tint }}
              style={styles.switch}
            />
          </View>
          {bringSyncEnabled ? (
            <>
              <Separator />
              <Field
                accessibilityLabel={t('email')}
                value={bringEmail ?? credentials?.email ?? ''}
                onChangeText={(value) => {
                  setBringEmail(value);
                  setError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                placeholder={t('email')}
              />
              <Separator />
              <Field
                accessibilityLabel={t('password')}
                value={bringPassword ?? credentials?.password ?? ''}
                onChangeText={(value) => {
                  setBringPassword(value);
                  setError('');
                }}
                secureTextEntry
                textContentType="password"
                placeholder={t('password')}
              />
              <Separator />
              <ActionButton
                title={t('connectBring')}
                onPress={() => void connectBring()}
                loading={bringBusy}
                success
              />
              {credentials ? (
                <>
                  <Separator />
                  <ActionButton
                    title={t('disconnectBring')}
                    onPress={() => void disconnectBring()}
                    destructive
                    disabled={bringBusy}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </Section>
        <Section footer={t('mealieSyncFooter')}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('enableMealieSync')}</Text>
            <Switch
              accessibilityLabel={t('enableMealieSync')}
              testID="mealie-sync-switch"
              value={mealieEnabled}
              onValueChange={(enabled) => void toggleMealie(enabled)}
              trackColor={{ true: colors.tint }}
              style={styles.switch}
            />
          </View>
          {mealieEnabled ? (
            <>
              <Separator />
              <Field
                accessibilityLabel={t('mealieServerUrl')}
                value={mealieBaseUrl}
                onChangeText={(value) => {
                  setMealieBaseUrl(value);
                  setError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder={t('mealieServerUrl')}
              />
              <Separator />
              <Field
                accessibilityLabel={t('mealieApiToken')}
                value={mealieToken}
                onChangeText={(value) => {
                  setMealieToken(value);
                  setError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder={t('mealieApiToken')}
              />
              <Separator />
              <ActionButton
                title={t('connectMealie')}
                onPress={() => void connectMealie()}
                success
              />
              {mealieConfigured ? (
                <>
                  <Separator />
                  <ActionButton
                    title={t('disconnectMealie')}
                    onPress={() => void disconnectMealie()}
                    destructive
                  />
                </>
              ) : null}
            </>
          ) : null}
        </Section>
        <Section title={t('listView')}>
          {(['list', 'tiles'] as const).map((mode, index) => (
            <View key={mode}>
              {index > 0 ? <Separator /> : null}
              <ListRow
                title={t(mode)}
                selected={listViewMode === mode}
                testID={`list-view-${mode}`}
                onPress={async () => {
                  setListViewMode(mode);
                  await saveListViewMode(mode);
                }}
              />
            </View>
          ))}
        </Section>
        <Section title={t('appLanguage')}>
          {APP_LANGUAGES.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <Separator /> : null}
              <ListRow
                title={option.name}
                selected={appLanguage === option.value}
                testID={`app-language-${option.value}`}
                onPress={async () => {
                  await setAppLanguage(option.value);
                  setSuccess(translate(option.value, 'languageSaved', { language: option.name }));
                }}
              />
            </View>
          ))}
        </Section>
        <Section title={t('shoppingLists')} footer={t('manageListsFooter')}>
          {shoppingLists.map((localList, index) => (
            <View key={localList.id}>
              {index > 0 ? <Separator /> : null}
              <View testID={`list-editor-${localList.id}`}>
                <ListRow
                  title={localList.name}
                  detail={
                    localList.syncTarget
                      ? `${t(localList.syncTarget.provider === 'bring' ? 'bringProvider' : 'mealieProvider')} · ${localList.syncTarget.remoteListName}`
                      : t('notSynced')
                  }
                  trailing={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('edit')} ${localList.name}`}
                      onPress={() => {
                        setListEditorId(localList.id);
                        setListEditorName(localList.name);
                        setListEditorRemoteId(localList.syncTarget?.remoteListId || null);
                        setListEditorProvider(localList.syncTarget?.provider || null);
                        setError('');
                      }}
                      testID={`edit-list-${localList.id}`}
                      style={({ pressed }) => [
                        styles.listAction,
                        pressed && styles.listActionDisabled,
                      ]}
                    >
                      <Text style={styles.listActionText}>{t('edit')}</Text>
                    </Pressable>
                  }
                />
              </View>
            </View>
          ))}
          <Separator />
          <ActionButton
            title={t('addList')}
            onPress={() => {
              setListEditorId('new');
              setListEditorName('');
              setListEditorRemoteId(null);
              setListEditorProvider(null);
              setError('');
            }}
          />
        </Section>
        <Section title={t('storesSettings')} footer={t('manageStoresFooter')}>
          {stores.map((store, index) => (
            <View key={store.id}>
              {index ? <Separator /> : null}
              <ListRow
                title={store.name}
                trailing={<Text style={styles.listActionText}>{t('edit')}</Text>}
                onPress={() => {
                  setStoreEditorId(store.id);
                  setStoreEditorName(store.name);
                }}
                testID={`edit-store-${store.id}`}
              />
            </View>
          ))}
          {stores.length ? <Separator /> : null}
          <ActionButton
            title={t('addStore')}
            onPress={() => {
              setStoreEditorId('new');
              setStoreEditorName('');
            }}
          />
        </Section>
        <Section title={t('productLanguage')} footer={t('productLanguageFooter')}>
          {LANGUAGES.map((option, index) => {
            const key = (
              {
                auto: 'automatic',
                de: 'german',
                en: 'english',
                fr: 'french',
                it: 'italian',
              } as const
            )[option.value];
            const title = t(key);
            return (
              <View key={option.value}>
                {index > 0 ? <Separator /> : null}
                <ListRow
                  title={title}
                  selected={preferences.language === option.value}
                  testID={`product-language-${option.value}`}
                  onPress={() =>
                    updatePreferences(
                      { language: option.value },
                      t('languageSet', { language: title }),
                    )
                  }
                />
              </View>
            );
          })}
        </Section>
        <Section title={t('bringItemLabel')} footer={t('labelFooter')}>
          {LABEL_STYLES.map((style, index) => {
            const keys = (
              {
                generic: ['generic', 'genericExample'],
                exact: ['exactProduct', 'exactDetail'],
                ask: ['askEveryTime', 'askDetail'],
              } as const
            )[style.value];
            const title = t(keys[0]);
            return (
              <View key={style.value}>
                {index > 0 ? <Separator /> : null}
                <ListRow
                  title={title}
                  detail={t(keys[1])}
                  selected={preferences.labelStyle === style.value}
                  testID={`label-style-${style.value}`}
                  onPress={() =>
                    updatePreferences({ labelStyle: style.value }, t('labelSet', { style: title }))
                  }
                />
              </View>
            );
          })}
        </Section>
        <Section>
          <ListRow
            title={t('customBarcodes')}
            detail={t('customFooter')}
            onPress={openCustomBarcodes}
            trailing={<Text style={styles.open}>{t('manage')}</Text>}
            testID="custom-barcodes-open"
          />
        </Section>
        <Section title={t('productDatabases')} footer={t('databaseFooter')}>
          {PRODUCT_DATABASES.map((database, index) => {
            const description = t(
              (
                {
                  'Open Food Facts': 'foodDb',
                  'Open Products Facts': 'productsDb',
                  'Open Beauty Facts': 'beautyDb',
                  'Open Pet Food Facts': 'petDb',
                } as const
              )[database.name],
            );
            return (
              <View key={database.url}>
                {index > 0 ? <Separator /> : null}
                <ListRow
                  title={database.name}
                  detail={description}
                  onPress={() => void Linking.openURL(database.url)}
                  trailing={<NativeLink label={t('open')} destination={database.url} />}
                />
              </View>
            );
          })}
        </Section>
        <Text style={styles.disclaimer}>{t('disclaimer')}</Text>
        <View style={styles.iconCredit}>
          <NativeLink label={t('iconCredit')} destination="https://foodiconpack.com/license" />
        </View>
      </ScrollView>
      <NativeSheet
        visible={Boolean(listEditorId)}
        onDismiss={() => setListEditorId(null)}
        fraction={0.88}
        testID="list-editor-modal"
        contentTestID="list-editor-sheet"
        style={styles.listEditorSheet}
      >
        <View style={styles.modalHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
            onPress={() => setListEditorId(null)}
            style={styles.modalButtonLeft}
          >
            <Text style={styles.done}>{t('cancel')}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            {t(editedList ? 'editList' : 'addList')}
          </Text>
          <View style={styles.modalButtonSpacer} />
        </View>
        <ScrollView
          style={styles.editorScroll}
          contentContainerStyle={styles.listEditorContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Section>
            <Field
              label={t('listName')}
              accessibilityLabel={t('listName')}
              value={listEditorName}
              onChangeText={setListEditorName}
              onSubmitEditing={() =>
                void (editedList ? renameLocalList(editedList) : createLocalList())
              }
              autoFocus
              returnKeyType="done"
            />
          </Section>
          <Section title={t('syncWith')}>
            <ListRow
              title={t('notSynced')}
              selected={!listEditorProvider}
              onPress={() => {
                setListEditorProvider(null);
                setListEditorRemoteId(null);
              }}
              testID="list-editor-sync-none"
            />
            {bringSyncEnabled && credentials
              ? lists.map((list) => (
                  <View key={list.listUuid}>
                    <Separator />
                    <ListRow
                      title={list.name}
                      detail={t('bringProvider')}
                      selected={
                        listEditorProvider === 'bring' && listEditorRemoteId === list.listUuid
                      }
                      onPress={() => {
                        setListEditorProvider('bring');
                        setListEditorRemoteId(list.listUuid);
                      }}
                      testID={`list-editor-sync-${list.listUuid}`}
                    />
                  </View>
                ))
              : null}
            {mealieEnabled
              ? mealieLists.map((list) => (
                  <View key={`mealie-${list.id}`}>
                    <Separator />
                    <ListRow
                      title={list.name}
                      detail={t('mealieProvider')}
                      selected={listEditorProvider === 'mealie' && listEditorRemoteId === list.id}
                      onPress={() => {
                        setListEditorProvider('mealie');
                        setListEditorRemoteId(list.id);
                      }}
                      testID={`list-editor-sync-mealie-${list.id}`}
                    />
                  </View>
                ))
              : null}
          </Section>
          <Section>
            <ActionButton
              title={editedList ? t('save') : t('createList')}
              disabled={
                !listEditorName.trim() ||
                (listEditorName.trim() === editedList?.name &&
                  listEditorRemoteId === (editedList?.syncTarget?.remoteListId || null) &&
                  listEditorProvider === (editedList?.syncTarget?.provider || null))
              }
              onPress={() => void (editedList ? renameLocalList(editedList) : createLocalList())}
            />
            {editedList ? (
              <>
                <Separator />
                <ActionButton
                  title={t('deleteList')}
                  onPress={() => confirmDeleteList(editedList)}
                  destructive
                />
              </>
            ) : null}
          </Section>
        </ScrollView>
      </NativeSheet>
      <NativeSheet
        visible={Boolean(storeEditorId)}
        onDismiss={() => setStoreEditorId(null)}
        fraction={0.72}
        testID="store-editor-modal"
        contentTestID="store-editor-sheet"
        style={styles.storeEditorSheet}
      >
        <View style={styles.modalHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
            onPress={() => setStoreEditorId(null)}
            style={styles.modalButtonLeft}
          >
            <Text style={styles.done}>{t('cancel')}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            {t(editedStore ? 'editStore' : 'addStore')}
          </Text>
          <View style={styles.modalButtonSpacer} />
        </View>
        <ScrollView
          style={styles.editorScroll}
          contentContainerStyle={styles.listEditorContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Section>
            <Field
              label={t('storeName')}
              accessibilityLabel={t('storeName')}
              value={storeEditorName}
              onChangeText={setStoreEditorName}
              onSubmitEditing={() => void saveStore()}
              autoFocus
              returnKeyType="done"
            />
          </Section>
          <Section>
            <ActionButton
              title={editedStore ? t('save') : t('createStore')}
              disabled={!storeEditorName.trim() || storeEditorName.trim() === editedStore?.name}
              onPress={() => void saveStore()}
            />
            {editedStore ? (
              <>
                <Separator />
                <ActionButton
                  title={t('deleteStore')}
                  destructive
                  onPress={() => confirmDeleteStore(editedStore)}
                />
              </>
            ) : null}
          </Section>
        </ScrollView>
      </NativeSheet>
      <NativeSheet
        visible={customBarcodesVisible}
        onDismiss={closeCustomBarcodes}
        testID="custom-barcodes-modal"
        contentTestID="custom-barcodes-sheet"
        style={styles.modalSafe}
      >
        <SafeAreaView edges={['bottom']} style={styles.glassSheetInner}>
          <View style={styles.modalHeader}>
            <View style={styles.modalButtonSpacer} />
            <Text accessibilityRole="header" style={styles.modalTitle}>
              {t('customBarcodes')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('done')}
              hitSlop={8}
              onPress={closeCustomBarcodes}
              style={styles.modalButton}
            >
              <Text style={styles.done}>{t('done')}</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.editorScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Section title={t('addCustomBarcode')} footer={t('customFooter')}>
              <Field
                label={t('barcode')}
                value={barcode}
                onChangeText={setBarcode}
                keyboardType="number-pad"
                placeholder="7612345678901"
              />
              <Separator />
              <Field
                label={t('itemLabel')}
                value={label}
                onChangeText={setLabel}
                placeholder={t('productName')}
              />
              <Separator />
              <ActionButton title={t('saveCustom')} onPress={addCustom} />
            </Section>
            {custom.length > 0 && (
              <Section title={t('savedBarcodes')}>
                {custom.map((item, index) => (
                  <View key={item.barcode}>
                    {index > 0 ? <Separator /> : null}
                    <ListRow
                      title={item.label}
                      detail={item.barcode}
                      trailing={
                        <Pressable
                          accessibilityRole="button"
                          hitSlop={10}
                          onPress={() => removeCustom(item.barcode)}
                          testID={`delete-custom-${item.barcode}`}
                        >
                          <Text style={styles.delete}>{t('delete')}</Text>
                        </Pressable>
                      }
                    />
                  </View>
                ))}
              </Section>
            )}
          </ScrollView>
          {error && (
            <View pointerEvents="none" style={styles.modalStatus} testID="custom-status">
              <Notice>{error}</Notice>
            </View>
          )}
        </SafeAreaView>
      </NativeSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listAction: { minHeight: 36, justifyContent: 'center' },
  listActionDisabled: { opacity: 0.35 },
  listActionText: { color: colors.tint, fontSize: 15, fontWeight: '600' },
  switchRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabel: { flex: 1, color: colors.label, fontSize: 17, lineHeight: 22 },
  switch: { alignSelf: 'center', margin: 0 },
  statusSlot: { position: 'absolute', zIndex: 10, bottom: 12, left: 16, right: 16 },
  modalSafe: { flex: 1 },
  glassSheetInner: { flex: 1 },
  editorScroll: { flex: 1 },
  listEditorSheet: {
    height: '88%',
    maxHeight: '88%',
    minHeight: '72%',
  },
  storeEditorSheet: {
    height: '72%',
    minHeight: '72%',
  },
  listEditorContent: { padding: 16, paddingBottom: 32, gap: 18 },
  modalHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.bar,
  },
  modalTitle: {
    flex: 1,
    color: colors.label,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalButton: {
    width: 74,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 16,
  },
  modalButtonLeft: {
    width: 74,
    minHeight: 44,
    justifyContent: 'center',
    paddingLeft: 16,
  },
  modalButtonSpacer: { width: 74 },
  modalContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28, gap: 18 },
  modalStatus: { position: 'absolute', zIndex: 10, bottom: 12, left: 16, right: 16 },
  done: { color: colors.tint, fontSize: 17, fontWeight: '600' },
  open: { color: colors.tint, fontSize: 15, fontWeight: '500' },
  delete: { color: colors.destructive, fontSize: 15 },
  disclaimer: {
    color: colors.secondaryLabel,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginHorizontal: 18,
    marginBottom: 12,
  },
  iconCredit: {
    color: colors.tint,
    fontSize: 12,
    lineHeight: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
  },
});
