import type { SyncProviderId } from '../../types';
import { bringSyncAdapter } from './bringSyncAdapter';
import { mealieSyncAdapter } from './mealieSyncAdapter';
import type { ShoppingListSyncAdapter } from './syncAdapter';

const adapters: Record<SyncProviderId, ShoppingListSyncAdapter> = {
  bring: bringSyncAdapter,
  mealie: mealieSyncAdapter,
};

export function getSyncAdapter(provider: SyncProviderId): ShoppingListSyncAdapter {
  return adapters[provider];
}

export function getSyncAdapters(): ShoppingListSyncAdapter[] {
  return Object.values(adapters);
}
