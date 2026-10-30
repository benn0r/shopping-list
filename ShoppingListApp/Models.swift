import Foundation

enum ListViewMode: String, Codable, CaseIterable, Sendable { case list, tiles }
enum AppLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
  case automatic, en, de, fr, it, pt
  case ptBR = "pt-BR"
  var id: String { rawValue }
  var localeIdentifier: String { self == .automatic ? Locale.current.identifier : rawValue }
  var title: String {
    switch self {
    case .automatic: "Automatic"
    case .en: "English"
    case .de: "Deutsch"
    case .fr: "Français"
    case .it: "Italiano"
    case .pt: "Português"
    case .ptBR: "Português (Brasil)"
    }
  }
}
enum ProductLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
  case automatic, de, en, fr, it
  var id: String { rawValue }
  var title: String {
    switch self {
    case .automatic: "Automatic"
    case .de: "German"
    case .en: "English"
    case .fr: "French"
    case .it: "Italian"
    }
  }
}
enum ProductLabelStyle: String, Codable, CaseIterable, Identifiable, Sendable {
  case generic, exact, ask
  var id: String { rawValue }
  var title: String {
    switch self {
    case .generic: "Generic name"
    case .exact: "Exact product"
    case .ask: "Ask every time"
    }
  }
}
struct ProductLookupPreferences: Codable, Hashable, Sendable {
  var language: ProductLanguage = .automatic
  var labelStyle: ProductLabelStyle = .generic
}
struct CustomBarcode: Codable, Identifiable, Hashable, Sendable {
  var barcode: String
  var label: String
  var id: String { barcode }
}
enum ProviderKind: String, Codable, CaseIterable, Identifiable, Sendable {
  case bring, mealie, server
  var id: String { rawValue }
  var title: String { self == .server ? "Shopping List Server" : rawValue.capitalized }
}

struct SyncTarget: Codable, Hashable, Sendable {
  var provider: ProviderKind
  var remoteListID: String
  var remoteListName: String
}

struct ShoppingListDefinition: Codable, Identifiable, Hashable, Sendable {
  var id = UUID()
  var name: String
  var syncTarget: SyncTarget?
}

struct StoreDefinition: Codable, Identifiable, Hashable, Sendable {
  var id = UUID()
  var name: String
}

struct ShoppingItem: Codable, Identifiable, Hashable, Sendable {
  var id = UUID()
  var barcode: String?
  var label: String
  var brand: String?
  var imageURL: URL?
  var quantity: Double?
  var unit: String?
  var stores: [String] = []
  var exactLabel: String?
  var genericLabel: String?
  var productSource: String?
  var productType: String?
  var categoryHints: [String]?
  var metadataResolved: Bool?
  var addedAt = Date()
  var remoteItemID: String?
  var remoteSpecification: String?
  var iconName: String?
  var sourceListID: UUID
}

struct PurchasedItem: Codable, Identifiable, Hashable, Sendable {
  var id = UUID()
  var item: ShoppingItem
  var purchasedAt = Date()
}

struct ShoppingSession: Codable, Identifiable, Hashable, Sendable {
  var id = UUID()
  var store: StoreDefinition
  var listIDs: [UUID]
  var listNames: [String]
  var startedAt = Date()
  var completedAt: Date?
  var purchasedItems: [PurchasedItem] = []
}

struct ProviderList: Codable, Identifiable, Hashable, Sendable {
  var id: String
  var name: String
}

struct ProviderItem: Codable, Identifiable, Hashable, Sendable {
  var id: String
  var label: String
  var barcode: String?
  var quantity: Double?
  var unit: String?
  var specification: String?
  var icon: String?
}

struct ProviderConfiguration: Codable, Hashable, Sendable {
  var enabled = false
  var serverURL = ""
  var username = ""
  var secret = ""
}

struct AppStateSnapshot: Codable, Sendable {
  var lists: [ShoppingListDefinition]
  var stores: [StoreDefinition]
  var items: [UUID: [ShoppingItem]]
  var sessions: [ShoppingSession]
  var activeListID: UUID
  var viewMode: ListViewMode
  var showCategoryLabels: Bool = true
  var providerConfigurations: [ProviderKind: ProviderConfiguration]
  var lookupPreferences: ProductLookupPreferences = .init()
  var customBarcodes: [CustomBarcode] = []
  var appLanguage: AppLanguage = .automatic

  enum CodingKeys: String, CodingKey {
    case lists, stores, items, sessions, activeListID, viewMode, showCategoryLabels
    case providerConfigurations
    case lookupPreferences, customBarcodes, appLanguage
  }

  init(
    lists: [ShoppingListDefinition], stores: [StoreDefinition], items: [UUID: [ShoppingItem]],
    sessions: [ShoppingSession], activeListID: UUID, viewMode: ListViewMode,
    showCategoryLabels: Bool = true,
    providerConfigurations: [ProviderKind: ProviderConfiguration],
    lookupPreferences: ProductLookupPreferences = .init(), customBarcodes: [CustomBarcode] = [],
    appLanguage: AppLanguage = .automatic
  ) {
    self.lists = lists
    self.stores = stores
    self.items = items
    self.sessions = sessions
    self.activeListID = activeListID
    self.viewMode = viewMode
    self.showCategoryLabels = showCategoryLabels
    self.providerConfigurations = providerConfigurations
    self.lookupPreferences = lookupPreferences
    self.customBarcodes = customBarcodes
    self.appLanguage = appLanguage
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    lists = try values.decode([ShoppingListDefinition].self, forKey: .lists)
    stores = try values.decode([StoreDefinition].self, forKey: .stores)
    items = try values.decode([UUID: [ShoppingItem]].self, forKey: .items)
    sessions = try values.decode([ShoppingSession].self, forKey: .sessions)
    activeListID = try values.decode(UUID.self, forKey: .activeListID)
    viewMode = try values.decode(ListViewMode.self, forKey: .viewMode)
    showCategoryLabels = try values.decodeIfPresent(Bool.self, forKey: .showCategoryLabels) ?? true
    providerConfigurations = try values.decode(
      [ProviderKind: ProviderConfiguration].self, forKey: .providerConfigurations)
    lookupPreferences =
      try values.decodeIfPresent(ProductLookupPreferences.self, forKey: .lookupPreferences)
      ?? .init()
    customBarcodes = try values.decodeIfPresent([CustomBarcode].self, forKey: .customBarcodes) ?? []
    appLanguage = try values.decodeIfPresent(AppLanguage.self, forKey: .appLanguage) ?? .automatic
  }
}
