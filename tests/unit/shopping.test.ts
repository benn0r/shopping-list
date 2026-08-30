import { LayoutAnimation } from 'react-native';
import {
  animateShoppingItemTransfer,
  historySwipeOffset,
  itemMatchesStore,
  nativeCollectionHeight,
  shoppingSessionListIds,
  shoppingSessionListNames,
  shouldCaptureHistorySwipe,
  shouldOpenHistorySwipe,
  toggleShoppingListSelection,
} from '../../src/screens/ShoppingScreen';

const item = (stores?: string[]) => ({
  barcode: '7611111111111',
  label: 'Milk',
  scannedAt: 1,
  stores,
});

it('normalizes legacy and multi-list sessions and toggles list selections', () => {
  const legacy = {
    id: 'legacy',
    storeId: 'store',
    storeName: 'Store',
    listId: 'groceries',
    listName: 'Groceries',
    startedAt: 1,
    purchasedItems: [],
  };
  expect(shoppingSessionListIds(legacy)).toEqual(['groceries']);
  expect(shoppingSessionListNames(legacy)).toEqual(['Groceries']);
  expect(shoppingSessionListIds({ ...legacy, listIds: ['groceries', 'errands'] })).toEqual([
    'groceries',
    'errands',
  ]);
  expect(shoppingSessionListNames({ ...legacy, listNames: ['Groceries', 'Errands'] })).toEqual([
    'Groceries',
    'Errands',
  ]);
  expect(toggleShoppingListSelection(['groceries'], 'errands')).toEqual(['groceries', 'errands']);
  expect(toggleShoppingListSelection(['groceries', 'errands'], 'groceries')).toEqual(['errands']);
});

it('decides when shopping-history rows reveal or close their delete action', () => {
  expect(shouldCaptureHistorySwipe(-20, 2)).toBe(true);
  expect(shouldCaptureHistorySwipe(-5, 2)).toBe(false);
  expect(shouldCaptureHistorySwipe(-20, 30)).toBe(false);
  expect(historySwipeOffset(false, -200)).toBe(-88);
  expect(historySwipeOffset(false, 20)).toBe(0);
  expect(historySwipeOffset(true, 20)).toBe(-68);
  expect(shouldOpenHistorySwipe(false, 0, -0.5)).toBe(true);
  expect(shouldOpenHistorySwipe(true, 0, 0.5)).toBe(false);
  expect(shouldOpenHistorySwipe(false, -40, 0)).toBe(true);
  expect(shouldOpenHistorySwipe(false, -20, 0)).toBe(false);
  expect(shouldOpenHistorySwipe(true, 20, 0)).toBe(true);
  expect(shouldOpenHistorySwipe(true, 40, 0)).toBe(false);
});

it('sizes native list and three-column tile collections consistently', () => {
  expect(nativeCollectionHeight(3, 'list')).toBe(192);
  expect(nativeCollectionHeight(1, 'tiles')).toBe(148);
  expect(nativeCollectionHeight(4, 'tiles')).toBe(272);
});
const store = { id: 'migros', name: 'Migros' };

it('includes unknown-store products and matches normalized store metadata', () => {
  expect(itemMatchesStore(item(), store)).toBe(true);
  expect(itemMatchesStore(item([]), store)).toBe(true);
  expect(itemMatchesStore(item(['Migros Supermarket']), store)).toBe(true);
  expect(itemMatchesStore(item(['en:migros-market']), store)).toBe(true);
  expect(itemMatchesStore(item(['Coop']), store)).toBe(false);
});

it('animates transfers with spring movement and a fading departure', () => {
  const configure = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});

  animateShoppingItemTransfer();

  expect(configure).toHaveBeenCalledWith(
    expect.objectContaining({
      duration: 420,
      create: expect.objectContaining({ property: LayoutAnimation.Properties.scaleXY }),
      update: expect.objectContaining({ type: LayoutAnimation.Types.spring }),
      delete: expect.objectContaining({ property: LayoutAnimation.Properties.opacity }),
    }),
  );
});
