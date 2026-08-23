import type {
  MealieConfig,
  ProviderList,
  RemoteShoppingListItem,
  ShoppingListItem,
} from '../types';

type MealieItem = {
  id: string;
  shoppingListId: string;
  checked: boolean;
  note?: string | null;
  display?: string | null;
  food?: { name?: string | null } | null;
  quantity?: number;
  unit?: {
    name?: string | null;
    pluralName?: string | null;
    abbreviation?: string | null;
    pluralAbbreviation?: string | null;
    useAbbreviation?: boolean;
  } | null;
  extras?: Record<string, unknown>;
  [key: string]: unknown;
};

function mealieUnit(item: MealieItem) {
  const unit = item.unit;
  if (!unit) return undefined;
  const plural = item.quantity !== 1;
  if (unit.useAbbreviation) {
    return (
      (plural ? unit.pluralAbbreviation : unit.abbreviation) ||
      unit.abbreviation ||
      unit.name ||
      undefined
    );
  }
  return (plural ? unit.pluralName : unit.name) || unit.name || unit.abbreviation || undefined;
}

function baseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

async function request(config: MealieConfig, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl(config.baseUrl)}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.token.trim()}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`Mealie request failed (${response.status}).`);
  if (response.status === 204) return null;
  return response.json();
}

function collection<T>(body: { items?: T[] } | T[]): T[] {
  return Array.isArray(body) ? body : body.items || [];
}

export async function loadMealieLists(config: MealieConfig): Promise<ProviderList[]> {
  const body = await request(config, '/api/households/shopping/lists?perPage=-1');
  return collection<{ id: string; name?: string }>(body).map((list) => ({
    id: list.id,
    name: list.name || 'Shopping list',
  }));
}

async function loadRawItems(config: MealieConfig, listId: string): Promise<MealieItem[]> {
  const query = encodeURIComponent(`shoppingListId=${listId}`);
  const body = await request(
    config,
    `/api/households/shopping/items?queryFilter=${query}&orderBy=position&orderDirection=asc&perPage=-1`,
  );
  return collection<MealieItem>(body).filter((item) => item.shoppingListId === listId);
}

export async function loadMealieItems(
  config: MealieConfig,
  listId: string,
): Promise<RemoteShoppingListItem[]> {
  return (await loadRawItems(config, listId))
    .filter((item) => !item.checked)
    .map((item) => ({
      id: item.id,
      label: item.food?.name || item.note || item.display || 'Item',
      ...(typeof item.quantity === 'number' ? { quantity: item.quantity } : {}),
      ...(mealieUnit(item) ? { unit: mealieUnit(item) } : {}),
      ...(typeof item.extras?.barcode === 'string' ? { barcode: item.extras.barcode } : {}),
      ...(item.display ? { specification: item.display } : {}),
    }));
}

export async function addMealieItem(config: MealieConfig, listId: string, item: ShoppingListItem) {
  await request(config, '/api/households/shopping/items', {
    method: 'POST',
    body: JSON.stringify({
      shoppingListId: listId,
      checked: false,
      note: item.label,
      quantity: item.quantity || 1,
      extras: item.barcode && /^\d{8,14}$/.test(item.barcode) ? { barcode: item.barcode } : {},
    }),
  });
}

async function setChecked(config: MealieConfig, itemId: string, checked: boolean) {
  const item = (await request(
    config,
    `/api/households/shopping/items/${encodeURIComponent(itemId)}`,
  )) as MealieItem;
  await request(config, `/api/households/shopping/items/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...item, checked }),
  });
}

export async function checkMealieItem(config: MealieConfig, itemId: string) {
  await setChecked(config, itemId, true);
}

export async function restoreMealieItem(
  config: MealieConfig,
  listId: string,
  item: ShoppingListItem,
) {
  if (item.remoteItemId) return setChecked(config, item.remoteItemId, false);
  const checked = (await loadRawItems(config, listId)).find(
    (candidate) =>
      candidate.checked &&
      (candidate.note || candidate.display || '').trim().toLocaleLowerCase() ===
        item.label.trim().toLocaleLowerCase(),
  );
  if (checked) return setChecked(config, checked.id, false);
  await addMealieItem(config, listId, item);
}
