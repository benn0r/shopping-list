import type {
  RemoteShoppingListItem,
  ShoppingListItem,
  SyncProviderId,
  SyncTarget,
} from '../../types';

export interface ShoppingListSyncAdapter {
  readonly provider: SyncProviderId;
  isEnabled(): Promise<boolean>;
  isAuthenticated(): Promise<boolean>;
  loadItems(target: SyncTarget): Promise<RemoteShoppingListItem[]>;
  addItem(target: SyncTarget, item: ShoppingListItem): Promise<void>;
  restoreItem?(target: SyncTarget, item: ShoppingListItem): Promise<void>;
  removeItem(target: SyncTarget, item: RemoteShoppingListItem): Promise<void>;
}
