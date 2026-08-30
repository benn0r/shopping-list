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
  @Published var errorMessage: String?

  private let storageURL: URL
  private let providerFactory: (ProviderKind, ProviderConfiguration) -> ShoppingProvider
  private let persistence = StatePersistence()
  private var persistenceTask: Task<Void, Never>?

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
      providerConfigurations: publicConfigurations
    )
    return (snapshot, secrets)
  }

  func addItem(
    label: String, barcode: String? = nil, imageURL: URL? = nil, brand: String? = nil,
    stores: [String] = [], quantity: Double? = nil, unit: String? = nil
  ) async {
    let value = label.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return }
    var item = ShoppingItem(
      barcode: barcode, label: value, brand: brand, imageURL: imageURL, quantity: quantity,
      unit: unit, stores: stores,
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
    do {
      let remote = try await provider(for: target.provider).items(in: target.remoteListID)
      let existing = items[list.id, default: []]
      var synchronized: [ShoppingItem] = []
      for remoteItem in remote {
        if let local = existing.first(where: {
          $0.remoteItemID == remoteItem.id
            || ($0.barcode != nil && $0.barcode == remoteItem.barcode)
        }) {
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
          let metadata = try? await ProductLookup().find(barcode: barcode)
        {
          item.label = metadata.label
          item.brand = metadata.brand
          item.imageURL = metadata.imageURL
          item.stores = metadata.stores
        }
        synchronized.append(item)
      }
      items[list.id] = synchronized
      save()
    } catch { errorMessage = error.localizedDescription }
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
    items[purchase.item.sourceListID, default: []].append(purchase.item)
    save()
    if let list = lists.first(where: { $0.id == purchase.item.sourceListID }),
      let target = list.syncTarget
    {
      do {
        _ = try await provider(for: target.provider).addItem(purchase.item, to: target.remoteListID)
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
}
