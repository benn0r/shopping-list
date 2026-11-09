import SwiftUI

struct SettingsScreen: View {
  @EnvironmentObject private var store: AppStore
  @State private var editedList: ShoppingListDefinition?
  @State private var editedStore: StoreDefinition?
  @State private var addingList = false
  @State private var addingStore = false
  @State private var customBarcodesPresented = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Appearance") {
          Picker("List View", selection: $store.viewMode) {
            Text("List").tag(ListViewMode.list)
            Text("Tiles").tag(ListViewMode.tiles)
          }
          .accessibilityIdentifier("list-view-picker")
          .onChange(of: store.viewMode) { store.save() }
          Toggle("Show Category Labels", isOn: $store.showCategoryLabels)
            .accessibilityIdentifier("show-category-labels")
            .onChange(of: store.showCategoryLabels) { store.save() }
          Toggle(isOn: $store.oneTapShopping) {
            VStack(alignment: .leading, spacing: 2) {
              Text("One-Tap Shopping")
              Text("Tap an item to check it off. Hold it for details.")
                .font(.footnote).foregroundStyle(.secondary)
            }
          }
          .accessibilityIdentifier("one-tap-shopping")
          .onChange(of: store.oneTapShopping) { store.save() }
          Picker("App Language", selection: $store.appLanguage) {
            ForEach(AppLanguage.allCases) {
              language in
              // Languages are listed by their own names; only "Automatic" is translated.
              Group {
                if language == .automatic {
                  Text("Automatic")
                } else {
                  Text(verbatim: language.title)
                }
              }
              .tag(language)
            }
          }
          .accessibilityIdentifier("app-language-picker")
          .onChange(of: store.appLanguage) { store.save() }
        }
        Section("Shopping Lists") {
          ForEach(store.lists) { list in
            Button(list.name) { editedList = list }.foregroundStyle(.primary)
          }
          Button("Add List", systemImage: "plus") { addingList = true }
            .accessibilityIdentifier("add-list-button")
        }
        Section("Stores") {
          ForEach(store.stores) { value in
            Button(value.name) { editedStore = value }.foregroundStyle(.primary)
          }
          Button("Add Store", systemImage: "plus") { addingStore = true }
            .accessibilityIdentifier("add-store-button")
        }
        Section {
          Picker("Product Language", selection: $store.lookupPreferences.language) {
            ForEach(ProductLanguage.allCases) { language in
              Text(LocalizedStringKey(language.title)).tag(language)
            }
          }
          .accessibilityIdentifier("product-language-picker")
          Picker("Item Label", selection: $store.lookupPreferences.labelStyle) {
            ForEach(ProductLabelStyle.allCases) { style in
              Text(LocalizedStringKey(style.title)).tag(style)
            }
          }
          .accessibilityIdentifier("item-label-picker")
          Button {
            customBarcodesPresented = true
          } label: {
            HStack {
              Text("Custom Barcodes").foregroundStyle(.primary)
              Spacer()
              Text("\(store.customBarcodes.count)").foregroundStyle(.secondary)
              Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
          }
          .accessibilityIdentifier("custom-barcodes-button")
        } header: {
          Text("Product Lookup")
        } footer: {
          Text("Custom labels take priority over online product databases.")
        }
        .onChange(of: store.lookupPreferences) { store.save() }
        CloudAccountSection()
        if store.storageMode == .online && store.isCloudSignedIn { HouseholdSection() }
        ProviderSection(kind: .bring)
        ProviderSection(kind: .mealie)
        ProviderSection(kind: .server)
        Section {
          ProviderLink(
            title: "Open Food Facts", detail: "Food, drinks, ingredients, and nutrition",
            url: "https://world.openfoodfacts.org")
          ProviderLink(
            title: "Open Products Facts", detail: "Household and everyday non-food products",
            url: "https://world.openproductsfacts.org")
          ProviderLink(
            title: "Open Beauty Facts", detail: "Cosmetics, hygiene, and personal care",
            url: "https://world.openbeautyfacts.org")
          ProviderLink(
            title: "Open Pet Food Facts", detail: "Pet food and nutritional information",
            url: "https://world.openpetfoodfacts.org")
        } header: {
          Text("Product Data Providers")
        } footer: {
          Text(
            "Product information is supplied by third parties and may be incomplete or incorrect.")
        }
        Section("Credits") {
          ProviderLink(
            title: "Food Icon Pack", detail: "Grocery icon license",
            url: "https://foodiconpack.com/license")
        }
        Section {
          Text(
            "Shopping List is an independent application and is not affiliated with Bring! Labs AG or the Mealie project."
          ).font(.footnote).foregroundStyle(.secondary)
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .sheet(item: $editedList) { ListEditor(list: $0) }
      .sheet(item: $editedStore) { StoreEditor(store: $0) }
      .sheet(isPresented: $addingList) {
        ListEditor(list: ShoppingListDefinition(name: ""), isNew: true)
      }
      .sheet(isPresented: $addingStore) {
        StoreEditor(store: StoreDefinition(name: ""), isNew: true)
      }
      .sheet(isPresented: $customBarcodesPresented) { CustomBarcodeManager() }
    }
  }
}

