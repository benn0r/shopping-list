import SwiftUI

/// The Settings window (⌘,).
struct MacSettingsView: View {
  @State private var tab = Self.initialTab

  var body: some View {
    TabView(selection: $tab) {
      MacGeneralSettings()
        .tabItem { Label("General", systemImage: "gearshape") }
        .tag(0)
      MacAccountSettings()
        .tabItem { Label("Account", systemImage: "person.crop.circle") }
        .tag(1)
      MacServicesSettings()
        .tabItem { Label("Services", systemImage: "link") }
        .tag(2)
      MacAboutSettings()
        .tabItem { Label("About", systemImage: "info.circle") }
        .tag(3)
    }
    .frame(width: 520)
  }

  /// `-snapshot-settings=<tab index>` opens a tab other than General (screenshots).
  private static var initialTab: Int {
    #if DEBUG
      let argument = ProcessInfo.processInfo.arguments.first { $0.hasPrefix("-snapshot-settings=") }
      return argument.flatMap { Int($0.split(separator: "=")[1]) } ?? 0
    #else
      return 0
    #endif
  }
}

private struct MacGeneralSettings: View {
  @EnvironmentObject private var store: AppStore

  var body: some View {
    Form {
      Section {
        Toggle("Group items by category", isOn: $store.showCategoryLabels)
          .onChange(of: store.showCategoryLabels) { store.save() }
        Picker("Language", selection: $store.appLanguage) {
          ForEach(AppLanguage.allCases) { language in
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
        .onChange(of: store.appLanguage) { store.save() }
      }
      Section {
        Picker("Product language", selection: $store.lookupPreferences.language) {
          ForEach(ProductLanguage.allCases) { Text(LocalizedStringKey($0.title)).tag($0) }
        }
      } header: {
        Text("Product Lookup")
      } footer: {
        Text("Used for items with a barcode, for example ones scanned on iPhone.")
          .foregroundStyle(.secondary)
      }
      .onChange(of: store.lookupPreferences) { store.save() }
    }
    .formStyle(.grouped)
    .fixedSize(horizontal: false, vertical: true)
  }
}

private struct MacAccountSettings: View {
  @EnvironmentObject private var store: AppStore

  var body: some View {
    Form {
      CloudAccountSection()
      if store.storageMode == .online && store.isCloudSignedIn { HouseholdSection() }
    }
    .formStyle(.grouped)
    .frame(minHeight: 320)
  }
}

private struct MacServicesSettings: View {
  var body: some View {
    Form {
      ForEach(ProviderKind.connectable) { MacProviderSection(kind: $0) }
    }
    .formStyle(.grouped)
    .frame(minHeight: 420)
  }
}

private struct MacProviderSection: View {
  @EnvironmentObject private var store: AppStore
  let kind: ProviderKind

  private var configuration: Binding<ProviderConfiguration> {
    Binding(
      get: { store.providerConfigurations[kind] ?? .init() },
      set: {
        store.providerConfigurations[kind] = $0
        store.save()
      })
  }

  var body: some View {
    Section {
      Toggle("Sync with \(kind.title)", isOn: configuration.enabled)
      if configuration.wrappedValue.enabled {
        switch kind {
        case .bring:
          TextField("API URL", text: configuration.serverURL, prompt: Text("Optional"))
        case .mealie, .server, .cloud:
          TextField("Server URL", text: configuration.serverURL, prompt: Text("https://"))
        }
        if kind != .server {
          TextField(kind == .bring ? "Email" : "Username", text: configuration.username)
            .textContentType(.username)
        }
        SecureField(secretTitle, text: configuration.secret)
      }
    } header: {
      Text(kind.title)
    } footer: {
      if kind == .server && configuration.wrappedValue.enabled {
        Text("Create an API key in the server's web interface under Settings → API Tokens.")
          .foregroundStyle(.secondary)
      }
    }
    .autocorrectionDisabled()
  }

  private var secretTitle: LocalizedStringKey {
    switch kind {
    case .bring: "Password"
    case .mealie: "API Token"
    case .server, .cloud: "API Key"
    }
  }
}

private struct MacAboutSettings: View {
  var body: some View {
    Form {
      Section("Product Data Providers") {
        link("Open Food Facts", "https://world.openfoodfacts.org")
        link("Open Products Facts", "https://world.openproductsfacts.org")
        link("Open Beauty Facts", "https://world.openbeautyfacts.org")
        link("Open Pet Food Facts", "https://world.openpetfoodfacts.org")
      }
      Section("Credits") {
        link("Food Icon Pack (CC BY 4.0)", "https://foodiconpack.com/license")
      }
      Section {
        Text(
          "Shopping List is an independent application and is not affiliated with Bring! Labs AG or the Mealie project."
        )
        .foregroundStyle(.secondary)
      }
    }
    .formStyle(.grouped)
    .fixedSize(horizontal: false, vertical: true)
  }

  private func link(_ title: String, _ url: String) -> some View {
    Link(destination: URL(string: url)!) {
      LabeledContent(title) { Image(systemName: "arrow.up.right.square") }
    }
    .foregroundStyle(.primary)
  }
}
