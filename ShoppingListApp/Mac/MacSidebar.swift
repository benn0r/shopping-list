import SwiftUI

struct MacSidebar: View {
  @EnvironmentObject private var store: AppStore
  @Binding var newListPresented: Bool
  @State private var renaming: ShoppingListDefinition?
  @State private var newName = ""
  @State private var deleting: ShoppingListDefinition?

  private var selection: Binding<UUID?> {
    Binding(
      get: { store.activeListID },
      set: { id in
        guard let id, id != store.activeListID else { return }
        store.activeListID = id
        store.save()
      })
  }

  var body: some View {
    List(selection: selection) {
      Section("Lists") {
        ForEach(store.lists) { list in
          Label(list.name, systemImage: list.macSymbol)
            .badge(store.items[list.id, default: []].count)
            .tag(list.id)
            .help(list.storageDescription)
            .contextMenu { contextMenu(for: list) }
        }
        .onMove { from, to in
          store.lists.move(fromOffsets: from, toOffset: to)
          store.save()
        }
      }
    }
    .listStyle(.sidebar)
    .safeAreaInset(edge: .bottom, spacing: 0) { footer }
    .alert("Rename List", isPresented: isRenaming, presenting: renaming) { list in
      TextField("Name", text: $newName)
      Button("Rename") { rename(list) }
        .keyboardShortcut(.defaultAction)
      Button("Cancel", role: .cancel) {}
    }
    .confirmationDialog(
      "Delete “\(deleting?.name ?? "")”?", isPresented: isDeleting, presenting: deleting
    ) { list in
      Button("Delete List", role: .destructive) { store.deleteList(list) }
    } message: { list in
      if list.syncTarget == nil {
        Text("Its items are deleted from this Mac.")
      } else {
        Text("The list is removed from this Mac. It stays in \(list.storageDescription).")
      }
    }
  }

  @ViewBuilder private func contextMenu(for list: ShoppingListDefinition) -> some View {
    Button("Rename…") {
      newName = list.name
      renaming = list
    }
    if list.syncTarget != nil {
      Button("Sync Now") { Task { await store.sync(list) } }
    }
    Divider()
    Button("Delete List…", role: .destructive) { deleting = list }
      .disabled(store.lists.count < 2)
  }

  private var footer: some View {
    VStack(alignment: .leading, spacing: 0) {
      Divider()
      HStack {
        Button {
          newListPresented = true
        } label: {
          Label("New List", systemImage: "plus.circle")
        }
        .buttonStyle(.borderless)
        Spacer()
        accountStatus
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 9)
    }
  }

  @ViewBuilder private var accountStatus: some View {
    if store.storageMode == .online, store.isCloudSignedIn {
      Image(systemName: "icloud")
        .foregroundStyle(.secondary)
        .help(
          store.household.map { String(localized: "Shopping List Cloud · \($0.name)") }
            ?? String(localized: "Shopping List Cloud"))
    } else {
      Image(systemName: "laptopcomputer")
        .foregroundStyle(.secondary)
        .help(String(localized: "Offline: lists are stored on this Mac"))
    }
  }

  private var isRenaming: Binding<Bool> {
    Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })
  }

  private var isDeleting: Binding<Bool> {
    Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
  }

  private func rename(_ list: ShoppingListDefinition) {
    let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return }
    var renamed = list
    renamed.name = name
    store.updateList(renamed)
  }
}
