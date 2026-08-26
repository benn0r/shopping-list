import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  AppState,
  Image,
  Keyboard,
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
  CameraIcon,
  ChevronIcon,
  colors,
  GlassSurface,
  NativeIcon,
  Notice,
  Section,
  Separator,
  ui,
} from '../components/ui';
import { NativeSheet } from '../components/NativeSheet';
import { groceryIconForLabel } from '../services/groceryIcons';
import { lookupProduct } from '../services/productLookup';
import {
  getListSyncState,
  removeFromSyncedList,
  syncShoppingList,
} from '../services/shoppingListSync';
import {
  addShoppingListItem,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadListViewMode,
  loadActiveShoppingList,
  loadShoppingList,
  loadShoppingLists,
  selectActiveShoppingList,
  removeShoppingListItem,
} from '../services/storage';
import { ListViewMode, Product, ShoppingListDefinition, ShoppingListItem } from '../types';
import { keepBestGeometry, selectInScanRegion } from '../services/barcodeSelection';
import { useI18n } from '../i18n';

const CANDIDATE_WINDOW_MS = 650;
const FRAME_SIDE = 28;
const FRAME_TOP = 154;
const FRAME_HEIGHT = 122;
const SYNC_REFRESH_MS = 30_000;
const NATIVE_TAB_BAR_CLEARANCE = 64;

export function getComposerKeyboardInset(keyboardHeight: number) {
  return Math.max(0, keyboardHeight);
}

