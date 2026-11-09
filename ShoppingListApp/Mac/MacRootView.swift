import AppKit
import SwiftUI

/// The main window: lists in the sidebar, the selected list's items as tiles on the right.
struct MacRootView: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.openSettings) private var openSettings
  @State private var columnVisibility = NavigationSplitViewVisibility.all
  @State private var newListPresented = false
  @State private var invite: MacPendingInvite?
  @State private var selection: Set<UUID> = []
  @State private var inspectorPresented = false
  // Window width, and whether the sidebar or inspector was closed for lack of room (and so comes
  // back when the window grows again).
  @State private var windowWidth: CGFloat = 0
  @State private var sidebarAutoHidden = false
  @State private var inspectorAutoHidden = false

  private var selectedItems: [ShoppingItem] {
    store.activeItems.filter { selection.contains($0.id) }
  }

  var body: some View {
    NavigationSplitView(columnVisibility: $columnVisibility) {
      MacSidebar(newListPresented: $newListPresented)
        .navigationSplitViewColumnWidth(min: 190, ideal: 230, max: 320)
    } detail: {
      MacListView(
        newListPresented: $newListPresented, selection: $selection,
        inspectorPresented: $inspectorPresented, sidebarShown: sidebarShown
      )
      // A new view per list: the add field and scroll position belong to one list.
      .id(store.activeListID)
    }
    // On the split view rather than the detail column, the inspector gets its own part of the
    // toolbar, and the list's toolbar items move left of it while it is open.
    .inspector(isPresented: $inspectorPresented) {
      MacItemInspector(items: selectedItems, markBought: remove, delete: remove)
        .inspectorColumnWidth(min: 250, ideal: 290, max: 380)
        .toolbar {
          // Kept only while open, so they don't stay in the window toolbar when it closes.
          if inspectorPresented {
            // Buttons at the trailing edge, where the Info button was before the inspector opened.
            if #available(macOS 26, *) { ToolbarSpacer(.flexible, placement: .primaryAction) }
            ToolbarItem(placement: .primaryAction) {
              Button(role: .destructive) {
                remove(selectedItems)
              } label: {
                Label("Delete", systemImage: "trash")
              }
              .disabled(selection.isEmpty)
              .help("Delete the selected items (⌘⌫)")
            }
            ToolbarItem(placement: .primaryAction) {
              Button {
                inspectorPresented = false
              } label: {
                Label("Hide Info", systemImage: "info.circle")
              }
              .help("Hide item info (⌥⌘I)")
            }
          }
        }
    }
    .onChange(of: store.activeListID) { selection = [] }
    // The window's own width: SwiftUI stops reporting a smaller size once the columns are at
    // their minimum widths, which is exactly when they need to collapse.
    .background {
      MacWindowWidthReader { width in
        adaptLayout(from: windowWidth, to: width)
        windowWidth = width
      }
    }
    .onChange(of: inspectorPresented) { _, presented in
      inspectorAutoHidden = false
      if presented {
        // Opened in a narrow window: make room by hiding the sidebar.
        if sidebarShown && !fits(sidebar: true, inspector: true) { hideSidebar() }
      } else if sidebarAutoHidden && fits(sidebar: true, inspector: false) {
        showSidebar()
      }
    }
    .onChange(of: columnVisibility) { _, visibility in
      guard visibility != .detailOnly else { return }
      sidebarAutoHidden = false
      // Sidebar shown in a narrow window: the inspector gives way.
      if inspectorPresented && !fits(sidebar: true, inspector: true) { hideInspector() }
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

// MARK: Narrow windows

/// Reports the width of the window it is in, now and whenever the window is resized.
private struct MacWindowWidthReader: NSViewRepresentable {
  let onChange: (CGFloat) -> Void

  func makeNSView(context: Context) -> ReaderView { ReaderView(onChange: onChange) }
  func updateNSView(_ view: ReaderView, context: Context) { view.onChange = onChange }

  final class ReaderView: NSView {
    var onChange: (CGFloat) -> Void
    private var observer: NSObjectProtocol?

    init(onChange: @escaping (CGFloat) -> Void) {
      self.onChange = onChange
      super.init(frame: .zero)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let observer { NotificationCenter.default.removeObserver(observer) }
      observer = nil
      guard let window else { return }
      observer = NotificationCenter.default.addObserver(
        forName: NSWindow.didResizeNotification, object: window, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated { self?.report() }
      }
      DispatchQueue.main.async { [weak self] in self?.report() }
    }

    private func report() {
      guard let window else { return }
      onChange(window.contentLayoutRect.width)
    }
  }
}

extension MacRootView {
  /// Widths the columns need: two columns of tiles, and the sidebar and inspector at their ideal
  /// widths.
  private enum Width {
    static let content: CGFloat = 300
    static let sidebar: CGFloat = 230
    static let inspector: CGFloat = 290
  }

  private var sidebarShown: Bool { columnVisibility != .detailOnly }

  private func fits(sidebar: Bool, inspector: Bool, width: CGFloat? = nil) -> Bool {
    let needed =
      Width.content + (sidebar ? Width.sidebar : 0) + (inspector ? Width.inspector : 0)
    return (width ?? windowWidth) >= needed
  }

  /// Like Mail: as the window gets narrower the inspector closes first, then the sidebar; as it
  /// gets wider they come back in reverse order, but only if they were closed for lack of room.
  fileprivate func adaptLayout(from oldWidth: CGFloat, to width: CGFloat) {
    guard oldWidth > 0 else { return }
    if width < oldWidth {
      if inspectorPresented && !fits(sidebar: sidebarShown, inspector: true, width: width) {
        hideInspector()
      }
      if sidebarShown && !fits(sidebar: true, inspector: inspectorPresented, width: width) {
        hideSidebar()
      }
    } else if width > oldWidth {
      if sidebarAutoHidden && fits(sidebar: true, inspector: inspectorPresented, width: width) {
        showSidebar()
      }
      if inspectorAutoHidden && fits(sidebar: sidebarShown, inspector: true, width: width) {
        inspectorPresented = true
      }
    }
  }

  private func hideInspector() {
    inspectorPresented = false
    // After the onChange that clears the flag for changes made by hand.
    DispatchQueue.main.async { inspectorAutoHidden = true }
  }

  private func hideSidebar() {
    columnVisibility = .detailOnly
    sidebarAutoHidden = true
  }

  private func showSidebar() {
    columnVisibility = .all
    sidebarAutoHidden = false
  }
}

extension MacRootView {
  fileprivate func remove(_ values: [ShoppingItem]) {
    selection.subtract(values.map(\.id))
    Task {
      for item in values { await store.remove(item) }
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