private struct CustomBarcodeManager: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  @State private var barcode = ""
  @State private var label = ""

  private var normalizedBarcode: String { barcode.filter(\.isNumber) }
  private var canSave: Bool {
    (8...14).contains(normalizedBarcode.count)
      && !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Barcode", text: $barcode)
            .keyboardType(.numberPad)
            .textContentType(.none)
            .accessibilityIdentifier("custom-barcode-field")
          TextField("Product name", text: $label)
            .accessibilityIdentifier("custom-product-name-field")
          Button("Save Barcode") {
            store.saveCustomBarcode(barcode: barcode, label: label)
            barcode = ""
            label = ""
          }
          .accessibilityIdentifier("save-custom-barcode")
          .disabled(!canSave)
        } header: {
          Text("Add Custom Barcode")
        } footer: {
          Text("Enter an EAN or UPC barcode containing 8–14 digits.")
        }
        if !store.customBarcodes.isEmpty {
          Section("Saved Barcodes") {
            ForEach(store.customBarcodes) { value in
              VStack(alignment: .leading, spacing: 3) {
                Text(value.label)
                Text(value.barcode).font(.footnote).foregroundStyle(.secondary)
              }
            }
            .onDelete { offsets in
              let values = offsets.map { store.customBarcodes[$0] }
              values.forEach(store.deleteCustomBarcode)
            }
          }
        }
      }
      .navigationTitle("Custom Barcodes")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
      }
    }
    .presentationDetents([.large])
  }
}

private struct ProviderLink: View {
  let title: String
  let detail: String
  let url: String

  var body: some View {
    Link(destination: URL(string: url)!) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text(title).foregroundStyle(.primary)
          Text(detail).font(.footnote).foregroundStyle(.secondary)
        }
        Spacer()
        Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold))
      }
    }
  }
}

private struct ProviderSection: View {
  @EnvironmentObject private var store: AppStore
  let kind: ProviderKind
  var config: Binding<ProviderConfiguration> {
    Binding(
      get: { store.providerConfigurations[kind] ?? .init() },
      set: {
        store.providerConfigurations[kind] = $0
        store.save()
      })
  }
  var enabled: Binding<Bool> {
    Binding(
      get: { config.wrappedValue.enabled },
      set: { value in
        var updated = config.wrappedValue
        updated.enabled = value
        config.wrappedValue = updated
      }
    )
  }
  var body: some View {
    Section {
      Toggle(isOn: enabled) {
        Text("Enable \(kind.title) Sync")
          .contentShape(Rectangle())
      }
      .accessibilityIdentifier("enable-\(kind.rawValue)-sync")
      if config.wrappedValue.enabled {
        switch kind {
        case .mealie, .server, .cloud:
          TextField("Server URL", text: config.serverURL).textInputAutocapitalization(.never)
            .keyboardType(.URL)
            .autocorrectionDisabled()
            .accessibilityIdentifier("\(kind.rawValue)-server-url")
        case .bring:
          TextField("API URL (optional)", text: config.serverURL).textInputAutocapitalization(
            .never
          ).keyboardType(.URL)
            .accessibilityIdentifier("bring-api-url")
        }
        if kind != .server {
          TextField(kind == .bring ? "Email" : "Username", text: config.username)
            .textInputAutocapitalization(.never)
            .accessibilityIdentifier("\(kind.rawValue)-username")
        }
        SecureField(secretTitle, text: config.secret)
          .accessibilityIdentifier("\(kind.rawValue)-secret")
      }
    } header: {
      Text("\(kind.title) Sync")
    } footer: {
      if kind == .server && config.wrappedValue.enabled {
        Text("Create an API key in the server's web interface under Settings → API Tokens.")
      }
    }
  }
  private var secretTitle: LocalizedStringKey {
    switch kind {
    case .bring: "Password"
    case .mealie: "API Token"
    case .server, .cloud: "API Key"
    }
  }
}

