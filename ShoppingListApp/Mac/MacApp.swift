import SwiftUI

@main
struct ShoppingListMacApp: App {
  @StateObject private var store = AppStore()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup("Shopping List", id: "main") {
      MacRootView()
        .environmentObject(store)
        .tint(.shoppingAccent)
        .environment(\.locale, Locale(identifier: store.appLanguage.localeIdentifier))
        .frame(minWidth: 500, minHeight: 400)
    }
    .defaultSize(width: 1040, height: 720)
    .commands { MacCommands() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        if !MacEnvironment.isRunningTests { Task { await store.backgroundSync() } }
      } else {
        Task { await store.flushPersistence() }
      }
    }

    Settings {
      MacSettingsView()
        .environmentObject(store)
        .tint(.shoppingAccent)
        .environment(\.locale, Locale(identifier: store.appLanguage.localeIdentifier))
    }
  }
}

enum MacEnvironment {
  static var isRunningTests: Bool {
    ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
  }
}

// MARK: Menu commands

/// What the menu bar can do in the frontmost window.
struct MacWindowActions {
  var newItem: () -> Void
  var newList: () -> Void
  var sync: (() -> Void)?
  var toggleInspector: () -> Void
  var removeSelection: (() -> Void)?
}

private struct MacWindowActionsKey: FocusedValueKey {
  typealias Value = MacWindowActions
}

extension FocusedValues {
  var macWindowActions: MacWindowActions? {
    get { self[MacWindowActionsKey.self] }
    set { self[MacWindowActionsKey.self] = newValue }
  }
}

struct MacCommands: Commands {
  @FocusedValue(\.macWindowActions) private var actions

  var body: some Commands {
    CommandGroup(replacing: .newItem) {
      Button("New Item") { actions?.newItem() }
        .keyboardShortcut("n")
        .disabled(actions == nil)
      Button("New List…") { actions?.newList() }
        .keyboardShortcut("n", modifiers: [.command, .shift])
        .disabled(actions == nil)
    }
    CommandGroup(after: .sidebar) {
      Button("Show Item Info") { actions?.toggleInspector() }
        .keyboardShortcut("i", modifiers: [.command, .option])
        .disabled(actions == nil)
    }
    CommandMenu("List") {
      Button("Sync Now") { actions?.sync?() }
        .keyboardShortcut("r")
        .disabled(actions?.sync == nil)
      Divider()
      Button("Remove Selected Items") { actions?.removeSelection?() }
        .keyboardShortcut(.delete, modifiers: [.command])
        .disabled(actions?.removeSelection == nil)
    }
  }
}
