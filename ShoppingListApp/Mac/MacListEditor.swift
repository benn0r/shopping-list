import SwiftUI

/// "New List" sheet: a name, and where the list is stored (on this Mac or in Cloud, or linked to
/// a list in Bring, Mealie or a Shopping List Server).
struct MacListEditor: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var storage: ListStorage = .local
  @State private var provider: ProviderKind?
  @State private var remoteLists: [ProviderList] = []
  @State private var remoteListID = ""
  @State private var isLoading = false
  @State private var isWorking = false
  @State private var failure: String?

  /// Online stores new lists in Cloud, offline on this Mac; both can use connected services.
  private var storageOptions: [ListStorage] {
    [store.storageMode == .online ? .cloud : .local] + (connectedProviders.isEmpty ? [] : [.connected])
  }

  private var connectedProviders: [ProviderKind] {
    ProviderKind.connectable.filter { store.providerConfigurations[$0]?.enabled == true }
  }

  private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

  private var canSave: Bool {
    guard !trimmedName.isEmpty, !isWorking else { return false }
    switch storage {
    case .local: return true
    case .cloud: return store.isCloudSignedIn
    case .connected: return provider != nil && !remoteListID.isEmpty
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      Form {
        TextField("Name", text: $name, prompt: Text("Groceries"))
        if storageOptions.count > 1 {
          Picker("Stored In", selection: $storage) {
            ForEach(storageOptions, id: \.self) { Text(title(for: $0)).tag($0) }
          }
          .pickerStyle(.radioGroup)
        } else {
          LabeledContent("Stored In", value: title(for: storage))
        }
        if storage == .connected {
          Picker("Service", selection: $provider) {
            ForEach(connectedProviders) { Text($0.title).tag(Optional($0)) }
          }
          if isLoading {
            LabeledContent("List") { ProgressView().controlSize(.small) }
          } else if !remoteLists.isEmpty {
            Picker("List", selection: $remoteListID) {
              ForEach(remoteLists) { Text($0.name).tag($0.id) }
            }
          }
        }
        if let failure {
          Text(failure).foregroundStyle(.red).font(.callout)
        }
      }
      .formStyle(.grouped)
      .scrollDisabled(true)
      HStack {
        Spacer()
        Button("Cancel", role: .cancel) { dismiss() }
          .keyboardShortcut(.cancelAction)
        Button("Create") { Task { await save() } }
          .keyboardShortcut(.defaultAction)
          .disabled(!canSave)
      }
      .padding([.horizontal, .bottom], 20)
    }
    .frame(width: 420)
    .fixedSize(horizontal: false, vertical: true)
    .navigationTitle("New List")
    .onAppear { storage = storageOptions[0] }
    .onChange(of: storage) { _, value in
      failure = nil
      if value == .connected, provider == nil { provider = connectedProviders.first }
    }
    .task(id: storage == .connected ? provider : nil) { await loadRemoteLists() }
  }

  private func title(for storage: ListStorage) -> String {
    switch storage {
    case .local: String(localized: "On this Mac")
    case .cloud: String(localized: "Shopping List Cloud")
    case .connected: String(localized: "Connected service")
    }
  }

  private func loadRemoteLists() async {
    remoteLists = []
    remoteListID = ""
    guard storage == .connected, let provider,
      let configuration = store.providerConfigurations[provider]
    else { return }
    isLoading = true
    failure = nil
    defer { isLoading = false }
    do {
      remoteLists = try await ProviderFactory.make(kind: provider, configuration: configuration)
        .lists()
      remoteListID = remoteLists.first?.id ?? ""
      if remoteLists.isEmpty {
        failure = String(localized: "No shopping lists were returned by \(provider.title).")
      }
    } catch {
      failure = error.localizedDescription
    }
  }

  private func save() async {
    let list: ShoppingListDefinition
    switch storage {
    case .local:
      list = store.createList(name: trimmedName)
    case .connected:
      guard let provider else { return }
      let remoteName = remoteLists.first { $0.id == remoteListID }?.name ?? ""
      list = store.createList(
        name: trimmedName,
        target: SyncTarget(provider: provider, remoteListID: remoteListID, remoteListName: remoteName))
      Task { await store.sync(list) }
    case .cloud:
      isWorking = true
      defer { isWorking = false }
      do {
        try await store.createCloudList(name: trimmedName)
      } catch {
        failure = String(localized: "Couldn't reach Shopping List Cloud. Please try again.")
        return
      }
      guard let created = store.lists.last else { return }
      list = created
    }
    store.activeListID = list.id
    store.save()
    dismiss()
  }
}
