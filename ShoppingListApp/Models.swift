import Foundation

enum ListViewMode: String, Codable, CaseIterable, Sendable { case list, tiles }
enum ProviderKind: String, Codable, CaseIterable, Identifiable, Sendable {
  case bring, mealie
  var id: String { rawValue }
  var title: String { rawValue.capitalized }
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
  var addedAt = Date()
  var remoteItemID: String?
  var remoteSpecification: String?
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
  var providerConfigurations: [ProviderKind: ProviderConfiguration]
}
