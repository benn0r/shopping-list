import {
  addMealieItem,
  checkMealieItem,
  loadMealieItems,
  loadMealieLists,
  restoreMealieItem,
} from '../../src/services/mealieApi';

const config = { baseUrl: 'https://mealie.example.test/', token: 'secret-token' };
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

afterEach(() => jest.restoreAllMocks());

it('loads Mealie lists and active items with bearer authentication', async () => {
  const fetchSpy = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(response({ items: [{ id: 'list-1', name: 'Groceries' }] }))
    .mockResolvedValueOnce(
      response({
        items: [
          {
            id: 'one',
            shoppingListId: 'list-1',
            note: 'cold',
            display: '2 Milk',
            food: { name: 'Milk' },
            quantity: 2,
            unit: {
              name: 'carton',
              pluralName: 'cartons',
              abbreviation: 'ctn',
              useAbbreviation: false,
            },
            extras: { barcode: '7612345678901' },
            checked: false,
          },
          { id: 'two', shoppingListId: 'list-1', display: 'Bread', checked: true },
        ],
      }),
    );

  await expect(loadMealieLists(config)).resolves.toEqual([{ id: 'list-1', name: 'Groceries' }]);
  await expect(loadMealieItems(config, 'list-1')).resolves.toEqual([
    {
      id: 'one',
      label: 'Milk',
      barcode: '7612345678901',
      quantity: 2,
      unit: 'cartons',
      specification: '2 Milk',
    },
  ]);
  expect(fetchSpy.mock.calls[0][1]).toMatchObject({
    headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
  });
});

it('adds note-only items and preserves a barcode in Mealie extras', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response({}, 201));
  await addMealieItem(config, 'list-1', {
    barcode: '7612345678901',
    label: 'Milk',
    quantity: 2,
    scannedAt: 1,
  });
  expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toEqual({
    shoppingListId: 'list-1',
    checked: false,
    note: 'Milk',
    quantity: 2,
    extras: { barcode: '7612345678901' },
  });
});

it('checks and restores an existing Mealie item by round-tripping its full payload', async () => {
  const raw = {
    id: 'item-1',
    shoppingListId: 'list-1',
    note: 'Milk',
    checked: false,
    extras: { source: 'recipe' },
  };
  const fetchSpy = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(response(raw))
    .mockResolvedValueOnce(response({}))
    .mockResolvedValueOnce(response({ ...raw, checked: true }))
    .mockResolvedValueOnce(response({}));

  await checkMealieItem(config, 'item-1');
  await restoreMealieItem(config, 'list-1', {
    barcode: 'manual:milk',
    label: 'Milk',
    scannedAt: 1,
    remoteItemId: 'item-1',
  });

  expect(JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body))).toMatchObject({
    id: 'item-1',
    checked: true,
    extras: { source: 'recipe' },
  });
  expect(JSON.parse(String((fetchSpy.mock.calls[3][1] as RequestInit).body))).toMatchObject({
    id: 'item-1',
    checked: false,
  });
});

it('reports failed Mealie requests', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(response({}, 401));
  await expect(loadMealieLists(config)).rejects.toThrow('Mealie request failed (401)');
});

it('restores a checked Mealie item by label when no remote ID is available', async () => {
  const raw = { id: 'item-2', shoppingListId: 'list-1', note: 'Bread', checked: true };
  const fetchSpy = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(response({ items: [raw] }))
    .mockResolvedValueOnce(response(raw))
    .mockResolvedValueOnce(response({}));

  await restoreMealieItem(config, 'list-1', {
    barcode: 'manual:bread',
    label: ' bread ',
    scannedAt: 1,
  });

  expect(fetchSpy.mock.calls[1][0]).toContain('/items/item-2');
  expect(JSON.parse(String((fetchSpy.mock.calls[2][1] as RequestInit).body))).toMatchObject({
    checked: false,
  });
});

it('creates a new item when a checked Mealie match no longer exists', async () => {
  const fetchSpy = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response(null, 204));

  await restoreMealieItem(config, 'list-1', {
    barcode: 'manual:eggs',
    label: 'Eggs',
    scannedAt: 1,
  });

  expect(fetchSpy.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  expect(JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body))).toMatchObject({
    note: 'Eggs',
    quantity: 1,
    extras: {},
  });
});

