export type BringList = { listUuid: string; name: string };
export type Credentials = { email: string; password: string };
export type CustomBarcode = { barcode: string; label: string };
export type ProductLanguage = 'auto' | 'de' | 'en' | 'fr' | 'it';
export type LabelStyle = 'generic' | 'exact' | 'ask';
export type LookupPreferences = { language: ProductLanguage; labelStyle: LabelStyle };
export type AppLanguage = 'en' | 'de' | 'fr' | 'it' | 'pt' | 'pt-BR';
export type ListViewMode = 'list' | 'tiles';
export type SyncProviderId = 'bring' | 'mealie';
export type MealieConfig = { baseUrl: string; token: string };
export type ProviderList = { id: string; name: string };
export type SyncTarget = {
  provider: SyncProviderId;
  remoteListId: string;
  remoteListName: string;
};
export type ShoppingListDefinition = { id: string; name: string; syncTarget?: SyncTarget };
export type StoreDefinition = { id: string; name: string };
export type Product = {
  barcode: string;
  label: string;
  exactLabel: string;
  genericLabel?: string;
  brand?: string;
  imageUrl?: string;
  source: 'custom' | 'open-products-family';
  productType?: 'food' | 'beauty' | 'petfood' | 'product';
  stores?: string[];
};
export type ScanHistoryItem = { barcode: string; label: string; brand?: string; scannedAt: number };
export type ShoppingListItem = ScanHistoryItem & {
  quantity?: number;
  unit?: string;
  imageUrl?: string;
  remoteItemId?: string;
  remoteSpecification?: string;
  metadataResolved?: boolean;
  source?: Product['source'];
  productType?: Product['productType'];
  stores?: string[];
};
export type PurchasedShoppingItem = ShoppingListItem & {
  purchasedAt: number;
  sourceListId?: string;
  sourceListName?: string;
};
export type ShoppingSession = {
  id: string;
  storeId: string;
  storeName: string;
  listId: string;
  listName: string;
  listIds?: string[];
  listNames?: string[];
  startedAt: number;
  completedAt?: number;
  purchasedItems: PurchasedShoppingItem[];
};
export type BringItem = { uuid: string; label: string; specification?: string; barcode?: string };
export type RemoteShoppingListItem = {
  id: string;
  label: string;
  quantity?: number;
  unit?: string;
  specification?: string;
  barcode?: string;
};
