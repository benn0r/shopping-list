import Foundation

enum ListViewMode: String, Codable, CaseIterable, Sendable { case list, tiles }
enum AppLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
  // Ordered by native name, as shown in the picker.
  case automatic, da, de, en, es, fr, it, nl, nb, pl, pt
  case ptBR = "pt-BR"
  case fi, sv, ja
  var id: String { rawValue }
  var localeIdentifier: String { self == .automatic ? Locale.current.identifier : rawValue }
  var title: String {
    switch self {
    case .automatic: "Automatic"
    case .da: "Dansk"
    case .de: "Deutsch"
    case .en: "English"
    case .es: "Español"
    case .fr: "Français"
    case .it: "Italiano"
    case .nl: "Nederlands"
    case .nb: "Norsk"
    case .pl: "Polski"
    case .pt: "Português"
    case .ptBR: "Português (Brasil)"
    case .fi: "Suomi"
    case .sv: "Svenska"
    case .ja: "日本語"
    }
  }
}
enum ProductLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
  case automatic, da, de, en, es, fr, it, nl, nb, pl, pt, fi, sv, ja
  var id: String { rawValue }
  var title: String {
    switch self {
    case .automatic: "Automatic"
    case .da: "Danish"
    case .de: "German"
    case .en: "English"
    case .es: "Spanish"
    case .fr: "French"
    case .it: "Italian"
    case .nl: "Dutch"
    case .nb: "Norwegian"
    case .pl: "Polish"
    case .pt: "Portuguese"
    case .fi: "Finnish"
    case .sv: "Swedish"
    case .ja: "Japanese"
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
  case bring, mealie, server, cloud
  var id: String { rawValue }
  var title: String {
    switch self {
    case .server: "Shopping List Server"
    case .cloud: "Shopping List Cloud"
    default: rawValue.capitalized
    }
  }
  /// Providers the user connects by hand in Settings; Cloud is set up by signing in.
  static var connectable: [ProviderKind] { [.bring, .mealie, .server] }
}

/// The signed-in Shopping List Cloud account. The session token lives in the Keychain.
struct CloudAccount: Codable, Hashable, Sendable {
  var userID: String
  var appleUserID: String
  var name: String?
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
  var iconURL: URL?
  var providerCategory: String?
  /// True while the provider is still matching or generating this item's icon.
  var iconPending: Bool?
  var sourceListID: UUID
}

extension ShoppingItem {
  /// Takes the provider's icon and category; nil values fall back to the app's own matching.
  mutating func adoptPresentation(of remote: ProviderItem) {
    iconName = remote.icon
    iconURL = remote.iconURL
    providerCategory = remote.category
    iconPending = remote.iconPending == true ? true : nil
  }
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
  /// Name of a bundled food icon, or of a server-generated one that only `iconURL` can load.
  var icon: String?
  var iconURL: URL?
  /// A `GroceryCategory` key such as `dairyEggs`.
  var category: String?
  /// True while the provider is still matching or generating the icon.
  var iconPending: Bool?
}

struct ProviderConfiguration: Codable, Hashable, Sendable {
  var enabled = false
  var serverURL = ""
  var username = ""
  var secret = ""
}

/// Offline keeps lists on this iPhone; online keeps them in Shopping List Cloud.
/// Bring and Mealie lists work in both.
enum StorageMode: String, Codable, Sendable {
  case offline, online
}

struct AppStateSnapshot: Codable, Sendable {
  var lists: [ShoppingListDefinition]
  var stores: [StoreDefinition]
  var items: [UUID: [ShoppingItem]]
  var sessions: [ShoppingSession]
  var activeListID: UUID
  var viewMode: ListViewMode
  var showCategoryLabels: Bool = true
  /// Tapping an item checks it off instead of opening its details.
  var oneTapShopping = false
  var providerConfigurations: [ProviderKind: ProviderConfiguration]
  var lookupPreferences: ProductLookupPreferences = .init()
  var customBarcodes: [CustomBarcode] = []
  var appLanguage: AppLanguage = .automatic
  var cloudAccount: CloudAccount?
  /// Offline or online; nil until the user has chosen, including after updating from a version
  /// without the choice.
  var storageMode: StorageMode?

  enum CodingKeys: String, CodingKey {
    case lists, stores, items, sessions, activeListID, viewMode, showCategoryLabels, oneTapShopping
    case providerConfigurations
    case lookupPreferences, customBarcodes, appLanguage, cloudAccount, storageMode
  }

  init(
    lists: [ShoppingListDefinition], stores: [StoreDefinition], items: [UUID: [ShoppingItem]],
    sessions: [ShoppingSession], activeListID: UUID, viewMode: ListViewMode,
    showCategoryLabels: Bool = true, oneTapShopping: Bool = false,
    providerConfigurations: [ProviderKind: ProviderConfiguration],
    lookupPreferences: ProductLookupPreferences = .init(), customBarcodes: [CustomBarcode] = [],
    appLanguage: AppLanguage = .automatic, cloudAccount: CloudAccount? = nil,
    storageMode: StorageMode? = nil
  ) {
    self.lists = lists
    self.stores = stores
    self.items = items
    self.sessions = sessions
    self.activeListID = activeListID
    self.viewMode = viewMode
    self.showCategoryLabels = showCategoryLabels
    self.oneTapShopping = oneTapShopping
    self.providerConfigurations = providerConfigurations
    self.lookupPreferences = lookupPreferences
    self.customBarcodes = customBarcodes
    self.appLanguage = appLanguage
    self.cloudAccount = cloudAccount
    self.storageMode = storageMode
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
    oneTapShopping = try values.decodeIfPresent(Bool.self, forKey: .oneTapShopping) ?? false
    providerConfigurations = try values.decode(
      [ProviderKind: ProviderConfiguration].self, forKey: .providerConfigurations)
    lookupPreferences =
      try values.decodeIfPresent(ProductLookupPreferences.self, forKey: .lookupPreferences)
      ?? .init()
    customBarcodes = try values.decodeIfPresent([CustomBarcode].self, forKey: .customBarcodes) ?? []
    appLanguage = try values.decodeIfPresent(AppLanguage.self, forKey: .appLanguage) ?? .automatic
    cloudAccount = try values.decodeIfPresent(CloudAccount.self, forKey: .cloudAccount)
    storageMode = try values.decodeIfPresent(StorageMode.self, forKey: .storageMode)
  }
}