it('normalizes alternate and incomplete Mealie collection fields', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(response([{ id: 'unnamed' }]))
    .mockResolvedValueOnce(
      response({
        items: [
          { id: 'display', shoppingListId: 'list-1', display: 'Bread', checked: false },
          { id: 'fallback', shoppingListId: 'list-1', checked: false, extras: { barcode: 123 } },
          { id: 'other', shoppingListId: 'other-list', note: 'Ignore', checked: false },
        ],
      }),
    );
  await expect(loadMealieLists(config)).resolves.toEqual([
    { id: 'unnamed', name: 'Shopping list' },
  ]);
  await expect(loadMealieItems(config, 'list-1')).resolves.toEqual([
    { id: 'display', label: 'Bread', specification: 'Bread' },
    { id: 'fallback', label: 'Item' },
  ]);
});

it('formats singular, plural, and abbreviated Mealie units', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    response([
      {
        id: 'singular',
        shoppingListId: 'list-1',
        note: 'Flour',
        checked: false,
        quantity: 1,
        unit: { name: 'bag', pluralName: 'bags', abbreviation: 'bg' },
      },
      {
        id: 'abbreviated',
        shoppingListId: 'list-1',
        note: 'Milk',
        checked: false,
        quantity: 2,
        unit: {
          name: 'liter',
          abbreviation: 'L',
          pluralAbbreviation: 'L',
          useAbbreviation: true,
        },
      },
      {
        id: 'fallback',
        shoppingListId: 'list-1',
        note: 'Eggs',
        checked: false,
        quantity: 6,
        unit: { abbreviation: 'pc' },
      },
      {
        id: 'singular-abbreviation',
        shoppingListId: 'list-1',
        note: 'Juice',
        checked: false,
        quantity: 1,
        unit: { name: 'bottle', abbreviation: 'btl', useAbbreviation: true },
      },
      {
        id: 'plural-name-fallback',
        shoppingListId: 'list-1',
        note: 'Rice',
        checked: false,
        quantity: 2,
        unit: { name: 'bag' },
      },
      {
        id: 'abbreviation-fallback',
        shoppingListId: 'list-1',
        note: 'Water',
        checked: false,
        quantity: 2,
        unit: { name: 'bottle', abbreviation: 'btl', useAbbreviation: true },
      },
      {
        id: 'abbreviation-name-fallback',
        shoppingListId: 'list-1',
        note: 'Coffee',
        checked: false,
        quantity: 2,
        unit: { name: 'pack', useAbbreviation: true },
      },
      {
        id: 'empty-abbreviation',
        shoppingListId: 'list-1',
        note: 'Unknown unit',
        checked: false,
        quantity: 2,
        unit: { useAbbreviation: true },
      },
      {
        id: 'empty-name',
        shoppingListId: 'list-1',
        note: 'Another unknown unit',
        checked: false,
        quantity: 2,
        unit: {},
      },
    ]),
  );

  await expect(loadMealieItems(config, 'list-1')).resolves.toEqual([
    expect.objectContaining({ id: 'singular', quantity: 1, unit: 'bag' }),
    expect.objectContaining({ id: 'abbreviated', quantity: 2, unit: 'L' }),
    expect.objectContaining({ id: 'fallback', quantity: 6, unit: 'pc' }),
    expect.objectContaining({ id: 'singular-abbreviation', quantity: 1, unit: 'btl' }),
    expect.objectContaining({ id: 'plural-name-fallback', quantity: 2, unit: 'bag' }),
    expect.objectContaining({ id: 'abbreviation-fallback', quantity: 2, unit: 'btl' }),
    expect.objectContaining({ id: 'abbreviation-name-fallback', quantity: 2, unit: 'pack' }),
    expect.objectContaining({ id: 'empty-abbreviation', quantity: 2 }),
    expect.objectContaining({ id: 'empty-name', quantity: 2 }),
  ]);
});

it('accepts an empty paginated Mealie response', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(response({}));
  await expect(loadMealieLists(config)).resolves.toEqual([]);
});
