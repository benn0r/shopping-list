import { PropsWithChildren, useCallback, useMemo, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionButton,
  ChevronIcon,
  colors,
  LargeTitle,
  ListRow,
  Notice,
  Section,
  Separator,
  sheetModal,
  ui,
} from '../components/ui';
import { useI18n } from '../i18n';
import {
  completeShoppingSession,
  createShoppingSession,
  deleteShoppingSession,
  loadActiveShoppingList,
  loadListViewMode,
  loadShoppingList,
  loadShoppingLists,
  loadShoppingSessions,
  loadStores,
  recordShoppingPurchase,
  restoreShoppingPurchase,
  removeShoppingListItem,
} from '../services/storage';
import { removeFromSyncedList, restoreToSyncedList } from '../services/shoppingListSync';
import { ShoppingListCard } from './ScannerScreen';
import type {
  ListViewMode,
  ShoppingListDefinition,
  ShoppingListItem,
  ShoppingSession,
  StoreDefinition,
} from '../types';

type PickerKind = 'store' | 'list' | null;
type ShoppingCandidate = ShoppingListItem & { sourceListId: string; sourceListName: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export const shoppingSessionListIds = (session: ShoppingSession) =>
  session.listIds?.length ? session.listIds : [session.listId];

export const shoppingSessionListNames = (session: ShoppingSession) =>
  session.listNames?.length ? session.listNames : [session.listName];

export const toggleShoppingListSelection = (selectedIds: string[], id: string) =>
  selectedIds.includes(id)
    ? selectedIds.filter((candidate) => candidate !== id)
    : [...selectedIds, id];

export function animateShoppingItemTransfer() {
  if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
  LayoutAnimation.configureNext({
    duration: 420,
    create: {
      type: LayoutAnimation.Types.spring,
      property: LayoutAnimation.Properties.scaleXY,
      springDamping: 0.72,
    },
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.78,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 180,
    },
  });
}

export function itemMatchesStore(item: ShoppingListItem, store: StoreDefinition) {
  if (!item.stores?.length) return true;
  const storeName = normalize(store.name);
  return item.stores.some((candidate) => {
    const knownStore = normalize(candidate).replace(/^en:/, '').replaceAll('-', ' ');
    return knownStore.includes(storeName) || storeName.includes(knownStore);
  });
}

