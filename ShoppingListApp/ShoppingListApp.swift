import SwiftUI

@main
struct ShoppingListApp: App {
  @StateObject private var store = AppStore()
  @Environment(\.scenePhase) private var scenePhase
  var body: some Scene {
    WindowGroup {
      ContentView().environmentObject(store)
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil {
          Task { await store.syncAll() }
        }
      } else {
        Task { await store.flushPersistence() }
      }
    }
  }
}

struct ContentView: View {
  @EnvironmentObject private var store: AppStore
  var body: some View {
    TabView {
      ShoppingListScreen()
        .tabItem { Label("Shopping List", systemImage: "checklist") }
      ShoppingScreen()
        .tabItem { Label("Shopping", systemImage: "cart.fill") }
      SettingsScreen()
        .tabItem { Label("Settings", systemImage: "gearshape.fill") }
    }
    .tint(.teal)
    .environment(\.locale, Locale(identifier: store.appLanguage.localeIdentifier))
  }
}
