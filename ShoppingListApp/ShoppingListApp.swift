import SwiftUI

extension Color {
  static let shoppingAccent = Color(red: 0.04, green: 0.53, blue: 0.47)
  static let shoppingMint = Color(red: 0.48, green: 0.82, blue: 0.67)
  static let shoppingWarm = Color(red: 0.96, green: 0.62, blue: 0.35)
}

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
          Task {
            await store.backgroundSync()
          }
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
    .tint(.shoppingAccent)
    .environment(\.locale, Locale(identifier: store.appLanguage.localeIdentifier))
    .task {
      guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else {
        return
      }
      await store.backgroundSync()
    }
  }
}