export function ShoppingScreen() {
  const { language, t } = useI18n();
  const [stores, setStores] = useState<StoreDefinition[]>([]);
  const [lists, setLists] = useState<ShoppingListDefinition[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [items, setItems] = useState<ShoppingCandidate[]>([]);
  const [sessions, setSessions] = useState<ShoppingSession[]>([]);
  const [viewMode, setViewMode] = useState<ListViewMode>('list');
  const [active, setActive] = useState<ShoppingSession | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [details, setDetails] = useState<ShoppingSession | null>(null);
  const [busyBarcode, setBusyBarcode] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [storedStores, storedLists, storedSessions, currentList, storedViewMode] =
      await Promise.all([
        loadStores(),
        loadShoppingLists(),
        loadShoppingSessions(),
        loadActiveShoppingList(),
        loadListViewMode(),
      ]);
    const activeSession = storedSessions.find((session) => !session.completedAt) || null;
    setStores(storedStores);
    setLists(storedLists);
    setSessions(storedSessions);
    setViewMode(storedViewMode);
    setActive(activeSession);
    setSelectedStoreId((current) => current || storedStores[0]?.id || null);
    const sessionListIds = activeSession ? shoppingSessionListIds(activeSession) : [];
    setSelectedListIds((current) =>
      activeSession ? sessionListIds : current.length ? current : [currentList.id],
    );
    const itemLists = activeSession
      ? storedLists.filter((list) => sessionListIds.includes(list.id))
      : [currentList];
    setItems(
      (
        await Promise.all(
          itemLists.map(async (list) =>
            (await loadShoppingList(list.id)).map((item) => ({
              ...item,
              sourceListId: list.id,
              sourceListName: list.name,
            })),
          ),
        )
      ).flat(),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload().catch(() => setError(t('shoppingLoadFailed')));
    }, [reload, t]),
  );

  const selectedStore = stores.find((store) => store.id === selectedStoreId) || null;
  const selectedLists = lists.filter((list) => selectedListIds.includes(list.id));
  const activeStore = active ? { id: active.storeId, name: active.storeName } : selectedStore;
  const eligibleItems = activeStore
    ? items.filter((item) => itemMatchesStore(item, activeStore))
    : [];

  async function startShopping() {
    if (!selectedStore || !selectedLists.length) return;
    setError('');
    const session = await createShoppingSession(selectedStore, selectedLists);
    setActive(session);
    setSessions(await loadShoppingSessions());
    setItems(
      (
        await Promise.all(
          selectedLists.map(async (list) =>
            (await loadShoppingList(list.id)).map((item) => ({
              ...item,
              sourceListId: list.id,
              sourceListName: list.name,
            })),
          ),
        )
      ).flat(),
    );
  }

  async function purchase(item: ShoppingCandidate) {
    if (!active || busyBarcode) return;
    setBusyBarcode(item.barcode);
    setError('');
    try {
      const sourceList = lists.find((candidate) => candidate.id === item.sourceListId);
      const updated = await recordShoppingPurchase(active.id, item, undefined, sourceList);
      animateShoppingItemTransfer();
      setActive(updated);
      await removeShoppingListItem(item.barcode, item.sourceListId);
      setItems((current) =>
        current.filter(
          (candidate) =>
            candidate.barcode !== item.barcode || candidate.sourceListId !== item.sourceListId,
        ),
      );
      if (sourceList) await removeFromSyncedList(sourceList, item).catch(() => {});
      setSessions(await loadShoppingSessions());
    } catch {
      setError(t('purchaseFailed'));
    } finally {
      setBusyBarcode(null);
    }
  }

  async function finishShopping() {
    if (!active) return;
    await completeShoppingSession(active.id);
    setActive(null);
    setSessions(await loadShoppingSessions());
  }

  async function deleteHistorySession(sessionId: string) {
    setError('');
    try {
      animateShoppingItemTransfer();
      setSessions(await deleteShoppingSession(sessionId));
      if (details?.id === sessionId) setDetails(null);
    } catch {
      setError(t('shoppingLoadFailed'));
    }
  }

  async function restorePurchase(item: ShoppingListItem) {
    if (!active || busyBarcode) return;
    setBusyBarcode(item.barcode);
    setError('');
    try {
      const purchasedItem = item as ShoppingListItem & {
        sourceListId?: string;
        sourceListName?: string;
      };
      const sourceListId = purchasedItem.sourceListId || active.listId;
      const updated = await restoreShoppingPurchase(active.id, item.barcode, sourceListId);
      animateShoppingItemTransfer();
      setActive(updated);
      const list = lists.find((candidate) => candidate.id === sourceListId);
      const restoredItems = await loadShoppingList(sourceListId);
      setItems((current) => [
        ...current.filter(
          (candidate) =>
            candidate.barcode !== item.barcode || candidate.sourceListId !== sourceListId,
        ),
        ...restoredItems
          .filter((candidate) => candidate.barcode === item.barcode)
          .map((candidate) => ({
            ...candidate,
            sourceListId,
            sourceListName: list?.name || purchasedItem.sourceListName || active.listName,
          })),
      ]);
      const restoredItem = restoredItems.find((candidate) => candidate.barcode === item.barcode);
      if (list && restoredItem) {
        await restoreToSyncedList(list, {
          ...restoredItem,
          remoteItemId: item.remoteItemId,
          remoteSpecification: item.remoteSpecification,
        });
      }
      setSessions(await loadShoppingSessions());
    } catch {
      setError(t('restorePurchaseFailed'));
    } finally {
      setBusyBarcode(null);
    }
  }

  const formatDate = (value: number) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(value);

  return (
    <SafeAreaView edges={['top']} style={ui.safe}>
      <View style={ui.header}>
        <LargeTitle>{t('shopping')}</LargeTitle>
      </View>
      <ScrollView contentContainerStyle={ui.content} style={ui.screen}>
        {error ? <Notice>{error}</Notice> : null}
        {active ? (
          <>
            <View style={styles.activeHeader}>
              <Text style={styles.activeStore}>{active.storeName}</Text>
              <Text style={styles.activeMeta}>
                {shoppingSessionListNames(active).join(', ')} · {formatDate(active.startedAt)}
              </Text>
            </View>
            <View>
              {eligibleItems.length ? (
                <View style={[styles.shoppingItems, viewMode === 'tiles' && styles.shoppingTiles]}>
                  {eligibleItems.map((item) => (
                    <ShoppingListCard
                      key={item.barcode}
                      item={item}
                      viewMode={viewMode}
                      accessibilityLabel={t('markPurchased', { name: item.label })}
                      onPress={() => void purchase(item)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.empty}>{t('noItemsForStore')}</Text>
              )}
            </View>
            <View style={styles.purchasedSection}>
              <Text style={styles.collectionTitle}>{t('purchasedItems')}</Text>
              {active.purchasedItems.length ? (
                <View style={[styles.shoppingItems, viewMode === 'tiles' && styles.shoppingTiles]}>
                  {active.purchasedItems.map((item) => (
                    <ShoppingListCard
                      key={`${item.barcode}-${item.purchasedAt}`}
                      item={item}
                      viewMode={viewMode}
                      testIDPrefix="purchased-item"
                      accessibilityLabel={t('restorePurchased', { name: item.label })}
                      onPress={() => void restorePurchase(item)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.empty}>{t('noPurchasedItemsYet')}</Text>
              )}
            </View>
            <ActionButton title={t('finishShopping')} onPress={() => void finishShopping()} />
          </>
        ) : (
          <Section
            title={t('newShopping')}
            footer={!stores.length ? t('createStoreFirst') : t('shoppingSelectionFooter')}
          >
            <ListRow
              title={t('store')}
              detail={selectedStore?.name || t('chooseStore')}
              onPress={() => setPicker('store')}
              trailing={<ChevronIcon direction="down" color={colors.tint} />}
              testID="shopping-store-select"
            />
            <Separator />
            <ListRow
              title={t('shoppingLists')}
              detail={
                selectedLists.length
                  ? selectedLists.map((list) => list.name).join(', ')
                  : t('chooseList')
              }
              onPress={() => setPicker('list')}
              trailing={<ChevronIcon direction="down" color={colors.tint} />}
              testID="shopping-list-select"
            />
            <Separator />
            <ActionButton
              title={t('startShopping')}
              disabled={!selectedStore || !selectedLists.length}
              onPress={() => void startShopping()}
            />
          </Section>
        )}
        <Section title={t('shoppingHistory')}>
          {sessions.filter((session) => session.completedAt).length ? (
            sessions
              .filter((session) => session.completedAt)
              .map((session, index) => (
                <View key={session.id}>
                  {index ? <Separator /> : null}
                  <SwipeToDelete
                    deleteLabel={t('delete')}
                    onDelete={() => void deleteHistorySession(session.id)}
                    testID={`delete-shopping-${session.id}`}
                  >
                    <ListRow
                      title={session.storeName}
                      detail={`${formatDate(session.completedAt || session.startedAt)} · ${t('itemCount', { count: String(session.purchasedItems.length) })}`}
                      onPress={() => setDetails(session)}
                      trailing={<ChevronIcon color={colors.tint} />}
                      testID={`shopping-history-${session.id}`}
                    />
                  </SwipeToDelete>
                </View>
              ))
          ) : (
            <Text style={styles.empty}>{t('noShoppingHistory')}</Text>
          )}
        </Section>
      </ScrollView>
      <PickerSheet
        kind={picker}
        lists={lists}
        stores={stores}
        selectedIds={
          picker === 'store' ? (selectedStoreId ? [selectedStoreId] : []) : selectedListIds
        }
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (picker === 'store') {
            setSelectedStoreId(id);
            setPicker(null);
          } else {
            setSelectedListIds((current) => toggleShoppingListSelection(current, id));
          }
        }}
        t={t}
      />
      <Modal
        visible={Boolean(details)}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setDetails(null)}
        testID="shopping-detail-modal"
      >
        <View style={sheetModal.backdrop}>
          <SafeAreaView edges={['bottom']} style={[sheetModal.sheet, styles.detailSheet]}>
            <SheetHeader
              title={details?.storeName || ''}
              onClose={() => setDetails(null)}
              closeLabel={t('done')}
            />
            <ScrollView contentContainerStyle={styles.detailContent}>
              {details ? (
                <Text style={styles.detailMeta}>
                  {shoppingSessionListNames(details).join(', ')} ·{' '}
                  {formatDate(details.completedAt || details.startedAt)}
                </Text>
              ) : null}
              <Section title={t('purchasedItems')}>
                {details?.purchasedItems.length ? (
                  details.purchasedItems.map((item, index) => (
                    <View key={`${item.barcode}-${item.purchasedAt}`}>
                      {index ? <Separator /> : null}
                      <ListRow
                        title={item.label}
                        detail={`${item.quantity !== undefined ? `${item.quantity}${item.unit ? ` ${item.unit}` : '×'} · ` : ''}${formatDate(item.purchasedAt)}`}
                      />
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>{t('noPurchasedItems')}</Text>
                )}
              </Section>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const SWIPE_ACTION_WIDTH = 88;

export function shouldCaptureHistorySwipe(dx: number, dy: number) {
  return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
}

export function historySwipeOffset(open: boolean, dx: number) {
  const origin = open ? -SWIPE_ACTION_WIDTH : 0;
  return Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, origin + dx));
}

export function shouldOpenHistorySwipe(open: boolean, dx: number, velocityX: number) {
  if (velocityX < -0.35) return true;
  if (velocityX > 0.35) return false;
  return open ? dx < 30 : dx < -36;
}

function SwipeToDelete({
  children,
  deleteLabel,
  onDelete,
  testID,
}: PropsWithChildren<{ deleteLabel: string; onDelete: () => void; testID: string }>) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);
  const settle = useCallback(
    (shouldOpen: boolean) => {
      setOpen(shouldOpen);
      Animated.spring(translateX, {
        toValue: shouldOpen ? -SWIPE_ACTION_WIDTH : 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 240,
        mass: 0.8,
      }).start();
    },
    [translateX],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          shouldCaptureHistorySwipe(gesture.dx, gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          translateX.setValue(historySwipeOffset(open, gesture.dx));
        },
        onPanResponderRelease: (_event, gesture) =>
          settle(shouldOpenHistorySwipe(open, gesture.dx, gesture.vx)),
        onPanResponderTerminate: () => settle(open),
      }),
    [open, settle, translateX],
  );

  return (
    <View style={styles.swipeRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
        onPress={onDelete}
        style={styles.swipeDelete}
        testID={testID}
      >
        <Text style={styles.swipeDeleteText}>{deleteLabel}</Text>
      </Pressable>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.swipeContent, { transform: [{ translateX }] }]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

function SheetHeader({
  title,
  onClose,
  closeLabel,
}: {
  title: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <View style={styles.sheetHeader}>
      <View style={styles.headerSpacer} />
      <Text accessibilityRole="header" style={styles.sheetTitle}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={styles.headerButton}
      >
        <Text style={styles.headerButtonText}>{closeLabel}</Text>
      </Pressable>
    </View>
  );
}

function PickerSheet({
  kind,
  stores,
  lists,
  selectedIds,
  onClose,
  onSelect,
  t,
}: {
  kind: PickerKind;
  stores: StoreDefinition[];
  lists: ShoppingListDefinition[];
  selectedIds: string[];
  onClose: () => void;
  onSelect: (id: string) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const options = kind === 'store' ? stores : lists;
  return (
    <Modal
      visible={Boolean(kind)}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      testID="shopping-picker-modal"
    >
      <View style={sheetModal.backdrop}>
        <SafeAreaView edges={['bottom']} style={[sheetModal.sheet, styles.pickerSheet]}>
          <SheetHeader
            title={t(kind === 'store' ? 'chooseStore' : 'chooseList')}
            onClose={onClose}
            closeLabel={t(kind === 'list' ? 'done' : 'cancel')}
          />
          <ScrollView contentContainerStyle={styles.detailContent}>
            <Section>
              {options.map((option, index) => (
                <View key={option.id}>
                  {index ? <Separator /> : null}
                  <ListRow
                    title={option.name}
                    selected={selectedIds.includes(option.id)}
                    onPress={() => onSelect(option.id)}
                    testID={`shopping-option-${option.id}`}
                  />
                </View>
              ))}
            </Section>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  activeHeader: { paddingHorizontal: 4, gap: 3 },
  activeStore: { color: colors.label, fontSize: 22, lineHeight: 27, fontWeight: '700' },
  activeMeta: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 },
  purchasedSection: { gap: 9, marginTop: 6 },
  collectionTitle: { color: colors.label, fontSize: 20, lineHeight: 25, fontWeight: '700' },
  empty: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 21,
    padding: 16,
    textAlign: 'center',
  },
  shoppingItems: { gap: 12 },
  shoppingTiles: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  swipeRow: { overflow: 'hidden', position: 'relative' },
  swipeContent: { backgroundColor: colors.secondaryGroupedBackground },
  swipeDelete: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive,
  },
  swipeDeleteText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pickerSheet: { height: '52%', minHeight: '52%' },
  detailSheet: { height: '72%', minHeight: '72%' },
  detailContent: { padding: 16, paddingBottom: 32 },
  detailMeta: { color: colors.secondaryLabel, fontSize: 14, textAlign: 'center', marginBottom: 14 },
  sheetHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.bar,
  },
  sheetTitle: {
    flex: 1,
    color: colors.label,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: { width: 80 },
  headerButton: {
    width: 80,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  headerButtonText: { color: colors.tint, fontSize: 17, fontWeight: '600' },
});