private struct ListEditor: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  @State private var list: ShoppingListDefinition
  let isNew: Bool
  @State private var storage: ListStorage
  @State private var remoteLists: [ProviderList] = []
  @State private var loadingRemoteLists = false
  @State private var remoteListError: String?
  @State private var isWorking = false
  @State private var cloudFailure: String?
  @State private var infoPresented = false

  init(list: ShoppingListDefinition, isNew: Bool = false) {
    _list = State(initialValue: list)
    self.isNew = isNew
    let storage: ListStorage =
      switch list.syncTarget?.provider {
      case nil: .local
      case .cloud: .cloud
      default: .connected
      }
    _storage = State(initialValue: storage)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("List name", text: $list.name)
            .accessibilityIdentifier("list-name-field")
        }
        if isNew {
          newListStorage
        } else {
          existingListStorage
          if list.syncTarget?.provider != .cloud { syncedListSection }
          Section {
            Button("Delete List", role: .destructive) {
              store.deleteList(list)
              dismiss()
            }
          }
        }
      }
      .navigationTitle(isNew ? "Add List" : "Edit List")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          if isWorking {
            ProgressView()
          } else {
            Button("Save") { Task { await save() } }
              .disabled(!canSave)
              .accessibilityIdentifier("save-list-button")
          }
        }
      }
      .onAppear {
        if isNew, list.syncTarget == nil { storage = storageOptions[0] }
      }
      .onChange(of: storage) { _, value in
        if value != .connected { list.syncTarget = nil }
        cloudFailure = nil
      }
      .task(id: list.syncTarget?.provider) {
        await loadRemoteLists()
      }
      .sheet(isPresented: $infoPresented) { CloudInfoSheet() }
    }.presentationDetents([.large])
  }

  /// Online stores new lists in Cloud, offline on this iPhone; both can use connected services.
  private var storageOptions: [ListStorage] {
    [store.storageMode == .online ? .cloud : .local] + (hasConnectedProviders ? [.connected] : [])
  }

  @ViewBuilder private var newListStorage: some View {
    Section {
      if storageOptions.count > 1 {
        StoragePicker(selection: $storage, options: storageOptions)
      } else {
        LabeledContent("Stored In") { Text(storageTitle(for: storage)) }
          .accessibilityIdentifier("list-storage")
      }
    } header: {
      if storageOptions.count > 1 { Text("Stored In") }
    } footer: {
      if storage == .cloud {
        CloudFootnote { infoPresented = true }
      }
    }
    if cloudFailure != nil { Section { cloudFailureText } }
    if storage == .connected { syncedListSection }
  }

  private var existingListStorage: some View {
    Section {
      LabeledContent("Stored In") {
        Text(storageTitle(for: list.syncTarget?.provider))
      }
      .accessibilityIdentifier("list-storage")
    }
  }

  @ViewBuilder private var cloudFailureText: some View {
    if let cloudFailure {
      Text(cloudFailure).foregroundStyle(.red).accessibilityIdentifier("list-cloud-error")
    }
  }

  private var syncedListSection: some View {
    Section("Synced List") {
      Picker(
        "Provider",
        selection: Binding(
          get: { list.syncTarget?.provider },
          set: { provider in
            list.syncTarget = provider.map {
              SyncTarget(provider: $0, remoteListID: "", remoteListName: "")
            }
          })
      ) {
        // Online has no lists on this iPhone, so a connected list can't be turned into one.
        if store.storageMode != .online || isNew {
          Text("None").tag(nil as ProviderKind?)
        }
        ForEach(ProviderKind.connectable.filter { providerEnabled($0) }) {
          Text($0.title).tag(Optional($0))
        }
      }
      if let target = list.syncTarget, !remoteLists.isEmpty {
        Picker(
          "Provider List",
          selection: Binding(
            get: { target.remoteListID },
            set: { id in
              list.syncTarget?.remoteListID = id
              list.syncTarget?.remoteListName =
                remoteLists.first(where: { $0.id == id })?.name ?? ""
            })
        ) {
          ForEach(remoteLists) { Text($0.name).tag($0.id) }
        }
      } else if loadingRemoteLists {
        HStack {
          ProgressView()
          Text("Loading provider lists…").foregroundStyle(.secondary)
        }
      } else if let remoteListError {
        VStack(alignment: .leading, spacing: 8) {
          Text(remoteListError).font(.footnote).foregroundStyle(.red)
          Button("Try Again") { Task { await loadRemoteLists() } }
        }
      }
    }
  }

  private var trimmedName: String { list.name.trimmingCharacters(in: .whitespaces) }

  private var canSave: Bool {
    guard !trimmedName.isEmpty else { return false }
    guard isNew else { return true }
    switch storage {
    case .local: return true
    case .cloud: return store.isCloudSignedIn
    case .connected: return list.syncTarget?.remoteListID.isEmpty == false
    }
  }

  private func storageTitle(for storage: ListStorage) -> LocalizedStringKey {
    switch storage {
    case .local: "On this iPhone"
    case .cloud: "Shopping List Cloud"
    case .connected: "Connected service"
    }
  }

  private func storageTitle(for provider: ProviderKind?) -> LocalizedStringKey {
    switch provider {
    case nil: "On this iPhone"
    case .cloud: "Shopping List Cloud"
    case .bring: "Bring"
    case .mealie: "Mealie"
    case .server: "Shopping List Server"
    }
  }

  private var hasConnectedProviders: Bool {
    ProviderKind.connectable.contains { store.providerConfigurations[$0]?.enabled == true }
  }

  private func save() async {
    guard !trimmedName.isEmpty else { return }
    guard isNew else {
      store.updateList(list)
      dismiss()
      return
    }
    switch storage {
    case .local: store.createList(name: trimmedName)
    case .connected: store.createList(name: trimmedName, target: list.syncTarget)
    case .cloud:
      isWorking = true
      defer { isWorking = false }
      do {
        try await store.createCloudList(name: trimmedName)
      } catch {
        cloudFailure = String(
          localized: "Couldn't reach Shopping List Cloud. Please try again.")
        return
      }
    }
    dismiss()
  }

  private func providerEnabled(_ provider: ProviderKind) -> Bool {
    store.providerConfigurations[provider]?.enabled == true
      || list.syncTarget?.provider == provider
  }

  private func loadRemoteLists() async {
    guard let kind = list.syncTarget?.provider, kind != .cloud,
      let config = store.providerConfigurations[kind], config.enabled
    else {
      remoteLists = []
      remoteListError =
        list.syncTarget == nil || list.syncTarget?.provider == .cloud
        ? nil : String(localized: "Enable and configure this provider first.")
      return
    }
    loadingRemoteLists = true
    remoteListError = nil
    defer { loadingRemoteLists = false }
    do {
      remoteLists = try await ProviderFactory.make(kind: kind, configuration: config).lists()
      if remoteLists.isEmpty {
        remoteListError = "No shopping lists were returned by \(kind.title)."
      } else if list.syncTarget?.remoteListID.isEmpty == true, let first = remoteLists.first {
        list.syncTarget?.remoteListID = first.id
        list.syncTarget?.remoteListName = first.name
      }
    } catch {
      remoteLists = []
      remoteListError = error.localizedDescription
    }
  }
}

private struct StoreEditor: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  @State var storeValue: StoreDefinition
  var isNew: Bool
  init(store: StoreDefinition, isNew: Bool = false) {
    _storeValue = State(initialValue: store)
    self.isNew = isNew
  }
  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Store name", text: $storeValue.name)
            .accessibilityIdentifier("store-name-field")
        }
        if !isNew {
          Section {
            Button("Delete Store", role: .destructive) {
              store.deleteStore(storeValue)
              dismiss()
            }
          }
        }
      }
      .navigationTitle(isNew ? "Add Store" : "Edit Store")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            if isNew {
              store.createStore(name: storeValue.name)
            } else if let i = store.stores.firstIndex(where: { $0.id == storeValue.id }) {
              store.stores[i] = storeValue
              store.save()
            }
            dismiss()
          }.disabled(storeValue.name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
      }
    }.presentationDetents([.medium, .large])
  }
}
