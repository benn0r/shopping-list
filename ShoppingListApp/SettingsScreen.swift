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
          Picker("App Language", selection: $store.appLanguage) {
            ForEach(AppLanguage.allCases) {
              language in Text(LocalizedStringKey(language.title)).tag(language)
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
        case .mealie, .server:
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
    case .server: "API Key"
    }
  }
}

private struct ListEditor: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  @State var list: ShoppingListDefinition
  var isNew = false
  @State private var remoteLists: [ProviderList] = []
  @State private var loadingRemoteLists = false
  @State private var remoteListError: String?
  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("List name", text: $list.name)
            .accessibilityIdentifier("list-name-field")
        }
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
            Text("None").tag(nil as ProviderKind?)
            ForEach(ProviderKind.allCases.filter { providerEnabled($0) }) {
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
        if !isNew {
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
          Button("Save") {
            isNew
              ? store.createList(name: list.name, target: list.syncTarget) : store.updateList(list)
            dismiss()
          }.disabled(list.name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
      }
      .task(id: list.syncTarget?.provider) {
        await loadRemoteLists()
      }
    }.presentationDetents([.medium, .large])
  }

  private func providerEnabled(_ provider: ProviderKind) -> Bool {
    store.providerConfigurations[provider]?.enabled == true
      || list.syncTarget?.provider == provider
  }

  private func loadRemoteLists() async {
    guard let kind = list.syncTarget?.provider, let config = store.providerConfigurations[kind],
      config.enabled
    else {
      remoteLists = []
      remoteListError = list.syncTarget == nil ? nil : "Enable and configure this provider first."
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
