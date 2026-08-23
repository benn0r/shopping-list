import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionButton,
  colors,
  LargeTitle,
  Notice,
  Section,
  Separator,
  sheetModal,
  ui,
} from '../components/ui';
import { loadItems, removeItem as removeBringItem } from '../services/bringApi';
import { syncShoppingListWithBring } from '../services/bringSync';
import { groceryIconForLabel } from '../services/groceryIcons';
import { lookupProduct } from '../services/productLookup';
import {
  loadCredentials,
  addShoppingListItem,
  loadBringSyncEnabled,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadListViewMode,
  loadActiveShoppingList,
  loadShoppingList,
  loadShoppingLists,
  createShoppingList,
  selectActiveShoppingList,
  removeShoppingListItem,
} from '../services/storage';
import {
  BringItem,
  ListViewMode,
  Product,
  ShoppingListDefinition,
  ShoppingListItem,
} from '../types';
import { keepBestGeometry, selectInScanRegion } from '../services/barcodeSelection';
import { useI18n } from '../i18n';

const CANDIDATE_WINDOW_MS = 650;
const FRAME_SIDE = 28;
const FRAME_TOP = 154;
const FRAME_HEIGHT = 122;
const BRING_REFRESH_MS = 30_000;

export function ScannerScreen() {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [bringSyncEnabled, setBringSyncEnabled] = useState(false);
  const [syncLoaded, setSyncLoaded] = useState(false);
  const [bringConfigured, setBringConfigured] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [listViewMode, setListViewMode] = useState<ListViewMode>('list');
  const [lists, setLists] = useState<ShoppingListDefinition[]>([]);
  const [activeList, setActiveList] = useState<ShoppingListDefinition>({
    id: 'groceries',
    name: 'Groceries',
  });
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [selectedItem, setSelectedItem] = useState<ShoppingListItem | null>(null);
  const candidates = useRef(new Map<string, BarcodeScanningResult>());
  const candidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanTarget = useRef({ x: 175, y: 215 });
  const scanRegion = useRef({
    left: FRAME_SIDE,
    top: FRAME_TOP,
    right: 322,
    bottom: FRAME_TOP + FRAME_HEIGHT,
  });
  const scanLocked = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      Promise.all([
        loadBringSyncEnabled(),
        loadCredentials(),
        loadActiveShoppingList(),
        loadShoppingLists(),
        loadListViewMode(),
      ])
        .then(async ([enabled, credentials, list, storedLists, viewMode]) => {
          if (!live) return;
          const localItems = await loadShoppingList(list.id);
          setBringSyncEnabled(enabled);
          setCameraOpen(false);
          setBringConfigured(Boolean(credentials && list.bringList));
          setActiveList(list);
          setLists(storedLists);
          setItems(localItems);
          setListViewMode(viewMode);
          if (enabled && credentials && list.bringList) {
            try {
              const next = await syncShoppingListWithBring(list.id);
              if (live) setItems(next);
            } catch {
              // Keep the already loaded local list available while Bring is unreachable.
            }
          }
        })
        .catch(() => live && setBringConfigured(false))
        .finally(() => live && setSyncLoaded(true));
      return () => {
        live = false;
      };
    }, []),
  );
  useEffect(() => {
    const refresh = () => {
      if (!bringSyncEnabled || !bringConfigured) return;
      syncShoppingListWithBring(activeList.id)
        .then(setItems)
        .catch(() => {});
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const timer = setInterval(refresh, BRING_REFRESH_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [activeList.id, bringConfigured, bringSyncEnabled]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(
    () => () => {
      if (candidateTimer.current) clearTimeout(candidateTimer.current);
    },
    [],
  );

  function closeProduct() {
    scanLocked.current = false;
    setScanning(true);
    setProduct(null);
  }

  function closeCamera() {
    if (candidateTimer.current) clearTimeout(candidateTimer.current);
    candidateTimer.current = null;
    candidates.current.clear();
    scanLocked.current = false;
    setScanning(true);
    setCameraOpen(false);
  }

  function collectCandidate(result: BarcodeScanningResult) {
    if (!scanning || busy || scanLocked.current) return;
    keepBestGeometry(candidates.current, result, scanTarget.current);
    if (candidateTimer.current) return;
    candidateTimer.current = setTimeout(() => {
      const selected = selectInScanRegion([...candidates.current.values()], scanRegion.current);
      candidates.current.clear();
      candidateTimer.current = null;
      if (selected) {
        scanLocked.current = true;
        handleBarcode(selected.data);
      }
    }, CANDIDATE_WINDOW_MS);
  }

  async function handleBarcode(value: string) {
    if (!scanning || busy) return;
    setScanning(false);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const [customBarcodes, preferences] = await Promise.all([
        loadCustomBarcodes(),
        loadLookupPreferences(),
      ]);
      const found = await lookupProduct(value, customBarcodes, preferences);
      if (!found) throw new Error(t('productNotFound'));
      setProduct(found);
      setCameraOpen(false);
    } catch (e) {
      scanLocked.current = false;
      setError(
        e instanceof Error && e.message === t('productNotFound') ? e.message : t('lookupFailed'),
      );
      setScanning(true);
    } finally {
      setBusy(false);
    }
  }

  async function submit(label: string, quantity?: number) {
    if (!product) return;
    setBusy(true);
    setError('');
    try {
      const localItems = await addShoppingListItem(product, label, quantity, activeList.id);
      setItems(localItems);
      let synced = false;
      if (bringSyncEnabled && activeList.bringList) {
        try {
          setItems(await syncShoppingListWithBring(activeList.id));
          synced = true;
        } catch {
          // The item remains local and will be retried on the next foreground sync.
        }
      }
      setMessage(t(synced ? 'addedLocallyAndSynced' : 'addedLocally', { label }));
      closeProduct();
    } catch (e) {
      setError(
        e instanceof Error && e.message === t('configureFirst') ? e.message : t('addFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: ShoppingListItem): Promise<ShoppingListItem[]> {
    if (bringSyncEnabled && activeList.bringList) {
      const credentials = await loadCredentials();
      if (!credentials) throw new Error(t('configureFirst'));
      const list = activeList.bringList;
      let remote: BringItem | undefined = item.bringUuid
        ? { uuid: item.bringUuid, label: item.label, specification: item.bringSpecification }
        : undefined;
      if (!remote) {
        const remoteItems = await loadItems(credentials, list.listUuid);
        remote = remoteItems.find(
          (candidate) => candidate.label.trim().toLowerCase() === item.label.trim().toLowerCase(),
        );
      }
      if (remote) await removeBringItem(credentials, list.listUuid, remote);
    }
    return removeShoppingListItem(item.barcode, activeList.id);
  }

  async function refreshFromBring() {
    if (!bringSyncEnabled || !bringConfigured || refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      setItems(await syncShoppingListWithBring(activeList.id));
      setMessage(t('syncComplete'));
    } catch {
      setError(t('syncFailed'));
    } finally {
      setRefreshing(false);
    }
  }

  async function addManualItem() {
    const label = manualLabel.trim();
    if (!label || manualBusy) return;
    setManualBusy(true);
    setError('');
    const manualProduct: Product = {
      barcode: `manual:${Date.now()}`,
      label,
      exactLabel: label,
      genericLabel: label,
      source: 'custom',
    };
    try {
      const localItems = await addShoppingListItem(manualProduct, label, undefined, activeList.id);
      setItems(localItems);
      setManualLabel('');
      let synced = false;
      if (bringSyncEnabled && activeList.bringList) {
        try {
          setItems(await syncShoppingListWithBring(activeList.id));
          synced = true;
        } catch {
          // Keep the manual item locally for the next background sync attempt.
        }
      }
      setMessage(t(synced ? 'addedLocallyAndSynced' : 'addedLocally', { label }));
    } catch {
      setError(t('addFailed'));
    } finally {
      setManualBusy(false);
    }
  }

  async function switchList(list: ShoppingListDefinition) {
    await selectActiveShoppingList(list.id);
    setActiveList(list);
    setBringConfigured(Boolean((await loadCredentials()) && list.bringList));
    setItems(await loadShoppingList(list.id));
    setListPickerOpen(false);
    setSelectedItem(null);
    if (bringSyncEnabled && list.bringList) {
      try {
        setItems(await syncShoppingListWithBring(list.id));
      } catch {
        // The local list remains available while Bring is unreachable.
      }
    }
  }

  async function addList() {
    if (!newListName.trim()) return;
    const list = await createShoppingList(newListName);
    setLists((current) => [...current, list]);
    setNewListName('');
    await switchList(list);
  }

  async function removeSelectedItem() {
    if (!selectedItem) return;
    try {
      setItems(await removeItem(selectedItem));
      setSelectedItem(null);
    } catch {
      setError(t('removeFailed'));
    }
  }

  if (!syncLoaded || (bringSyncEnabled && !permission)) {
    return <SafeAreaView edges={['top']} style={ui.safe} />;
  }
  const cameraPanel = !permission ? null : !permission.granted ? (
    <Section footer={t('cameraAccess')}>
      <ActionButton title={t('allowCamera')} onPress={requestPermission} />
    </Section>
  ) : (
    <View style={scannerLayoutStyles.cameraStack}>
      <View
        style={styles.cameraWrap}
        testID="scanner-camera-wrap"
        onLayout={({ nativeEvent }) => {
          const { width } = nativeEvent.layout;
          scanRegion.current = {
            left: FRAME_SIDE,
            top: FRAME_TOP,
            right: width - FRAME_SIDE,
            bottom: FRAME_TOP + FRAME_HEIGHT,
          };
          scanTarget.current = { x: width / 2, y: FRAME_TOP + FRAME_HEIGHT / 2 };
        }}
      >
        <CameraView
          style={styles.camera}
          testID="scanner-camera"
          facing="back"
          active={!product}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={scanning ? collectCandidate : undefined}
        />
        <View pointerEvents="none" style={styles.scrimTop}>
          <Text style={styles.guidance}>{t('alignBarcode')}</Text>
        </View>
        <View pointerEvents="none" style={styles.frame} testID="scanner-frame" />
        {busy && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>{t('lookingUp')}</Text>
          </View>
        )}
      </View>
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={ui.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoider}
        testID="keyboard-avoiding-content"
      >
        <View style={ui.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('chooseList')}: ${activeList.name}`}
            testID="active-list-title"
            onPress={() => setListPickerOpen(true)}
            style={({ pressed }) => [styles.listTitleButton, pressed && styles.scanButtonPressed]}
          >
            <LargeTitle>{activeList.name}</LargeTitle>
            <Text style={styles.listTitleChevron}>⌄</Text>
          </Pressable>
        </View>
        <View style={[ui.screen, ui.content, styles.scannerContent]}>
          <View style={historyStyles.history}>
            {items.length > 0 && <Text style={historyStyles.title}>{t('shoppingList')}</Text>}
            <ScrollView
              bounces={bringSyncEnabled}
              contentContainerStyle={[
                historyStyles.list,
                listViewMode === 'tiles' && historyStyles.tiles,
              ]}
              testID="shopping-list-scroll"
              refreshControl={
                bringSyncEnabled ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void refreshFromBring()}
                    tintColor={colors.tint}
                    colors={[colors.tint]}
                    testID="bring-refresh-control"
                  />
                ) : undefined
              }
            >
              {items.map((item) => (
                <ShoppingListCard
                  key={item.barcode}
                  item={item}
                  onPress={() => setSelectedItem(item)}
                  viewMode={listViewMode}
                />
              ))}
            </ScrollView>
          </View>
        </View>
        <View style={styles.composer} testID="item-composer">
          <TextInput
            accessibilityLabel={t('newShoppingItem')}
            value={manualLabel}
            onChangeText={setManualLabel}
            onSubmitEditing={() => void addManualItem()}
            placeholder={t('newShoppingItemPlaceholder')}
            placeholderTextColor={colors.tertiaryLabel}
            returnKeyType="done"
            enablesReturnKeyAutomatically
            editable={!manualBusy}
            style={styles.composerInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scanProduct')}
            testID="open-scanner"
            onPress={() => setCameraOpen(true)}
            style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
          >
            <Image
              source={require('../../assets/icon.png')}
              style={styles.scanButtonIcon}
              testID="scan-button-icon"
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={cameraOpen}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={closeCamera}
        testID="scanner-drawer"
      >
        <View style={sheetModal.backdrop}>
          <SafeAreaView edges={['bottom']} style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('cancel')}
                onPress={closeCamera}
                style={styles.drawerCancel}
              >
                <Text style={styles.drawerCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.drawerTitle}>
                {t('scanProduct')}
              </Text>
              <View style={styles.drawerSpacer} />
            </View>
            <View style={styles.drawerContent}>{cameraPanel}</View>
            <Text style={styles.help}>{t('supportedCodes')}</Text>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={listPickerOpen}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => setListPickerOpen(false)}
        testID="list-picker-modal"
      >
        <View style={sheetModal.backdrop}>
          <SafeAreaView
            edges={['bottom']}
            style={[sheetModal.sheet, styles.compactSheet]}
            testID="list-picker-sheet"
          >
            <View style={styles.drawerHeader}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setListPickerOpen(false)}
                style={styles.drawerCancel}
              >
                <Text style={styles.drawerCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.drawerTitle}>
                {t('chooseList')}
              </Text>
              <View style={styles.drawerSpacer} />
            </View>
            <ScrollView contentContainerStyle={styles.pickerContent}>
              <Section>
                {lists.map((list, index) => (
                  <View key={list.id}>
                    {index > 0 ? <Separator /> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: list.id === activeList.id }}
                      testID={`local-list-${list.id}`}
                      onPress={() => void switchList(list)}
                      style={styles.pickerRow}
                    >
                      <View style={styles.pickerRowText}>
                        <Text style={styles.pickerTitle}>{list.name}</Text>
                        {list.bringList ? (
                          <Text style={styles.pickerDetail}>
                            {t('mappedToBring', { name: list.bringList.name })}
                          </Text>
                        ) : null}
                      </View>
                      {list.id === activeList.id ? <Text style={styles.pickerCheck}>✓</Text> : null}
                    </Pressable>
                  </View>
                ))}
              </Section>
              <Section title={t('newList')}>
                <View style={styles.newListRow}>
                  <TextInput
                    accessibilityLabel={t('listName')}
                    value={newListName}
                    onChangeText={setNewListName}
                    onSubmitEditing={() => void addList()}
                    placeholder={t('listName')}
                    placeholderTextColor={colors.tertiaryLabel}
                    returnKeyType="done"
                    style={styles.newListInput}
                  />
                  <ActionButton
                    title={t('createList')}
                    disabled={!newListName.trim()}
                    onPress={() => void addList()}
                  />
                </View>
              </Section>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
      <ItemDetailsSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onRemove={() => void removeSelectedItem()}
      />
      {!product && (error || message || (bringSyncEnabled && !bringConfigured)) && (
        <View pointerEvents="none" style={statusStyles.popover} testID="scanner-status">
          {error ? (
            <Notice>{error}</Notice>
          ) : message ? (
            <Notice kind="success">{message}</Notice>
          ) : (
            <Notice>{t('connectNotice')}</Notice>
          )}
        </View>
      )}
      {product && (
        <ProductSheet
          product={product}
          busy={busy}
          configured
          bringSyncEnabled={false}
          error={error}
          onAdd={submit}
          onClose={closeProduct}
        />
      )}
    </SafeAreaView>
  );
}

function ShoppingListCard({
  item,
  onPress,
  viewMode,
}: {
  item: ShoppingListItem;
  onPress: () => void;
  viewMode: ListViewMode;
}) {
  const { t } = useI18n();
  const imageSource = item.imageUrl ? { uri: item.imageUrl } : groceryIconForLabel(item.label);

  return (
    <View
      testID={`shopping-item-wrap-${item.barcode}`}
      style={viewMode === 'tiles' ? historyStyles.tileWrap : historyStyles.listWrap}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${t('itemDetails')}`}
        testID={`shopping-item-${item.barcode}`}
        onPress={onPress}
        style={({ pressed }) => [
          historyStyles.card,
          viewMode === 'tiles' && historyStyles.tileCard,
          pressed && historyStyles.pressed,
        ]}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            style={[historyStyles.image, viewMode === 'tiles' && historyStyles.tileImage]}
            testID={`shopping-item-image-${item.barcode}`}
          />
        ) : null}
        <View style={[historyStyles.text, viewMode === 'tiles' && historyStyles.tileText]}>
          <Text
            numberOfLines={3}
            style={[
              historyStyles.label,
              viewMode === 'tiles' && historyStyles.tileLabel,
              viewMode === 'tiles' && item.label.length > 22 && historyStyles.tileLabelLong,
              viewMode === 'tiles' && item.label.length > 36 && historyStyles.tileLabelVeryLong,
            ]}
          >
            {item.quantity ? `${item.quantity}× ` : ''}
            {item.label}
          </Text>
          {viewMode === 'list' && !item.barcode.startsWith('manual:') && (
            <Text numberOfLines={1} style={historyStyles.detail}>
              {item.brand || item.barcode}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

function ItemDetailsSheet({
  item,
  onClose,
  onRemove,
}: {
  item: ShoppingListItem | null;
  onClose: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const imageSource = item
    ? item.imageUrl
      ? { uri: item.imageUrl }
      : groceryIconForLabel(item.label)
    : undefined;
  return (
    <Modal
      visible={Boolean(item)}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
      testID="item-details-modal"
    >
      <View style={sheetModal.backdrop}>
        <SafeAreaView edges={['bottom']} style={[sheetModal.sheet, styles.detailSheet]}>
          <View style={styles.drawerHeader}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.drawerCancel}>
              <Text style={styles.drawerCancelText}>{t('done')}</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.drawerTitle}>
              {t('itemDetails')}
            </Text>
            <View style={styles.drawerSpacer} />
          </View>
          {item ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              {imageSource ? (
                <Image source={imageSource} style={styles.detailImage} testID="detail-image" />
              ) : null}
              <Text style={styles.detailTitle}>{item.label}</Text>
              {item.brand ? <Text style={styles.detailBrand}>{item.brand}</Text> : null}
              <Section>
                {!item.barcode.startsWith('manual:') ? (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('barcode')}</Text>
                      <Text style={styles.detailValue}>{item.barcode}</Text>
                    </View>
                    <Separator />
                  </>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('added')}</Text>
                  <Text style={styles.detailValue}>
                    {new Date(item.scannedAt).toLocaleString()}
                  </Text>
                </View>
                {item.source ? (
                  <>
                    <Separator />
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('source')}</Text>
                      <Text style={styles.detailValue}>
                        {sourceLabel(item.source, item.productType, t('customLabel'))}
                      </Text>
                    </View>
                  </>
                ) : null}
              </Section>
              <Section title={t('stores')}>
                <Text style={styles.storeText}>
                  {item.stores?.length ? item.stores.join(', ') : t('unknownStore')}
                </Text>
              </Section>
              <ActionButton title={t('removeFromList')} onPress={onRemove} destructive />
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function ProductSheet({
  product,
  busy,
  configured,
  bringSyncEnabled = false,
  error = '',
  onAdd,
  onClose,
}: {
  product: Product;
  busy: boolean;
  configured: boolean;
  bringSyncEnabled?: boolean;
  error?: string;
  onAdd: (label: string, quantity?: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState(product.label);
  const [quantity, setQuantity] = useState('');
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
      testID="product-modal"
    >
      <View style={sheetModal.backdrop}>
        <SafeAreaView
          edges={['bottom']}
          style={[styles.sheetSafe, sheetModal.sheet]}
          testID="product-sheet"
        >
          <View style={styles.sheetBar}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              hitSlop={8}
              style={productHeaderStyles.cancelButton}
            >
              <Text style={styles.cancel}>{t('cancel')}</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>{t('addItem')}</Text>
            <View style={productHeaderStyles.barSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {product.imageUrl ? (
              <Image
                source={{ uri: product.imageUrl }}
                style={styles.image}
                resizeMode="contain"
                testID="product-image"
              />
            ) : (
              <View style={styles.productIcon}>
                <Text style={styles.productIconText}>▦</Text>
              </View>
            )}
            <Text style={styles.product}>{product.exactLabel}</Text>
            {product.brand ? (
              <Text style={[ui.muted, productHeaderStyles.brand]}>{product.brand}</Text>
            ) : null}
            <Section title={t('itemLabel')}>
              <TextInput
                accessibilityLabel={t('itemLabel')}
                value={label}
                onChangeText={setLabel}
                style={styles.labelInput}
                placeholder={t('shoppingListLabel')}
                placeholderTextColor={colors.tertiaryLabel}
                selectionColor={colors.tint}
              />
            </Section>
            <Section title={t('quantity')}>
              <View style={quantityStyles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('decreaseQuantity')}
                  disabled={!quantity}
                  onPress={() =>
                    setQuantity((value) => {
                      const next = Number(value) - 1;
                      return next > 0 ? String(next) : '';
                    })
                  }
                  style={({ pressed }) => [
                    quantityStyles.button,
                    (pressed || !quantity) && quantityStyles.disabled,
                  ]}
                >
                  <Text style={quantityStyles.symbol}>−</Text>
                </Pressable>
                <TextInput
                  accessibilityLabel={t('quantity')}
                  value={quantity}
                  placeholder="—"
                  placeholderTextColor={colors.tertiaryLabel}
                  onChangeText={(value) => {
                    const digits = value.replace(/\D/g, '');
                    setQuantity(digits ? String(Math.min(99, Number(digits))) : '');
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  style={quantityStyles.input}
                  selectionColor={colors.tint}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('increaseQuantity')}
                  disabled={Number(quantity) >= 99}
                  onPress={() =>
                    setQuantity((value) => String(Math.min(99, (Number(value) || 0) + 1)))
                  }
                  style={({ pressed }) => [
                    quantityStyles.button,
                    (pressed || Number(quantity) >= 99) && quantityStyles.disabled,
                  ]}
                >
                  <Text style={quantityStyles.symbol}>+</Text>
                </Pressable>
              </View>
            </Section>
            <Section>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('barcode')}</Text>
                <Text style={styles.detailValue}>{product.barcode}</Text>
              </View>
              <Separator />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('source')}</Text>
                <Text style={styles.detailValue}>{sourceName(product, t('customLabel'))}</Text>
              </View>
            </Section>
            <View style={styles.primaryWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(bringSyncEnabled ? 'addAndSync' : 'addToShoppingList')}
                disabled={busy || !configured || !label.trim()}
                onPress={() => onAdd(label.trim(), quantity ? Number(quantity) : undefined)}
                style={({ pressed }) => [
                  styles.primary,
                  (pressed || busy || !configured || !label.trim()) && styles.primaryDisabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>
                    {t(bringSyncEnabled ? 'addAndSync' : 'addToShoppingList')}
                  </Text>
                )}
              </Pressable>
            </View>
            {error ? <Notice testID="product-status">{error}</Notice> : null}
            {!configured && <Text style={styles.sheetHelp}>{t('configureBeforeAdding')}</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function sourceName(product: Product, customLabel: string) {
  return sourceLabel(product.source, product.productType, customLabel);
}

function sourceLabel(
  source: Product['source'],
  productType: Product['productType'],
  customLabel: string,
) {
  if (source === 'custom') return customLabel;
  return (
    {
      food: 'Open Food Facts',
      product: 'Open Products Facts',
      beauty: 'Open Beauty Facts',
      petfood: 'Open Pet Food Facts',
    } as const
  )[productType || 'product'];
}

const scannerLayoutStyles = StyleSheet.create({
  cameraStack: { flex: 1, minHeight: 300, maxHeight: 430, zIndex: 2 },
});
const statusStyles = StyleSheet.create({
  popover: { position: 'absolute', zIndex: 10, left: 16, right: 16, bottom: 12 },
});
const historyStyles = StyleSheet.create({
  history: { flex: 1, minHeight: 0, gap: 7 },
  title: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, marginLeft: 16 },
  list: { flexGrow: 1, gap: 12, paddingBottom: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  listWrap: { width: '100%' },
  tileWrap: { width: '31%', minWidth: 0 },
  card: {
    width: '100%',
    minHeight: 68,
    padding: 8,
    borderRadius: 12,
    backgroundColor: colors.secondaryGroupedBackground,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tileCard: {
    width: '100%',
    aspectRatio: 1,
    minHeight: 0,
    padding: 7,
    gap: 6,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: 52,
    height: 52,
    borderRadius: 8,
    resizeMode: 'contain',
    backgroundColor: '#FFFFFF',
  },
  tileImage: { width: 40, height: 40, borderRadius: 7 },
  text: { flex: 1, justifyContent: 'center' },
  tileText: { flex: 0, width: '100%', alignItems: 'center' },
  label: { color: colors.label, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  tileLabel: { textAlign: 'center' },
  tileLabelLong: { fontSize: 14, lineHeight: 17 },
  tileLabelVeryLong: { fontSize: 12, lineHeight: 15 },
  detail: { color: colors.secondaryLabel, fontSize: 12, lineHeight: 15, marginTop: 2 },
  pressed: { opacity: 0.55 },
});
const productHeaderStyles = StyleSheet.create({
  brand: { textAlign: 'center', marginTop: -10 },
  cancelButton: { width: 72, minHeight: 44, justifyContent: 'center' },
  barSpacer: { width: 72 },
});
const quantityStyles = StyleSheet.create({
  row: {
    minHeight: 54,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondarySystemBackground,
  },
  disabled: { opacity: 0.35 },
  symbol: { color: colors.tint, fontSize: 25, lineHeight: 28, fontWeight: '500' },
  input: {
    width: 62,
    height: 40,
    borderRadius: 9,
    backgroundColor: colors.secondarySystemBackground,
    color: colors.label,
    fontSize: 19,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 0,
  },
});
const styles = StyleSheet.create({
  keyboardAvoider: { flex: 1 },
  scannerContent: { flex: 1 },
  listTitleButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8 },
  listTitleChevron: { color: colors.tint, fontSize: 23, lineHeight: 28, fontWeight: '600' },
  compactSheet: { height: '68%', minHeight: '68%' },
  detailSheet: { height: '78%', minHeight: '78%' },
  pickerContent: { padding: 16, gap: 8 },
  pickerRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerRowText: { flex: 1 },
  pickerTitle: { color: colors.label, fontSize: 17, fontWeight: '600' },
  pickerDetail: { color: colors.secondaryLabel, fontSize: 12, lineHeight: 16, marginTop: 2 },
  pickerCheck: { color: colors.tint, fontSize: 20, fontWeight: '700' },
  newListRow: { padding: 10, gap: 8 },
  newListInput: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    color: colors.label,
    backgroundColor: colors.secondarySystemBackground,
    fontSize: 16,
  },
  detailContent: { padding: 16, gap: 14 },
  detailImage: {
    width: 104,
    height: 104,
    borderRadius: 14,
    resizeMode: 'contain',
    backgroundColor: '#FFFFFF',
    alignSelf: 'center',
  },
  detailTitle: {
    color: colors.label,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  detailBrand: { color: colors.secondaryLabel, fontSize: 15, textAlign: 'center', marginTop: -8 },
  storeText: { color: colors.label, fontSize: 16, lineHeight: 21, padding: 13 },
  composer: {
    flexShrink: 0,
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 68,
    padding: 6,
    paddingLeft: 10,
    borderRadius: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bar,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  composerInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 25,
    color: colors.label,
    backgroundColor: colors.secondaryGroupedBackground,
    fontSize: 17,
  },
  scanButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  scanButtonPressed: { opacity: 0.72 },
  scanButtonIcon: { width: 44, height: 44, borderRadius: 22 },
  drawer: {
    height: '76%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.systemGroupedBackground,
  },
  drawerHeader: {
    minHeight: 52,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.bar,
  },
  drawerCancel: { width: 82, minHeight: 44, justifyContent: 'center' },
  drawerCancelText: { color: colors.tint, fontSize: 17 },
  drawerTitle: {
    flex: 1,
    color: colors.label,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
  },
  drawerSpacer: { width: 82 },
  drawerContent: { flex: 1, padding: 16 },
  cameraWrap: {
    flex: 1,
    minHeight: 300,
    maxHeight: 430,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: colors.brand,
  },
  camera: { flex: 1 },
  scrimTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,65,60,0.48)',
  },
  guidance: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  frame: {
    position: 'absolute',
    left: FRAME_SIDE,
    right: FRAME_SIDE,
    top: FRAME_TOP,
    height: FRAME_HEIGHT,
    borderWidth: 3,
    borderRadius: 12,
    borderColor: colors.brand,
  },
  loading: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(7,52,48,0.56)',
  },
  loadingText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  help: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  sheetSafe: { flex: 1, backgroundColor: colors.systemGroupedBackground },
  sheetBar: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.bar,
  },
  cancel: { color: colors.tint, fontSize: 17 },
  sheetTitle: { color: colors.label, fontSize: 17, fontWeight: '600' },
  placeholder: { width: 48 },
  sheetContent: { padding: 20, gap: 18, alignItems: 'stretch' },
  image: { height: 150, width: '100%' },
  productIcon: {
    alignSelf: 'center',
    width: 110,
    height: 110,
    borderRadius: 24,
    backgroundColor: colors.secondarySystemBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productIconText: { color: colors.tint, fontSize: 54 },
  product: {
    color: colors.label,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  labelInput: { minHeight: 50, paddingHorizontal: 16, color: colors.label, fontSize: 17 },
  detailRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  detailLabel: { color: colors.label, fontSize: 17, flex: 1 },
  detailValue: { color: colors.secondaryLabel, fontSize: 17 },
  primaryWrap: { paddingTop: 2 },
  primary: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.42 },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  sheetHelp: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
