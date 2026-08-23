import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
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
  sheetModal,
  ui,
} from '../components/ui';
import {
  DEFAULT_LOOKUP_PREFERENCES,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadListViewMode,
  loadShoppingLists,
  saveCustomBarcodes,
  saveLookupPreferences,
  saveListViewMode,
  setShoppingListBringMapping,
  subscribeShoppingLists,
} from '../services/storage';
import {
  BringList,
  CustomBarcode,
  LabelStyle,
  ListViewMode,
  LookupPreferences,
  ProductLanguage,
  ShoppingListDefinition,
} from '../types';
import { PRODUCT_DATABASES } from '../productDatabases';
import { APP_LANGUAGES, translate, useI18n } from '../i18n';
import { useAuth } from '../auth';

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
  const { bringSyncEnabled, credentials, lists, logout, setBringSyncEnabled } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [label, setLabel] = useState('');
  const [custom, setCustom] = useState<CustomBarcode[]>([]);
  const [preferences, setPreferences] = useState<LookupPreferences>(DEFAULT_LOOKUP_PREFERENCES);
  const [listViewMode, setListViewMode] = useState<ListViewMode>('list');
  const [shoppingLists, setShoppingLists] = useState<ShoppingListDefinition[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [customBarcodesVisible, setCustomBarcodesVisible] = useState(false);
  useEffect(() => {
    const load = () => {
      Promise.all([
        loadCustomBarcodes(),
        loadLookupPreferences(),
        loadListViewMode(),
        loadShoppingLists(),
      ])
        .then(([b, p, viewMode, storedLists]) => {
          setCustom(b);
          setPreferences(p);
          setListViewMode(viewMode);
          setShoppingLists(storedLists);
        })
        .catch(() => {});
    };
    load();
    return subscribeShoppingLists(load);
  }, []);
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 3000);
    return () => clearTimeout(timer);
  }, [success]);
  async function signOut() {
    await logout();
    setError('');
    setSuccess('');
  }
  async function choose(localList: ShoppingListDefinition, list: BringList | null) {
    setShoppingLists(await setShoppingListBringMapping(localList.id, list));
    setSuccess(list ? t('selected', { name: list.name }) : t('noBringList'));
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

  return (
    <SafeAreaView edges={['top']} style={ui.safe}>
      <View style={ui.header}>
        <LargeTitle>{t('settings')}</LargeTitle>
      </View>
      {!customBarcodesVisible && success && (
        <View pointerEvents="none" style={styles.statusSlot} testID="settings-status">
          <Notice kind="success">{success}</Notice>
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
        {bringSyncEnabled && credentials ? (
          <Section title={t('bringAccount')} footer={t('accountFooter')}>
            <ListRow title={t('email')} detail={credentials.email} />
            <Separator />
            <ActionButton title={t('logout')} onPress={signOut} destructive />
          </Section>
        ) : null}
        {bringSyncEnabled && lists.length > 0
          ? shoppingLists.map((localList) => (
              <Section
                key={localList.id}
                title={localList.name}
                footer={t('mappedToBring', {
                  name: localList.bringList?.name || t('noBringList'),
                })}
              >
                <ListRow
                  title={t('noBringList')}
                  selected={!localList.bringList}
                  onPress={() => void choose(localList, null)}
                  testID={`bring-map-${localList.id}-none`}
                />
                {lists.map((list) => (
                  <View key={list.listUuid}>
                    <Separator />
                    <ListRow
                      title={list.name}
                      selected={localList.bringList?.listUuid === list.listUuid}
                      onPress={() => void choose(localList, list)}
                      testID={`bring-map-${localList.id}-${list.listUuid}`}
                    />
                  </View>
                ))}
              </Section>
            ))
          : null}
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
                  onPress={() => Linking.openURL(database.url)}
                  trailing={<Text style={styles.open}>{t('open')}</Text>}
                />
              </View>
            );
          })}
        </Section>
        <Text style={styles.disclaimer}>{t('disclaimer')}</Text>
        <Text
          accessibilityRole="link"
          onPress={() => void Linking.openURL('https://foodiconpack.com/license')}
          style={styles.iconCredit}
        >
          {t('iconCredit')}
        </Text>
      </ScrollView>
      <Modal
        visible={customBarcodesVisible}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={closeCustomBarcodes}
        testID="custom-barcodes-modal"
      >
        <View style={sheetModal.backdrop}>
          <SafeAreaView
            edges={['bottom']}
            style={[styles.modalSafe, sheetModal.sheet]}
            testID="custom-barcodes-sheet"
          >
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
              style={ui.screen}
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
                  label={t('bringLabel')}
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
            {(error || success) && (
              <View pointerEvents="none" style={styles.modalStatus} testID="custom-status">
                {error ? <Notice>{error}</Notice> : <Notice kind="success">{success}</Notice>}
              </View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { flex: 1, color: colors.label, fontSize: 17 },
  switch: Platform.OS === 'ios' ? { marginRight: -8 } : {},
  statusSlot: { position: 'absolute', zIndex: 10, bottom: 12, left: 16, right: 16 },
  modalSafe: { flex: 1, backgroundColor: colors.systemGroupedBackground },
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
