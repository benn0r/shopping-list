import Foundation
import SwiftUI

@MainActor
final class AppStore: ObservableObject {
  @Published var lists: [ShoppingListDefinition]
  @Published var stores: [StoreDefinition]
  @Published var items: [UUID: [ShoppingItem]]
  @Published var sessions: [ShoppingSession]
  @Published var activeListID: UUID
  @Published var viewMode: ListViewMode
  @Published var providerConfigurations: [ProviderKind: ProviderConfiguration]
  @Published var lookupPreferences: ProductLookupPreferences
  @Published var customBarcodes: [CustomBarcode]
  @Published var appLanguage: AppLanguage
  @Published var errorMessage: String?

  private let storageURL: URL
  private let providerFactory: (ProviderKind, ProviderConfiguration) -> ShoppingProvider
  private let persistence = StatePersistence()
  private var persistenceTask: Task<Void, Never>?
  private var syncingListIDs: Set<UUID> = []

  init(
    storageURL: URL = FileManager.default.urls(
      for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("shopping-list.json"),
    providerFactory: @escaping (ProviderKind, ProviderConfiguration) -> ShoppingProvider =
      ProviderFactory.make
  ) {
    self.storageURL = storageURL
    self.providerFactory = providerFactory
    if let data = try? Data(contentsOf: storageURL),
      let snapshot = try? JSONDecoder().decode(AppStateSnapshot.self, from: data)
    {
      lists = snapshot.lists
      stores = snapshot.stores
      items = snapshot.items
      sessions = snapshot.sessions
      activeListID = snapshot.activeListID
      viewMode = snapshot.viewMode
      providerConfigurations = snapshot.providerConfigurations.mapValues { $0 }
      lookupPreferences = snapshot.lookupPreferences
      customBarcodes = snapshot.customBarcodes
      appLanguage = snapshot.appLanguage
      for provider in ProviderKind.allCases {
        providerConfigurations[provider]?.secret = CredentialVault.read(provider)
      }
    } else {
      let initial = ShoppingListDefinition(name: "Groceries")
      lists = [initial]
      stores = []
      items = [initial.id: []]
      sessions = []
      activeListID = initial.id
      viewMode = .list
      providerConfigurations = [.bring: .init(), .mealie: .init()]
      lookupPreferences = .init()
      customBarcodes = []
      appLanguage = .automatic
    }
  }

  var activeList: ShoppingListDefinition {
    lists.first(where: { $0.id == activeListID }) ?? lists[0]
  }
  var activeItems: [ShoppingItem] { items[activeListID, default: []] }
  var activeSession: ShoppingSession? { sessions.first(where: { $0.completedAt == nil }) }

  func save() {
    let state = persistenceState()
    persistenceTask?.cancel()
    persistenceTask = Task { [persistence, storageURL] in
      do {
        try await Task.sleep(for: .milliseconds(150))
        guard !Task.isCancelled else { return }
        try await persistence.write(
          snapshot: state.snapshot, secrets: state.secrets, to: storageURL)
      } catch is CancellationError {
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  func flushPersistence() async {
    persistenceTask?.cancel()
    let state = persistenceState()
    do {
      try await persistence.write(snapshot: state.snapshot, secrets: state.secrets, to: storageURL)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func persistenceState() -> (
    snapshot: AppStateSnapshot, secrets: [ProviderKind: String]
  ) {
    let secrets = providerConfigurations.mapValues(\.secret)
    let publicConfigurations = providerConfigurations.mapValues { configuration in
      var value = configuration
      value.secret = ""
      return value
    }
    let snapshot = AppStateSnapshot(
      lists: lists, stores: stores, items: items, sessions: sessions,
      activeListID: activeListID, viewMode: viewMode,
      providerConfigurations: publicConfigurations, lookupPreferences: lookupPreferences,
      customBarcodes: customBarcodes, appLanguage: appLanguage
    )
    return (snapshot, secrets)
  }

  func addItem(
    label: String, barcode: String? = nil, imageURL: URL? = nil, brand: String? = nil,
    stores: [String] = [], quantity: Double? = nil, unit: String? = nil,
    exactLabel: String? = nil, genericLabel: String? = nil, productSource: String? = nil,
    productType: String? = nil, metadataResolved: Bool? = nil
  ) async {
    let value = label.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return }
    var item = ShoppingItem(
      barcode: barcode, label: value, brand: brand, imageURL: imageURL, quantity: quantity,
      unit: unit, stores: stores, exactLabel: exactLabel, genericLabel: genericLabel,
      productSource: productSource, productType: productType, metadataResolved: metadataResolved,
      sourceListID: activeListID)
    items[activeListID, default: []].append(item)
    save()
    if let target = activeList.syncTarget {
      do {
        let remote = try await provider(for: target.provider).addItem(item, to: target.remoteListID)
        item.remoteItemID = remote.id
        if let index = items[activeListID]?.firstIndex(where: { $0.id == item.id }) {
          items[activeListID]?[index] = item
          save()
        }
      } catch { errorMessage = error.localizedDescription }
    }
  }

  func remove(_ item: ShoppingItem, from listID: UUID? = nil) async {
    let id = listID ?? item.sourceListID
    guard let list = lists.first(where: { $0.id == id }) else { return }
    items[id, default: []].removeAll(where: { $0.id == item.id })
    save()
    if let target = list.syncTarget {
      do {
        try await provider(for: target.provider).removeItem(item, from: target.remoteListID)
      } catch { errorMessage = error.localizedDescription }
    }
  }

  func sync(_ list: ShoppingListDefinition? = nil) async {
    let list = list ?? activeList
    guard let target = list.syncTarget else { return }
    guard syncingListIDs.insert(list.id).inserted else { return }
    defer { syncingListIDs.remove(list.id) }
    do {
      let adapter = try provider(for: target.provider)
      var existing = items[list.id, default: []]
      var remote = try await adapter.items(in: target.remoteListID)
      var uploadedItem = false
      for index in existing.indices where existing[index].remoteItemID == nil {
        if let match = remote.first(where: {
          (existing[index].barcode != nil && existing[index].barcode == $0.barcode)
            || Self.normalized(existing[index].label) == Self.normalized($0.label)
        }) {
          existing[index].remoteItemID = match.id
          existing[index].remoteSpecification = match.specification
        } else {
          let added = try await adapter.addItem(existing[index], to: target.remoteListID)
          existing[index].remoteItemID = added.id
          existing[index].remoteSpecification = added.specification
          uploadedItem = true
        }
      }
      if uploadedItem { remote = try await adapter.items(in: target.remoteListID) }
      var synchronized: [ShoppingItem] = []
      for remoteItem in remote {
        if var local = existing.first(where: {
          $0.remoteItemID == remoteItem.id
            || ($0.barcode != nil && $0.barcode == remoteItem.barcode)
            || Self.normalized($0.label) == Self.normalized(remoteItem.label)
        }) {
          local.remoteItemID = remoteItem.id
          local.remoteSpecification = remoteItem.specification
          local.barcode = remoteItem.barcode ?? local.barcode
          local.quantity = remoteItem.quantity ?? local.quantity
          local.unit = remoteItem.unit ?? local.unit
          if local.imageURL == nil && local.brand == nil { local.label = remoteItem.label }
          synchronized.append(local)
          continue
        }
        var item = ShoppingItem(
          barcode: remoteItem.barcode, label: remoteItem.label,
          quantity: remoteItem.quantity, unit: remoteItem.unit,
          remoteItemID: remoteItem.id, remoteSpecification: remoteItem.specification,
          sourceListID: list.id
        )
        if let barcode = remoteItem.barcode,
          let metadata = try? await ProductLookup().find(
            barcode: barcode, preferences: lookupPreferences, customBarcodes: customBarcodes)
        {
          item.label = metadata.label
          item.brand = metadata.brand
          item.imageURL = metadata.imageURL
          item.stores = metadata.stores
          item.exactLabel = metadata.exactLabel
          item.genericLabel = metadata.genericLabel
          item.productSource = metadata.source
          item.productType = metadata.productType
          item.metadataResolved = true
        }
        synchronized.append(item)
      }
      items[list.id] = synchronized
      save()
    } catch { errorMessage = error.localizedDescription }
  }

  func syncAll() async {
    for list in lists where list.syncTarget != nil { await sync(list) }
  }

  func createList(name: String, target: SyncTarget? = nil) {
    let list = ShoppingListDefinition(name: name, syncTarget: target)
    lists.append(list)
    items[list.id] = []
    save()
  }
  func updateList(_ list: ShoppingListDefinition) {
    if let index = lists.firstIndex(where: { $0.id == list.id }) {
      lists[index] = list
      save()
    }
  }
  func deleteList(_ list: ShoppingListDefinition) {
    guard lists.count > 1 else { return }
    lists.removeAll(where: { $0.id == list.id })
    items[list.id] = nil
    if activeListID == list.id { activeListID = lists[0].id }
    save()
  }
  func createStore(name: String) {
    stores.append(StoreDefinition(name: name))
    save()
  }
  func deleteStore(_ store: StoreDefinition) {
    stores.removeAll(where: { $0.id == store.id })
    save()
  }

  func saveCustomBarcode(barcode: String, label: String) {
    let code = barcode.filter(\.isNumber)
    let value = label.trimmingCharacters(in: .whitespacesAndNewlines)
    guard (8...14).contains(code.count), !value.isEmpty else { return }
    customBarcodes.removeAll { $0.barcode == code }
    customBarcodes.append(CustomBarcode(barcode: code, label: value))
    customBarcodes.sort { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    save()
  }

  func deleteCustomBarcode(_ value: CustomBarcode) {
    customBarcodes.removeAll { $0.barcode == value.barcode }
    save()
  }

  func startShopping(store: StoreDefinition, listIDs: Set<UUID>) {
    sessions.append(
      ShoppingSession(
        store: store, listIDs: Array(listIDs),
        listNames: lists.filter { listIDs.contains($0.id) }.map(\.name)
      ))
    save()
  }
  func purchase(_ item: ShoppingItem) async {
    guard let index = sessions.firstIndex(where: { $0.completedAt == nil }) else { return }
    sessions[index].purchasedItems.append(PurchasedItem(item: item))
    save()
    await remove(item)
  }
  func restore(_ purchase: PurchasedItem) async {
    guard let index = sessions.firstIndex(where: { $0.completedAt == nil }) else { return }
    sessions[index].purchasedItems.removeAll(where: { $0.id == purchase.id })
    var restoredItem = purchase.item
    items[purchase.item.sourceListID, default: []].append(restoredItem)
    save()
    if let list = lists.first(where: { $0.id == purchase.item.sourceListID }),
      let target = list.syncTarget
    {
      do {
        let remote = try await provider(for: target.provider).restoreItem(
          purchase.item, to: target.remoteListID)
        restoredItem.remoteItemID = remote.id
        restoredItem.remoteSpecification = remote.specification
        if let itemIndex = items[purchase.item.sourceListID]?.firstIndex(where: {
          $0.id == restoredItem.id
        }) {
          items[purchase.item.sourceListID]?[itemIndex] = restoredItem
          save()
        }
      } catch { errorMessage = error.localizedDescription }
    }
  }
  func finishShopping() {
    if let index = sessions.firstIndex(where: { $0.completedAt == nil }) {
      sessions[index].completedAt = Date()
      save()
    }
  }

  private func provider(for kind: ProviderKind) throws -> ShoppingProvider {
    guard let config = providerConfigurations[kind], config.enabled else {
      throw ProviderError.notConfigured
    }
    return providerFactory(kind, config)
  }

  private static func normalized(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
}
