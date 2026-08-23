import { Platform } from 'react-native';
import {
  deviceLocale,
  localizedField,
  lookupProduct,
  normalizeBarcode,
  productLabel,
  resolveCountry,
  resolveLanguage,
} from '../../src/services/productLookup';

function productResponse(product?: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => (product ? { product } : {}),
  } as Response;
}

describe('product lookup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('normalizes scanner values to digits', () => {
    expect(normalizeBarcode('76 123-45/abc')).toBe('7612345');
  });

  it.each([
    ['de', 'it-CH', 'de'],
    ['en', 'de-CH', 'en'],
    ['fr', 'en-US', 'fr'],
    ['it', 'fr-FR', 'it'],
  ] as const)('keeps an explicit %s language preference', (preference, locale, expected) => {
    expect(resolveLanguage(preference, locale)).toBe(expected);
  });

  it('resolves supported automatic languages and falls back to English', () => {
    expect(resolveLanguage('auto', 'de-CH')).toBe('de');
    expect(resolveLanguage('auto', 'FR_fr')).toBe('fr');
    expect(resolveLanguage('auto', 'nl-NL')).toBe('en');
  });

  it('resolves a two-letter country and otherwise falls back to Switzerland', () => {
    expect(resolveCountry('de-CH')).toBe('ch');
    expect(resolveCountry('pt_br')).toBe('br');
    expect(resolveCountry('en')).toBe('ch');
    expect(resolveCountry('en-USA')).toBe('ch');
  });

  it('falls back to the default locale if Intl locale detection throws', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('locale unavailable');
    });

    expect(deviceLocale()).toBe('en-CH');
  });

  it('prefers the selected language, then English, original, and any supported translation', () => {
    expect(
      localizedField(
        {
          product_name: 'Nom français',
          product_name_de: 'Deutscher Name',
          product_name_en: 'English name',
        },
        'product_name',
        'de',
      ),
    ).toBe('Deutscher Name');
    expect(
      localizedField(
        { product_name: 'Nom français', product_name_en: 'English name' },
        'product_name',
        'it',
      ),
    ).toBe('English name');
    expect(localizedField({ product_name: ' Nom original ' }, 'product_name', 'it')).toBe(
      'Nom original',
    );
    expect(localizedField({ product_name_fr: 'Nom disponible' }, 'product_name', 'it')).toBe(
      'Nom disponible',
    );
    expect(localizedField({ product_name: '   ', product_name_de: 42 }, 'product_name', 'de')).toBe(
      undefined,
    );
  });

  it.each([
    ['generic', 'Toilet paper'],
    ['exact', 'Hakle Natural Soft'],
    ['ask', 'Hakle Natural Soft'],
  ] as const)('resolves the %s label style', (style, expected) => {
    expect(productLabel('Hakle Natural Soft', 'Toilet paper', style)).toBe(expected);
  });

  it('falls back to the exact label when no generic name exists', () => {
    expect(productLabel('Hakle Natural Soft', undefined, 'generic')).toBe('Hakle Natural Soft');
  });

  it('uses a normalized custom label without an online request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      lookupProduct('761 2345-678901', [{ barcode: '7612345678901', label: 'Moon Milk' }]),
    ).resolves.toMatchObject({
      barcode: '7612345678901',
      label: 'Moon Milk',
      exactLabel: 'Moon Milk',
      genericLabel: 'Moon Milk',
      source: 'custom',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the product family API and returns a localized generic household label', async () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ locale: 'de-CH' }),
    } as Intl.DateTimeFormat);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      productResponse({
        product_name: 'Papier toilette douceur',
        product_name_de: 'Hakle Natürlich Sanft',
        generic_name_de: 'Toilettenpapier',
        quantity: '10 Rollen',
        brands: ' Hakle ',
        image_front_small_url: ' https://images.example/moon.png ',
        product_type: 'product',
      }),
    );

    await expect(
      lookupProduct('7612345678901', [], { language: 'de', labelStyle: 'generic' }),
    ).resolves.toEqual({
      barcode: '7612345678901',
      label: 'Toilettenpapier',
      exactLabel: 'Hakle Natürlich Sanft, 10 Rollen',
      genericLabel: 'Toilettenpapier',
      brand: 'Hakle',
      imageUrl: 'https://images.example/moon.png',
      productType: 'product',
      source: 'open-products-family',
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/v3/product/7612345678901?');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('product_type=all');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('lc=de');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('cc=ch');
    expect(fetchSpy.mock.calls[0][1]).toEqual({
      headers: { 'User-Agent': 'ShoppingList/1.0 (mobile app)' },
    });
  });

  it('omits the native User-Agent header in a browser lookup', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(lookupProduct('7612345678901', [])).resolves.toBeNull();

    expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it('does not repeat quantity already present in the exact name', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      productResponse({
        product_name_en: 'Comet Cola 330ML',
        quantity: '330ml',
        product_type: 'food',
      }),
    );

    await expect(
      lookupProduct('7612345678901', [], { language: 'en', labelStyle: 'exact' }),
    ).resolves.toMatchObject({ exactLabel: 'Comet Cola 330ML', label: 'Comet Cola 330ML' });
  });

  it('returns null for a 404, missing product, or product without any exact name', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce(productResponse())
      .mockResolvedValueOnce(productResponse({ generic_name_en: 'Toilet paper' }));

    await expect(lookupProduct('7612345678901', [])).resolves.toBeNull();
    await expect(lookupProduct('7612345678901', [])).resolves.toBeNull();
    await expect(lookupProduct('7612345678901', [])).resolves.toBeNull();
  });

  it('rejects HTTP, network, and invalid-JSON lookup failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => Promise.reject(new SyntaxError('bad JSON')),
      } as unknown as Response);

    await expect(lookupProduct('7612345678901', [])).rejects.toThrow('service is unavailable');
    await expect(lookupProduct('7612345678901', [])).rejects.toThrow('offline');
    await expect(lookupProduct('7612345678901', [])).rejects.toThrow('bad JSON');
  });

  it.each(['1234567', '123456789012345', 'not-a-barcode'])(
    'rejects invalid code %s',
    async (code) => {
      await expect(lookupProduct(code, [])).rejects.toThrow('valid EAN');
    },
  );

  it.each(['12345678', '12345678901234'])('accepts boundary-length code %s', async (code) => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(lookupProduct(code, [])).resolves.toBeNull();
  });
});
