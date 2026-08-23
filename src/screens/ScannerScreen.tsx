import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
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
import { addItem } from '../services/bringApi';
import { lookupProduct } from '../services/productLookup';
import {
  loadCredentials,
  addShoppingListItem,
  loadBringSyncEnabled,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadShoppingList,
  loadSelectedList,
  removeShoppingListItem,
} from '../services/storage';
import { Product, ShoppingListItem } from '../types';
import { keepBestGeometry, selectInScanRegion } from '../services/barcodeSelection';
import { useI18n } from '../i18n';

const CANDIDATE_WINDOW_MS = 650;
const FRAME_SIDE = 28;
const FRAME_TOP = 154;
const FRAME_HEIGHT = 122;

export function ScannerScreen() {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [bringSyncEnabled, setBringSyncEnabled] = useState(false);
  const [bringConfigured, setBringConfigured] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<ShoppingListItem[]>([]);
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
      Promise.all([loadBringSyncEnabled(), loadCredentials(), loadSelectedList()])
        .then(([enabled, credentials, list]) => {
          if (!live) return;
          setBringSyncEnabled(enabled);
          setBringConfigured(Boolean(credentials && list));
        })
        .catch(() => live && setBringConfigured(false));
      return () => {
        live = false;
      };
    }, []),
  );
  useEffect(() => {
    loadShoppingList()
      .then(setItems)
      .catch(() => {});
  }, []);
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
      if (bringSyncEnabled) {
        const [credentials, list] = await Promise.all([loadCredentials(), loadSelectedList()]);
        if (!credentials || !list) throw new Error(t('configureFirst'));
        await addItem(credentials, list.listUuid, label, quantity);
      }
      setItems(await addShoppingListItem(product, label, quantity));
      setMessage(t(bringSyncEnabled ? 'addedLocallyAndSynced' : 'addedLocally', { label }));
      closeProduct();
    } catch (e) {
      setError(
        e instanceof Error && e.message === t('configureFirst') ? e.message : t('addFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!permission) return <SafeAreaView edges={['top']} style={ui.safe} />;
  return (
    <SafeAreaView edges={['top']} style={ui.safe}>
      <View style={ui.header}>
        <LargeTitle>{t('scan')}</LargeTitle>
      </View>
      <View style={[ui.screen, ui.content, styles.scannerContent]}>
        {!permission.granted ? (
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
        )}
        <Text style={styles.help}>{t('supportedCodes')}</Text>
        <View style={historyStyles.history}>
          {items.length > 0 && (
            <>
              <Text style={historyStyles.title}>{t('shoppingList')}</Text>
              <ScrollView
                horizontal
                bounces={false}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={historyStyles.list}
              >
                {items.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('markPurchased', { label: item.label })}
                    key={item.barcode}
                    testID={`shopping-item-${item.barcode}`}
                    onPress={() => removeShoppingListItem(item.barcode).then(setItems)}
                    style={({ pressed }) => [historyStyles.card, pressed && historyStyles.pressed]}
                  >
                    <Text numberOfLines={1} style={historyStyles.label}>
                      {item.quantity ? `${item.quantity}× ` : ''}
                      {item.label}
                    </Text>
                    <Text numberOfLines={1} style={historyStyles.detail}>
                      {item.brand || item.barcode}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </View>
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
          configured={!bringSyncEnabled || bringConfigured}
          bringSyncEnabled={bringSyncEnabled}
          error={error}
          onAdd={submit}
          onClose={closeProduct}
        />
      )}
    </SafeAreaView>
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
  if (product.source === 'custom') return customLabel;
  return (
    {
      food: 'Open Food Facts',
      product: 'Open Products Facts',
      beauty: 'Open Beauty Facts',
      petfood: 'Open Pet Food Facts',
    } as const
  )[product.productType || 'product'];
}

const scannerLayoutStyles = StyleSheet.create({
  cameraStack: { flex: 1, minHeight: 300, maxHeight: 430, zIndex: 2 },
});
const statusStyles = StyleSheet.create({
  popover: { position: 'absolute', zIndex: 10, left: 16, right: 16, bottom: 12 },
});
const historyStyles = StyleSheet.create({
  history: { height: 83, gap: 7 },
  title: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, marginLeft: 16 },
  list: { gap: 10, paddingRight: 16 },
  card: {
    width: 154,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.secondaryGroupedBackground,
    justifyContent: 'center',
  },
  label: { color: colors.label, fontSize: 15, lineHeight: 19, fontWeight: '600' },
  detail: { color: colors.secondaryLabel, fontSize: 12, lineHeight: 16, marginTop: 2 },
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
  scannerContent: { flex: 1 },
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