export function ScannerScreen() {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncLoaded, setSyncLoaded] = useState(false);
  const [syncConfigured, setSyncConfigured] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [listViewMode, setListViewMode] = useState<ListViewMode>('list');
  const [lists, setLists] = useState<ShoppingListDefinition[]>([]);
  const [activeList, setActiveList] = useState<ShoppingListDefinition>({
    id: 'groceries',
    name: 'Groceries',
  });
  const [listPickerOpen, setListPickerOpen] = useState(false);
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
  const manualInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const showSubscription = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      setKeyboardInset(getComposerKeyboardInset(event.endCoordinates.height));
    });
    const hideSubscription = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardInset(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      Promise.all([loadActiveShoppingList(), loadShoppingLists(), loadListViewMode()])
        .then(async ([list, storedLists, viewMode]) => {
          if (!live) return;
          const [localItems, syncState] = await Promise.all([
            loadShoppingList(list.id),
            getListSyncState(list),
          ]);
          setSyncEnabled(syncState.enabled);
          setCameraOpen(false);
          setSyncConfigured(syncState.configured);
          setActiveList(list);
          setLists(storedLists);
          setItems(localItems);
          setListViewMode(viewMode);
          if (syncState.configured) {
            try {
              const next = await syncShoppingList(list.id);
              if (live) setItems(next);
            } catch {
              // Keep the already loaded local list available while its provider is unreachable.
            }
          }
        })
        .catch(() => live && setSyncConfigured(false))
        .finally(() => live && setSyncLoaded(true));
      return () => {
        live = false;
      };
    }, []),
  );
  useEffect(() => {
    const refresh = () => {
      if (!syncEnabled || !syncConfigured) return;
      syncShoppingList(activeList.id)
        .then(setItems)
        .catch(() => {});
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const timer = setInterval(refresh, SYNC_REFRESH_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [activeList.id, syncConfigured, syncEnabled]);
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
      if (syncConfigured) {
        try {
          setItems(await syncShoppingList(activeList.id));
        } catch {
          // The item remains local and will be retried on the next foreground sync.
        }
      }
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
    if (syncConfigured) await removeFromSyncedList(activeList, item);
    return removeShoppingListItem(item.barcode, activeList.id);
  }

  async function refreshFromProvider() {
    if (!syncEnabled || !syncConfigured || refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      setItems(await syncShoppingList(activeList.id));
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
      if (syncConfigured) {
        try {
          setItems(await syncShoppingList(activeList.id));
        } catch {
          // Keep the manual item locally for the next background sync attempt.
        }
      }
    } catch {
      setError(t('addFailed'));
    } finally {
      setManualBusy(false);
      requestAnimationFrame(() => manualInputRef.current?.focus());
    }
  }

  async function switchList(list: ShoppingListDefinition) {
    await selectActiveShoppingList(list.id);
    setActiveList(list);
    const syncState = await getListSyncState(list);
    setSyncEnabled(syncState.enabled);
    setSyncConfigured(syncState.configured);
    setItems(await loadShoppingList(list.id));
    setListPickerOpen(false);
    setSelectedItem(null);
    if (syncState.configured) {
      try {
        setItems(await syncShoppingList(list.id));
      } catch {
        // The local list remains available while Bring is unreachable.
      }
    }
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

  if (!syncLoaded || (syncEnabled && !permission)) {
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
      <View style={styles.screenBody}>
        <View style={ui.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('chooseList')}: ${activeList.name}`}
            testID="active-list-title"
            onPress={() => setListPickerOpen(true)}
            style={({ pressed }) => [styles.listTitleButton, pressed && styles.scanButtonPressed]}
          >
            <Text accessibilityRole="header" numberOfLines={2} style={styles.listTitleText}>
              {activeList.name}
            </Text>
            <GlassSurface style={styles.listTitleChevronBadge}>
              <ChevronIcon direction="down" size={9} color={colors.tint} />
            </GlassSurface>
          </Pressable>
        </View>
        <View style={[ui.screen, ui.content, styles.scannerContent]}>
          <View style={historyStyles.history}>
            <ScrollView
              bounces={syncEnabled}
              contentContainerStyle={[
                historyStyles.list,
                listViewMode === 'tiles' && historyStyles.tiles,
              ]}
              testID="shopping-list-scroll"
              refreshControl={
                syncEnabled ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void refreshFromProvider()}
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
        <View
          pointerEvents="box-none"
          style={[
            styles.composerAvoider,
            {
              bottom:
                12 +
                keyboardInset +
                (Platform.OS === 'ios' && keyboardInset === 0 ? NATIVE_TAB_BAR_CLEARANCE : 0),
            },
          ]}
          testID="keyboard-avoiding-composer"
        >
          <GlassSurface
            fallbackColor={colors.bar}
            isInteractive
            style={styles.composer}
            testID="item-composer"
          >
            <TextInput
              ref={manualInputRef}
              accessibilityLabel={t('newShoppingItem')}
              value={manualLabel}
              onChangeText={setManualLabel}
              onSubmitEditing={() => void addManualItem()}
              placeholder={t('newShoppingItemPlaceholder')}
              placeholderTextColor={colors.tertiaryLabel}
              returnKeyType="done"
              enablesReturnKeyAutomatically
              blurOnSubmit={false}
              submitBehavior="submit"
              style={styles.composerInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scanProduct')}
              testID="open-scanner"
              onPress={() => setCameraOpen(true)}
              style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
            >
              <CameraIcon />
            </Pressable>
          </GlassSurface>
        </View>
      </View>
      <NativeSheet
        visible={cameraOpen}
        onDismiss={closeCamera}
        fraction={0.76}
        testID="scanner-drawer"
        style={styles.drawer}
      >
        <SafeAreaView edges={['bottom']} style={styles.glassSheetInner}>
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
      </NativeSheet>
      <NativeSheet
        visible={listPickerOpen}
        onDismiss={() => setListPickerOpen(false)}
        fraction={0.48}
        testID="list-picker-modal"
        contentTestID="list-picker-sheet"
        style={styles.compactSheet}
      >
        <SafeAreaView edges={['bottom']} style={styles.glassSheetInner}>
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
            {lists.map((list) => {
              const selected = list.id === activeList.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`local-list-${list.id}`}
                  key={list.id}
                  onPress={() => void switchList(list)}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    selected && styles.pickerRowSelected,
                    pressed && styles.pickerRowPressed,
                  ]}
                >
                  <View style={[styles.pickerIcon, selected && styles.pickerIconSelected]}>
                    <NativeIcon
                      ios="list.bullet"
                      android="list"
                      size={22}
                      color={selected ? '#FFFFFF' : colors.secondaryLabel}
                    />
                  </View>
                  <Text style={styles.pickerTitle} numberOfLines={2}>
                    {list.name}
                  </Text>
                  <View
                    style={[styles.pickerRadio, selected && styles.pickerRadioSelected]}
                    testID={`local-list-radio-${list.id}`}
                  >
                    {selected ? <View style={styles.pickerRadioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </NativeSheet>
      <ItemDetailsSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onRemove={() => void removeSelectedItem()}
      />
      {!product && (error || (syncEnabled && !syncConfigured)) && (
        <View pointerEvents="none" style={statusStyles.popover} testID="scanner-status">
          {error ? <Notice>{error}</Notice> : <Notice>{t('connectNotice')}</Notice>}
        </View>
      )}
      {product && (
        <ProductSheet
          product={product}
          busy={busy}
          configured
          syncEnabled={false}
          error={error}
          onAdd={submit}
          onClose={closeProduct}
        />
      )}
    </SafeAreaView>
  );
}

export function ShoppingListCard({
  item,
  onPress,
  viewMode,
  accessibilityLabel,
  testIDPrefix = 'shopping-item',
}: {
  item: ShoppingListItem;
  onPress: () => void;
  viewMode: ListViewMode;
  accessibilityLabel?: string;
  testIDPrefix?: string;
}) {
  const { t } = useI18n();
  const imageSource = item.imageUrl ? { uri: item.imageUrl } : groceryIconForLabel(item.label);
  const amount =
    item.quantity !== undefined
      ? item.unit
        ? `${item.quantity} ${item.unit} `
        : `${item.quantity}× `
      : '';

  return (
    <View
      testID={`${testIDPrefix}-wrap-${item.barcode}`}
      style={viewMode === 'tiles' ? historyStyles.tileWrap : historyStyles.listWrap}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || `${item.label}, ${t('itemDetails')}`}
        testID={`${testIDPrefix}-${item.barcode}`}
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
            testID={`${testIDPrefix}-image-${item.barcode}`}
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
            {amount}
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
    <NativeSheet
      visible={Boolean(item)}
      onDismiss={onClose}
      fraction={0.78}
      testID="item-details-modal"
      style={styles.detailSheet}
    >
      <SafeAreaView edges={['bottom']} style={styles.glassSheetInner}>
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
              {item.quantity !== undefined ? (
                <>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('quantity')}</Text>
                    <Text style={styles.detailValue}>
                      {item.quantity}
                      {item.unit ? ` ${item.unit}` : ''}
                    </Text>
                  </View>
                  <Separator />
                </>
              ) : null}
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
                <Text style={styles.detailValue}>{new Date(item.scannedAt).toLocaleString()}</Text>
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
    </NativeSheet>
  );
}

export function ProductSheet({
  product,
  busy,
  configured,
  syncEnabled = false,
  error = '',
  onAdd,
  onClose,
}: {
  product: Product;
  busy: boolean;
  configured: boolean;
  syncEnabled?: boolean;
  error?: string;
  onAdd: (label: string, quantity?: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState(product.label);
  const [quantity, setQuantity] = useState('');
  return (
    <NativeSheet
      visible
      onDismiss={onClose}
      testID="product-modal"
      contentTestID="product-sheet"
      style={styles.sheetSafe}
    >
      <SafeAreaView edges={['bottom']} style={styles.glassSheetInner}>
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
              <NativeIcon
                ios="barcode.viewfinder"
                android="barcode_scanner"
                size={54}
                color={colors.tint}
                testID="product-placeholder-icon"
              />
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
                <NativeIcon ios="minus" android="remove" color={colors.tint} size={20} />
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
                <NativeIcon ios="plus" android="add" color={colors.tint} size={20} />
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
              accessibilityLabel={t(syncEnabled ? 'addAndSync' : 'addToShoppingList')}
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
                  {t(syncEnabled ? 'addAndSync' : 'addToShoppingList')}
                </Text>
              )}
            </Pressable>
          </View>
          {error ? <Notice testID="product-status">{error}</Notice> : null}
          {!configured && <Text style={styles.sheetHelp}>{t('configureBeforeAdding')}</Text>}
        </ScrollView>
      </SafeAreaView>
    </NativeSheet>
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
  screenBody: { flex: 1 },
  scannerContent: { flex: 1 },
  listTitleButton: {
    width: '100%',
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  listTitleText: {
    flexShrink: 1,
    color: colors.label,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  listTitleChevronBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  compactSheet: { height: '48%', minHeight: '48%' },
  detailSheet: { height: '78%', minHeight: '78%' },
  pickerContent: { padding: 16, paddingBottom: 28, gap: 10 },
  pickerRow: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    backgroundColor: colors.secondaryGroupedBackground,
  },
  pickerRowSelected: {
    borderColor: colors.tint,
    backgroundColor: colors.secondarySystemBackground,
  },
  pickerRowPressed: { opacity: 0.62, transform: [{ scale: 0.99 }] },
  pickerIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondarySystemBackground,
  },
  pickerIconSelected: { backgroundColor: colors.tint },
  pickerTitle: { flex: 1, color: colors.label, fontSize: 18, lineHeight: 22, fontWeight: '600' },
  pickerRadio: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.tertiaryLabel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerRadioSelected: { borderColor: colors.tint },
  pickerRadioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.tint },
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
  composerAvoider: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
  },
  composer: {
    minHeight: 68,
    padding: 6,
    paddingLeft: 10,
    borderRadius: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  drawer: {
    height: '76%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  glassSheetInner: { flex: 1 },
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
  drawerContent: { flex: 1, padding: 16, paddingBottom: 5 },
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
  help: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: -3,
    paddingBottom: 5,
  },
  sheetSafe: { flex: 1 },
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
