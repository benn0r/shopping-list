import {
  addItem,
  loadItems,
  loadLists,
  login,
  removeItem,
  restoreItem,
} from '../../src/services/bringApi';

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe('Bring adapter', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_BRING_API_KEY = 'test-only-key';
  });

  afterEach(() => jest.restoreAllMocks());

  it('trims the email and returns the authenticated session', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response({ uuid: 'user-id', access_token: 'token' }));

    await expect(login({ email: '  pilot@example.com ', password: 'secret' })).resolves.toEqual({
      userUuid: 'user-id',
      token: 'token',
    });
    expect(String((fetchSpy.mock.calls[0][1] as RequestInit).body)).toBe(
      'email=pilot%40example.com&password=secret',
    );
  });

  it('uses the public user ID and token type returned by modern Bring sessions', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response({
          uuid: 'user-id',
          publicUuid: 'public-user-id',
          access_token: 'token',
          token_type: 'CustomBearer',
        }),
      )
      .mockResolvedValueOnce(response({ items: { purchase: [] } }));

    await loadItems({ email: 'pilot@example.com', password: 'secret' }, 'list');

    expect(fetchSpy.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({
        'X-BRING-PUBLIC-USER-UUID': 'public-user-id',
        'X-BRING-APPLICATION': 'bring',
        'X-BRING-CLIENT': 'android',
        Authorization: 'CustomBearer token',
      }),
    });
  });

  it.each([
    ['HTTP failure', response({ message: 'Invalid credentials' }, false), 'Invalid credentials'],
    ['body error', response({ error: true, message: 'Account blocked' }), 'Account blocked'],
    ['body error without a message', response({ error: true }), 'Bring sign-in failed'],
    ['missing user ID', response({ access_token: 'token' }), 'incomplete sign-in'],
    ['missing token', response({ uuid: 'user-id' }), 'incomplete sign-in'],
    [
      'invalid JSON',
      {
        ok: true,
        json: async () => Promise.reject(new SyntaxError('invalid JSON')),
      } as unknown as Response,
      'incomplete sign-in',
    ],
  ])('rejects a %s during sign-in', async (_case, result, message) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(result);

    await expect(login({ email: 'pilot@example.com', password: 'secret' })).rejects.toThrow(
      message,
    );
  });

  it('propagates a network error during sign-in', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(login({ email: 'pilot@example.com', password: 'secret' })).rejects.toThrow(
      'offline',
    );
  });

  it('logs in, sends the required headers, and maps shopping lists', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(
        response({
          lists: [{ listUuid: 'list-id', name: 'Moon Base' }, { listUuid: 'unnamed-list' }],
        }),
      );

    await expect(loadLists({ email: 'pilot@example.com', password: 'secret' })).resolves.toEqual([
      { listUuid: 'list-id', name: 'Moon Base' },
      { listUuid: 'unnamed-list', name: 'Shopping list' },
    ]);
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({
        'X-BRING-API-KEY': 'test-only-key',
        'X-BRING-USER-UUID': 'user-id',
        Authorization: 'Bearer token',
      }),
    });
  });

  it('returns an empty list when Bring omits its lists collection', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}));

    await expect(loadLists({ email: 'pilot@example.com', password: 'secret' })).resolves.toEqual(
      [],
    );
  });

  it('rejects a list-loading API error', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}, false));

    await expect(loadLists({ email: 'pilot@example.com', password: 'secret' })).rejects.toThrow(
      'Could not load Bring lists',
    );
  });

  it('reports a missing API key before requesting lists', async () => {
    delete process.env.EXPO_PUBLIC_BRING_API_KEY;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }));

    await expect(loadLists({ email: 'pilot@example.com', password: 'secret' })).rejects.toThrow(
      'missing EXPO_PUBLIC_BRING_API_KEY',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('adds the resolved label without a specification by default', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}));

    await addItem({ email: 'pilot@example.com', password: 'secret' }, 'list/id', 'Moon Milk');

    expect(fetchSpy.mock.calls[1][0]).toContain('bringlists/list%2Fid');
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({
      method: 'PUT',
      headers: expect.objectContaining({
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      }),
    });
    const body = new URLSearchParams(String((fetchSpy.mock.calls[1][1] as RequestInit).body));
    expect(body.get('purchase')).toBe('Moon Milk');
    expect(body.get('specification')).toBe('');
    expect(body.has('ean')).toBe(false);
  });

  it('adds a selected quantity to the specification', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}));

    await addItem({ email: 'pilot@example.com', password: 'secret' }, 'list-id', 'Moon Milk', 3);

    const body = new URLSearchParams(String((fetchSpy.mock.calls[1][1] as RequestInit).body));
    expect(body.get('specification')).toBe('3×');
  });

  it('adds a machine-readable barcode alongside the visible quantity', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}));

    await addItem(
      { email: 'pilot@example.com', password: 'secret' },
      'list-id',
      'Moon Milk',
      2,
      '7612345678901',
    );

    const body = new URLSearchParams(String((fetchSpy.mock.calls[1][1] as RequestInit).body));
    expect(body.get('specification')).toBe('2× · EAN:7612345678901');
  });

  it('rejects an item that Bring does not accept', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}, false));

    await expect(
      addItem({ email: 'pilot@example.com', password: 'secret' }, 'list-id', 'Moon Milk'),
    ).rejects.toThrow('Bring did not accept the item');
  });

  it('restores a purchased item from Bring recently used with its original UUID', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}));

    await restoreItem({ email: 'pilot@example.com', password: 'secret' }, 'list/id', {
      uuid: 'item-1',
      label: 'Moon Milk',
      specification: 'EAN:7612345678901',
    });

    expect(fetchSpy.mock.calls[1][0]).toContain('bringlists/list%2Fid/items');
    expect(JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      changes: [
        {
          uuid: 'item-1',
          itemId: 'Moon Milk',
          operation: 'TO_PURCHASE',
          spec: 'EAN:7612345678901',
        },
      ],
    });
  });

  it('reports when Bring rejects restoring a recently used item', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}, false));

    await expect(
      restoreItem({ email: 'pilot@example.com', password: 'secret' }, 'list-id', {
        uuid: 'item-1',
        label: 'Moon Milk',
      }),
    ).rejects.toThrow('Bring did not restore');
  });

  it('restores from Bring recently used by label when the UUID is unavailable', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}));

    await restoreItem({ email: 'pilot@example.com', password: 'secret' }, 'list-id', {
      label: 'Moon Milk',
      specification: '2×',
    });

    const body = JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body));
    expect(body).toMatchObject({
      changes: [{ itemId: 'Moon Milk', operation: 'TO_PURCHASE', spec: '2×' }],
    });
    expect(body.changes[0]).not.toHaveProperty('uuid');
  });

  it('loads active Bring items with their stable IDs and specifications', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(
        response({
          items: {
            purchase: [
              { uuid: 'item-1', itemId: 'Moon Milk', specification: '2×' },
              {
                uuid: 'item-2',
                itemId: 'Star Bread',
                specification: 'EAN:7612345678901',
              },
              { itemId: 'Ignored incomplete item' },
            ],
          },
        }),
      );

    await expect(
      loadItems({ email: 'pilot@example.com', password: 'secret' }, 'list/id'),
    ).resolves.toEqual([
      { uuid: 'item-1', label: 'Moon Milk', specification: '2×' },
      {
        uuid: 'item-2',
        label: 'Star Bread',
        specification: 'EAN:7612345678901',
        barcode: '7612345678901',
      },
    ]);
  });

  it('normalizes an empty Bring item response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}));
    await expect(
      loadItems({ email: 'pilot@example.com', password: 'secret' }, 'list'),
    ).resolves.toEqual([]);
  });

  it('accepts the legacy top-level Bring purchase shape', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(
        response({ purchase: [{ uuid: 'legacy-1', name: 'Star Bread', spec: 'fresh' }] }),
      );
    await expect(
      loadItems({ email: 'pilot@example.com', password: 'secret' }, 'list'),
    ).resolves.toEqual([{ uuid: 'legacy-1', label: 'Star Bread', specification: 'fresh' }]);
  });

  it('removes a Bring item by UUID through the batch endpoint', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}));

    await removeItem({ email: 'pilot@example.com', password: 'secret' }, 'list/id', {
      uuid: 'item-1',
      label: 'Moon Milk',
      specification: '2×',
    });

    expect(fetchSpy.mock.calls[1][0]).toContain('bringlists/list%2Fid/items');
    expect(JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      changes: [{ uuid: 'item-1', itemId: 'Moon Milk', operation: 'TO_RECENTLY', spec: '2×' }],
    });
  });

  it('rejects a removal that Bring does not accept', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'user-id', access_token: 'token' }))
      .mockResolvedValueOnce(response({}, false));
    await expect(
      removeItem({ email: 'pilot@example.com', password: 'secret' }, 'list', {
        uuid: 'item-1',
        label: 'Moon Milk',
      }),
    ).rejects.toThrow('Bring did not remove');
  });
});
