import Foundation

struct ProductMetadata: Codable, Hashable, Sendable {
  var label: String
  var exactLabel: String
  var genericLabel: String?
  var brand: String?
  var imageURL: URL?
  var stores: [String]
  var source: String
  var productType: String?
  var categoryHints: [String]
}

struct ProductLookup: Sendable {
  private static let supportedLanguages = ["de", "en", "fr", "it"]
  private let cache: ProductMetadataCache

  init(cache: ProductMetadataCache = .shared) {
    self.cache = cache
  }

  private struct Response: Decodable { var product: Product? }
  private struct Product: Decodable {
    var productName: String?
    var genericName: String?
    var brands: String?
    var imageFrontSmallURL: URL?
    var imageFrontURL: URL?
    var productType: String?
    var categories: String?
    var categoriesTags: [String]?
    var categoriesHierarchy: [String]?
    var foodGroups: String?
    var foodGroupsTags: [String]?
    var pnnsGroups1: String?
    var pnnsGroups2: String?
    var stores: String?
    var storesTags: [String]?
    var localized: [String: String] = [:]

    enum CodingKeys: String, CodingKey {
      case productName = "product_name"
      case genericName = "generic_name"
      case brands
      case imageFrontSmallURL = "image_front_small_url"
      case imageFrontURL = "image_front_url"
      case productType = "product_type"
      case categories
      case categoriesTags = "categories_tags"
      case categoriesHierarchy = "categories_hierarchy"
      case foodGroups = "food_groups"
      case foodGroupsTags = "food_groups_tags"
      case pnnsGroups1 = "pnns_groups_1"
      case pnnsGroups2 = "pnns_groups_2"
      case stores
      case storesTags = "stores_tags"
    }

    init(from decoder: Decoder) throws {
      let values = try decoder.container(keyedBy: CodingKeys.self)
      productName = try values.decodeIfPresent(String.self, forKey: .productName)
      genericName = try values.decodeIfPresent(String.self, forKey: .genericName)
      brands = try values.decodeIfPresent(String.self, forKey: .brands)
      imageFrontSmallURL = try values.decodeIfPresent(URL.self, forKey: .imageFrontSmallURL)
      imageFrontURL = try values.decodeIfPresent(URL.self, forKey: .imageFrontURL)
      productType = try values.decodeIfPresent(String.self, forKey: .productType)
      categories = try values.decodeIfPresent(String.self, forKey: .categories)
      categoriesTags = try values.decodeIfPresent([String].self, forKey: .categoriesTags)
      categoriesHierarchy = try values.decodeIfPresent([String].self, forKey: .categoriesHierarchy)
      foodGroups = try values.decodeIfPresent(String.self, forKey: .foodGroups)
      foodGroupsTags = try values.decodeIfPresent([String].self, forKey: .foodGroupsTags)
      pnnsGroups1 = try values.decodeIfPresent(String.self, forKey: .pnnsGroups1)
      pnnsGroups2 = try values.decodeIfPresent(String.self, forKey: .pnnsGroups2)
      stores = try values.decodeIfPresent(String.self, forKey: .stores)
      storesTags = try values.decodeIfPresent([String].self, forKey: .storesTags)
      let dynamic = try decoder.container(keyedBy: DynamicKey.self)
      for key in dynamic.allKeys
      where key.stringValue.hasPrefix("product_name_")
        || key.stringValue.hasPrefix("generic_name_")
      {
        localized[key.stringValue] = try? dynamic.decode(String.self, forKey: key)
      }
    }
  }

