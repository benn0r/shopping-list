import { BringItem, BringList, Credentials } from '../types';

type ListsResponse = {
  lists?: { listUuid: string; name?: string }[];
};

export function createLoginBody(credentials: Credentials) {
  return new URLSearchParams({
    email: credentials.email.trim(),
    password: credentials.password,
  });
}

export function normalizeLists(body: ListsResponse): BringList[] {
  return (body.lists || []).map((list) => ({
    listUuid: list.listUuid,
    name: list.name || 'Shopping list',
  }));
}

export function barcodeFromBringSpecification(specification?: string) {
  return specification?.match(/(?:^|\s)EAN:(\d{8,14})(?:$|\s)/i)?.[1];
}

export function createItemBody(label: string, quantity?: number, barcode?: string) {
  const validBarcode = barcode?.match(/^\d{8,14}$/)?.[0];
  const specification = [quantity ? `${quantity}×` : '', validBarcode ? `EAN:${validBarcode}` : '']
    .filter(Boolean)
    .join(' · ');
  return new URLSearchParams({
    purchase: label,
    recently: '',
    specification,
    remove: '',
    sender: 'null',
  });
}

type RawBringItem = {
  uuid?: string;
  itemId?: string;
  name?: string;
  specification?: string;
  spec?: string;
};

export function normalizeItems(body: {
  items?: { purchase?: RawBringItem[] };
  purchase?: RawBringItem[];
}): BringItem[] {
  return (body.items?.purchase || body.purchase || [])
    .filter((item) => item.uuid && (item.itemId || item.name))
    .map((item) => {
      const specification = item.specification || item.spec || undefined;
      return {
        uuid: item.uuid!,
        label: item.itemId || item.name!,
        specification,
        ...(barcodeFromBringSpecification(specification)
          ? { barcode: barcodeFromBringSpecification(specification) }
          : {}),
      };
    });
}

export function createRemoveBody(item: BringItem) {
  return {
    changes: [
      {
        itemId: item.label,
        uuid: item.uuid,
        spec: item.specification || '',
        operation: 'TO_RECENTLY',
        accuracy: '0.0',
        altitude: '0.0',
        latitude: '0.0',
        longitude: '0.0',
      },
    ],
    sender: '',
  };
}
