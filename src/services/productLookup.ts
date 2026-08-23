import { Platform } from 'react-native';
import { CustomBarcode, LookupPreferences, Product, ProductLanguage } from '../types';

type OpenProduct = Record<string, unknown> & {
  product_name?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  image_front_small_url?: string;
  product_type?: Product['productType'];
  stores?: string;
  stores_tags?: string[];
};

const SUPPORTED_LANGUAGES = ['de', 'en', 'fr', 'it'] as const;
const LOCALIZED_FIELDS = SUPPORTED_LANGUAGES.flatMap((language) => [
  `product_name_${language}`,
  `generic_name_${language}`,
]);

export function normalizeBarcode(value: string) {
  return value.replace(/\D/g, '');
}

export function deviceLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-CH';
  } catch {
    return 'en-CH';
  }
}

export function resolveLanguage(preference: ProductLanguage, locale = deviceLocale()) {
  if (preference !== 'auto') return preference;
  const language = locale.split(/[-_]/)[0].toLowerCase();
  return SUPPORTED_LANGUAGES.includes(language as (typeof SUPPORTED_LANGUAGES)[number])
    ? language
    : 'en';
}

export function resolveCountry(locale = deviceLocale()) {
  const region = locale.split(/[-_]/)[1];
  return region && /^[a-z]{2}$/i.test(region) ? region.toLowerCase() : 'ch';
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function localizedField(
  product: OpenProduct,
  field: 'product_name' | 'generic_name',
  language: string,
) {
  const preferred = text(product[`${field}_${language}`]);
  const english = text(product[`${field}_en`]);
  const original = text(product[field]);
  const anyLocalized = SUPPORTED_LANGUAGES.map((candidate) =>
    text(product[`${field}_${candidate}`]),
  ).find(Boolean);
  return preferred || english || original || anyLocalized;
}

export function productLabel(
  exactLabel: string,
  genericLabel: string | undefined,
  style: LookupPreferences['labelStyle'],
) {
  return style === 'generic' && genericLabel ? genericLabel : exactLabel;
}

export async function lookupProduct(
  barcodeValue: string,
  customBarcodes: CustomBarcode[],
  preferences: LookupPreferences = { language: 'auto', labelStyle: 'generic' },
): Promise<Product | null> {
  const barcode = normalizeBarcode(barcodeValue);
  if (!/^\d{8,14}$/.test(barcode))
    throw new Error('This does not look like a valid EAN or UPC barcode.');
  const custom = customBarcodes.find((item) => normalizeBarcode(item.barcode) === barcode);
  if (custom)
    return {
      barcode,
      label: custom.label,
      exactLabel: custom.label,
      genericLabel: custom.label,
      source: 'custom',
    };

  const locale = deviceLocale();
  const language = resolveLanguage(preferences.language, locale);
  const fields = [
    'code',
    'product_name',
    'generic_name',
    'brands',
    'quantity',
    'image_front_small_url',
    'product_type',
    'stores',
    'stores_tags',
    ...LOCALIZED_FIELDS,
  ].join(',');
  const query = new URLSearchParams({
    product_type: 'all',
    lc: language,
    cc: resolveCountry(locale),
    tags_lc: language,
    fields,
  });
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v3/product/${barcode}?${query}`,
    Platform.OS === 'web'
      ? undefined
      : { headers: { 'User-Agent': 'ShoppingList/1.0 (mobile app)' } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('The product lookup service is unavailable. Please try again.');
  const data = await response.json();
  const product = data.product as OpenProduct | undefined;
  if (!product) return null;
  const exactName = localizedField(product, 'product_name', language);
  if (!exactName) return null;
  const genericName = localizedField(product, 'generic_name', language);
  const quantity = text(product.quantity);
  const exactLabel =
    quantity && !exactName.toLowerCase().includes(quantity.toLowerCase())
      ? `${exactName}, ${quantity}`
      : exactName;
  return {
    barcode,
    label: productLabel(exactLabel, genericName, preferences.labelStyle),
    exactLabel,
    genericLabel: genericName,
    brand: text(product.brands),
    imageUrl: text(product.image_front_small_url),
    source: 'open-products-family',
    productType: product.product_type,
    stores: [
      ...(Array.isArray(product.stores_tags) ? product.stores_tags : []),
      ...(text(product.stores)?.split(',') || []),
    ]
      .map((store) => store.trim())
      .filter((store, index, values) => store && values.indexOf(store) === index),
  };
}
