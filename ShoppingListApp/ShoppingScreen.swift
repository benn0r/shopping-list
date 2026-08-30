import SwiftUI

struct ShoppingScreen: View {
  @EnvironmentObject private var store: AppStore
  @State private var selectedStore: StoreDefinition?
  @State private var selectedLists: Set<UUID> = []
  @State private var history: ShoppingSession?

  var body: some View {
    NavigationStack {
      Group {
        if let session = store.activeSession { active(session) } else { setup }
      }
      .navigationTitle("Shopping")
      .sheet(item: $history) { HistoryDetails(session: $0) }
    }
  }

  private var setup: some View {
    List {
      Section {
        Picker("Store", selection: $selectedStore) {
          Text("Choose Store").tag(nil as StoreDefinition?)
          ForEach(store.stores) { Text($0.name).tag(Optional($0)) }
        }
      }
      Section("Shopping Lists") {
        ForEach(store.lists) { list in
          Button {
            toggle(list.id)
          } label: {
            HStack {
              Text(list.name)
              Spacer()
              if selectedLists.contains(list.id) { Image(systemName: "checkmark") }
            }
          }.foregroundStyle(.primary)
        }
      }
      Section {
        Button("Start Shopping") {
          if let selectedStore { store.startShopping(store: selectedStore, listIDs: selectedLists) }
        }
        .disabled(selectedStore == nil || selectedLists.isEmpty)
      }
      historySection
    }
    .onAppear {
      if selectedLists.isEmpty { selectedLists = [store.activeListID] }
      selectedStore = selectedStore ?? store.stores.first
    }
  }

  private func active(_ session: ShoppingSession) -> some View {
    let available = session.listIDs.flatMap { store.items[$0, default: []] }.filter { item in
      item.stores.isEmpty
        || item.stores.contains(where: { $0.localizedCaseInsensitiveContains(session.store.name) })
    }
    return ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        VStack(alignment: .leading) {
          Text(session.store.name).font(.title2.bold())
          Text(session.listNames.joined(separator: ", ")).foregroundStyle(.secondary)
        }
        if available.isEmpty {
          ContentUnavailableView(
            "No Items", systemImage: "cart", description: Text("No matching items remain."))
        } else {
          ItemCollection(items: available, mode: store.viewMode) { item in
            Task { await store.purchase(item) }
          }
        }
        Text("Purchased Items").font(.headline)
        if session.purchasedItems.isEmpty {
          Text("Nothing purchased yet.").foregroundStyle(.secondary)
        } else {
          ItemCollection(items: session.purchasedItems.map(\.item), mode: store.viewMode) { item in
            if let purchase = session.purchasedItems.first(where: { $0.item.id == item.id }) {
              Task { await store.restore(purchase) }
            }
          }
        }
        Button("Finish Shopping") { store.finishShopping() }.buttonStyle(.borderedProminent).tint(
          .teal)
      }.padding(.horizontal, 16).padding(.vertical)
    }
  }

  private var historySection: some View {
    Section("Shopping History") {
      ForEach(store.sessions.filter { $0.completedAt != nil }) { session in
        Button {
          history = session
        } label: {
          VStack(alignment: .leading) {
            Text(session.store.name)
            Text(session.completedAt?.formatted() ?? "").font(.caption).foregroundStyle(.secondary)
          }
        }.foregroundStyle(.primary)
      }.onDelete { offsets in
        let complete = store.sessions.filter { $0.completedAt != nil }
        let ids = offsets.map { complete[$0].id }
        store.sessions.removeAll { ids.contains($0.id) }
        store.save()
      }
    }
  }
  private func toggle(_ id: UUID) {
    if selectedLists.contains(id) { selectedLists.remove(id) } else { selectedLists.insert(id) }
  }
}

private struct HistoryDetails: View {
  let session: ShoppingSession
  var body: some View {
    NavigationStack {
      List(session.purchasedItems) { Text($0.item.label) }.navigationTitle(session.store.name)
    }
  }
}
