export type BringList = { listUuid: string; name: string };
export type Credentials = { email: string; password: string };
export type CustomBarcode = { barcode: string; label: string };
export type ProductLanguage = 'auto' | 'de' | 'en' | 'fr' | 'it';
export type LabelStyle = 'generic' | 'exact' | 'ask';
export type LookupPreferences = { language: ProductLanguage; labelStyle: LabelStyle };
export type AppLanguage = 'en' | 'de' | 'fr' | 'it' | 'pt' | 'pt-BR';
export type Product = {
  barcode: string;
  label: string;
  exactLabel: string;
  genericLabel?: string;
  brand?: string;
  imageUrl?: string;
  source: 'custom' | 'open-products-family';
  productType?: 'food' | 'beauty' | 'petfood' | 'product';
};
export type ScanHistoryItem = { barcode: string; label: string; brand?: string; scannedAt: number };
export type ShoppingListItem = ScanHistoryItem & { quantity?: number };