  private struct DynamicKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) {
      self.intValue = intValue
      stringValue = String(intValue)
    }
  }

  func find(
    barcode: String, preferences: ProductLookupPreferences = .init(),
    customBarcodes: [CustomBarcode] = []
  ) async throws -> ProductMetadata? {
    let normalizedBarcode = barcode.filter(\.isNumber)
    if let custom = customBarcodes.first(where: { $0.barcode == normalizedBarcode }) {
      return ProductMetadata(
        label: custom.label, exactLabel: custom.label, genericLabel: custom.label, brand: nil,
        imageURL: nil, stores: [], source: "Custom barcode", productType: "custom",
        categoryHints: [])
    }
    let language = resolvedLanguage(preferences.language)
    let cacheKey = "\(normalizedBarcode)|\(language)|\(preferences.labelStyle.rawValue)"
    if let cached = await cache.value(for: cacheKey) { return cached }
    let localizedFields = Self.supportedLanguages.flatMap {
      ["product_name_\($0)", "generic_name_\($0)"]
    }
    let fields =
      [
        "product_name", "generic_name", "brands", "image_front_small_url", "image_front_url",
        "product_type", "stores", "stores_tags", "categories", "categories_tags",
        "categories_hierarchy", "food_groups", "food_groups_tags", "pnns_groups_1",
        "pnns_groups_2",
      ] + localizedFields
    guard
      var components = URLComponents(
        string: "https://world.openfoodfacts.org/api/v3/product/\(normalizedBarcode)")
    else { return nil }
    components.queryItems = [
      URLQueryItem(name: "product_type", value: "all"),
      URLQueryItem(name: "lc", value: language),
      URLQueryItem(name: "cc", value: Locale.current.region?.identifier.lowercased() ?? "ch"),
      URLQueryItem(name: "tags_lc", value: language),
      URLQueryItem(name: "fields", value: fields.joined(separator: ",")),
    ]
    guard let url = components.url else { return nil }
    var request = URLRequest(url: url)
    request.setValue("ShoppingList/2.0 (iOS)", forHTTPHeaderField: "User-Agent")
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { return nil }
    if http.statusCode == 404 { return nil }
    guard (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
    guard let product = try JSONDecoder().decode(Response.self, from: data).product else {
      return nil
    }
    let exactLabel = localizedValue("product_name", language: language, product: product)
    let genericLabel = localizedValue("generic_name", language: language, product: product)
    guard let exactLabel = exactLabel ?? genericLabel else { return nil }
    let label = preferences.labelStyle == .generic ? genericLabel ?? exactLabel : exactLabel
    let stores =
      (product.storesTags ?? [])
      + (product.stores?.split(separator: ",").map(String.init) ?? [])
    let categoryHints =
      [product.categories, product.foodGroups, product.pnnsGroups1, product.pnnsGroups2]
      .compactMap { clean($0) } + (product.categoriesTags ?? [])
      + (product.categoriesHierarchy ?? []) + (product.foodGroupsTags ?? [])
    let metadata = ProductMetadata(
      label: label, exactLabel: exactLabel, genericLabel: genericLabel,
      brand: clean(product.brands),
      imageURL: product.imageFrontSmallURL ?? product.imageFrontURL,
      stores: Array(Set(stores.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) })).filter {
        !$0.isEmpty
      }.sorted(),
      source: sourceName(product.productType), productType: product.productType,
      categoryHints: categoryHints.reduce(into: []) { result, hint in
        if !result.contains(hint) { result.append(hint) }
      })
    await cache.store(metadata, for: cacheKey)
    return metadata
  }

  private func resolvedLanguage(_ preference: ProductLanguage) -> String {
    if preference != .automatic { return preference.rawValue }
    let language = Locale.current.language.languageCode?.identifier ?? "en"
    return Self.supportedLanguages.contains(language) ? language : "en"
  }

  private func localizedValue(_ field: String, language: String, product: Product) -> String? {
    clean(product.localized["\(field)_\(language)"])
      ?? clean(product.localized["\(field)_en"])
      ?? clean(field == "product_name" ? product.productName : product.genericName)
      ?? Self.supportedLanguages.compactMap { clean(product.localized["\(field)_\($0)"]) }.first
  }

  private func clean(_ value: String?) -> String? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
      return nil
    }
    return value
  }

  private func sourceName(_ productType: String?) -> String {
    switch productType?.lowercased() {
    case "beauty": "Open Beauty Facts"
    case "petfood", "pet-food": "Open Pet Food Facts"
    case "product", "products": "Open Products Facts"
    default: "Open Food Facts"
    }
  }
}

actor ProductMetadataCache {
  static let shared = ProductMetadataCache()

  private let storageURL: URL
  private var values: [String: ProductMetadata]?

  init(
    storageURL: URL = FileManager.default.urls(
      for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("product-metadata.json")
  ) {
    self.storageURL = storageURL
  }

  func value(for key: String) -> ProductMetadata? {
    loadIfNeeded()
    return values?[key]
  }

  func store(_ metadata: ProductMetadata, for key: String) {
    loadIfNeeded()
    values?[key] = metadata
    guard let values, let data = try? JSONEncoder().encode(values) else { return }
    try? FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: storageURL, options: .atomic)
  }

  private func loadIfNeeded() {
    guard values == nil else { return }
    values =
      (try? Data(contentsOf: storageURL)).flatMap {
        try? JSONDecoder().decode([String: ProductMetadata].self, from: $0)
      } ?? [:]
  }
}
