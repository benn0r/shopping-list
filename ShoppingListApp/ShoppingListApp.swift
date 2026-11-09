import SwiftUI

extension Color {
  static let shoppingAccent = Color(red: 0.04, green: 0.53, blue: 0.47)
  static let shoppingMint = Color(red: 0.48, green: 0.82, blue: 0.67)
  static let shoppingWarm = Color(red: 0.96, green: 0.62, blue: 0.35)
}

#if os(iOS)
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
  /// The Shopping or Settings tab for demo screenshots (`-demo-screen`), else the list.
  private static var initialTab: Int {
    #if DEBUG
      if Demo.isActive {
        switch Demo.screen {
        case "shopping": return 1
        case "settings": return 2
        default: return 0
        }
      }
    #endif
    return 0
  }

  @EnvironmentObject private var store: AppStore
  @Environment(\.scenePhase) private var scenePhase
  @State private var tab = ContentView.initialTab
  @State private var invite: PendingInvite?
  var body: some View {
    TabView(selection: $tab) {
      ShoppingListScreen()
        .tabItem { Label("Shopping List", systemImage: "checklist") }
        .tag(0)
      ShoppingScreen()
        .tabItem { Label("Shopping", systemImage: "cart.fill") }
        .tag(1)
      SettingsScreen()
        .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        .tag(2)
    }
    .tint(.shoppingAccent)
    .environment(\.locale, Locale(identifier: store.appLanguage.localeIdentifier))
    // Invite links (universal links to /app/invite/<token>, or shoppinglist://invite/<token>).
    .onOpenURL { url in
      if let token = InviteLink.token(in: url) { invite = PendingInvite(token: token) }
    }
    .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
      if let url = activity.webpageURL, let token = InviteLink.token(in: url) {
        invite = PendingInvite(token: token)
      }
    }
    .sheet(item: $invite) { JoinHouseholdSheet(invite: $0.token).environmentObject(store) }
    .fullScreenCover(isPresented: Binding(get: { store.needsModeChoice }, set: { _ in })) {
      ModeChoiceScreen()
        .environmentObject(store)
        .tint(.shoppingAccent)
        .environment(\.locale, Locale(identifier: store.appLanguage.localeIdentifier))
    }
    // Server events while the app is active: opened on activation, closed in the background and
    // reopened when the servers or keys change.
    .task(id: store.liveUpdateKey(isActive: scenePhase == .active)) {
      guard scenePhase == .active,
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil
      else { return }
      await store.runLiveUpdates()
    }
    .task {
      guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else {
        return
      }
      await store.verifyCloudCredential()
      await store.backgroundSync()
    }
  }
}

private struct PendingInvite: Identifiable {
  let token: String
  var id: String { token }
}
#endif
