import SwiftUI

/// The main window: lists in the sidebar, the selected list's items as tiles on the right.
struct MacRootView: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.openSettings) private var openSettings
  @State private var columnVisibility = NavigationSplitViewVisibility.all
  @State private var newListPresented = false
  @State private var invite: MacPendingInvite?

  var body: some View {
    NavigationSplitView(columnVisibility: $columnVisibility) {
      MacSidebar(newListPresented: $newListPresented)
        .navigationSplitViewColumnWidth(min: 190, ideal: 230, max: 320)
    } detail: {
      MacListView(newListPresented: $newListPresented)
        // A new view per list: the add field, selection and scroll position belong to one list.
        .id(store.activeListID)
    }
    .sheet(isPresented: $newListPresented) { MacListEditor() }
    .sheet(item: $invite) { JoinHouseholdSheet(invite: $0.token).frame(width: 440, height: 380) }
    .sheet(isPresented: Binding(get: { store.needsModeChoice }, set: { _ in })) {
      MacWelcomeSheet()
    }
    .alert(
      "Something Went Wrong",
      isPresented: Binding(
        get: { store.errorMessage != nil },
        set: { if !$0 { store.errorMessage = nil } })
    ) {
      Button("OK") { store.errorMessage = nil }
    } message: {
      Text(store.errorMessage ?? "")
    }
    // Invite links (universal links to /app/invite/<token>, or shoppinglist://invite/<token>).
    .onOpenURL { url in
      if let token = InviteLink.token(in: url) { invite = MacPendingInvite(token: token) }
    }
    .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
      if let url = activity.webpageURL, let token = InviteLink.token(in: url) {
        invite = MacPendingInvite(token: token)
      }
    }
    // Server events while the window is active.
    .task(id: store.liveUpdateKey(isActive: scenePhase == .active)) {
      guard scenePhase == .active, !MacEnvironment.isRunningTests else { return }
      await store.runLiveUpdates()
    }
    .task {
      #if DEBUG
        MacDebugSnapshot.scheduleIfRequested()
        if ProcessInfo.processInfo.arguments.contains("-snapshot-settings") { openSettings() }
      #endif
      guard !MacEnvironment.isRunningTests else { return }
      await store.verifyCloudCredential()
      await store.backgroundSync()
    }
  }
}

private struct MacPendingInvite: Identifiable {
  let token: String
  var id: String { token }
}

// MARK: Shared helpers

extension ShoppingListDefinition {
  /// The sidebar symbol for where the list is stored.
  var macSymbol: String {
    switch syncTarget?.provider {
    case nil: "list.bullet"
    case .cloud: "icloud"
    case .bring, .mealie, .server: "link"
    }
  }

  var storageDescription: String {
    switch syncTarget?.provider {
    case nil: String(localized: "On this Mac")
    case .cloud: String(localized: "Shopping List Cloud")
    case .bring: "Bring"
    case .mealie: "Mealie"
    case .server: String(localized: "Shopping List Server")
    }
  }
}

extension ShoppingItem {
  /// "2 kg" or "3×", or nil without a quantity.
  var amountText: String? {
    guard let quantity else { return nil }
    if let unit, !unit.isEmpty { return "\(quantity.formatted()) \(unit)" }
    return "\(quantity.formatted())×"
  }
}
