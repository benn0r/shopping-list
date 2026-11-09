import AppKit
import SwiftUI

/// The selected list: an "Add Item" field in the toolbar, items as tiles grouped by category and
/// an inspector with the selected item's details.
struct MacListView: View {
  @EnvironmentObject private var store: AppStore
  @Binding var newListPresented: Bool
  @State private var newItem = ""
  // Owned by the window: the inspector is a column of the whole window, next to the split view.
  @Binding var selection: Set<UUID>
  @Binding var inspectorPresented: Bool
  /// With the sidebar hidden the window controls take up the start of this view's toolbar.
  var sidebarShown = true
  @State private var isSyncing = false
  @State private var contentWidth: CGFloat = 1000
  @State private var addPopoverPresented = false

  /// Room left for the Add Item field next to the title, subtitle and buttons. The inspector takes
  /// the Info button into its own toolbar; a hidden sidebar leaves the window controls here.
  private var addFieldWidth: CGFloat {
    contentWidth - 340 - (sidebarShown ? 0 : 150) + (inspectorPresented ? 50 : 0)
  }

  /// Too narrow for the field: a button that opens it in a popover instead.
  private var isCompact: Bool { addFieldWidth < 120 }
  @FocusState private var addFieldFocused: Bool
  @FocusState private var gridFocused: Bool

  private var items: [ShoppingItem] { store.activeItems }
  private var selectedItems: [ShoppingItem] { items.filter { selection.contains($0.id) } }

  private var sections: [(category: GroceryCategory, items: [ShoppingItem])] {
    let grouped = Dictionary(grouping: items) { GroceryCategoryCatalog.category(for: $0) }
    return GroceryCategory.allCases.compactMap { category in
      guard let values = grouped[category], !values.isEmpty else { return nil }
      return (category, values)
    }
  }

  var body: some View {
    content
      .navigationTitle(store.activeList.name)
      // Dropped in very narrow windows, where it would push the toolbar buttons into overflow.
      .navigationSubtitle(isCompact ? Text(verbatim: "") : subtitle)
      .toolbar { toolbar }
      .onGeometryChange(for: CGFloat.self) {
        $0.size.width
      } action: {
        contentWidth = $0
      }
      .focusedSceneValue(\.macWindowActions, windowActions)
      #if DEBUG
        .onAppear {
          // `-snapshot-inspector`: the first item selected with the inspector open.
          if ProcessInfo.processInfo.arguments.contains("-snapshot-inspector"),
            let first = sections.first?.items.first
          {
            Task {
              try? await Task.sleep(for: .seconds(1))
              selection = [first.id]
              inspectorPresented = true
            }
          }
        }
      #endif
      .onChange(of: items) { _, values in
        // Items bought or removed elsewhere leave the selection.
        selection.formIntersection(values.map(\.id))
      }
      .task {
        guard !MacEnvironment.isRunningTests else { return }
        while !Task.isCancelled {
          try? await Task.sleep(for: .seconds(60))
          guard !Task.isCancelled else { return }
          await store.backgroundSync()
        }
      }
      // While the server matches or draws icons, check every 3 s for 30 s, then every 10 s for up
      // to 3 minutes, like the iPhone app.
      .task(id: store.activeListHasPendingIcons) {
        guard store.activeListHasPendingIcons, !MacEnvironment.isRunningTests else { return }
        for round in 0..<27 {
          try? await Task.sleep(for: .seconds(round < 10 ? 3 : 10))
          guard !Task.isCancelled else { return }
          await store.sync(reportErrors: false)
          if !store.activeListHasPendingIcons { return }
        }
      }
  }

  // MARK: Content

  @ViewBuilder private var content: some View {
    if items.isEmpty {
      ContentUnavailableView {
        Label("No Items", systemImage: "cart")
      } description: {
        Text("Type in the Add Item field in the toolbar and press Return.")
      } actions: {
        Button("Add Item") { addFieldFocused = true }
      }
    } else {
      ScrollView {
        Group {
          if store.showCategoryLabels {
            LazyVStack(alignment: .leading, spacing: 26) {
              ForEach(sections, id: \.category) { section in
                VStack(alignment: .leading, spacing: 10) {
                  MacCategoryHeader(category: section.category, count: section.items.count)
                  grid(section.items)
                }
              }
            }
          } else {
            grid(sections.flatMap(\.items))
          }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 18)
        .animation(.snappy(duration: 0.35), value: items)
      }
      .background {
        // Clicking empty space clears the selection, as in Finder.
        Color.clear.contentShape(Rectangle()).onTapGesture {
          selection = []
          gridFocused = true
        }
      }
      .focusable()
      .focusEffectDisabled()
      .focused($gridFocused)
      .onDeleteCommand { removeSelection() }
      .onKeyPress(.space) {
        inspectorPresented.toggle()
        return .handled
      }
      .onKeyPress(.escape) {
        selection = []
        return .handled
      }
    }
  }

  private func grid(_ values: [ShoppingItem]) -> some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: 118, maximum: 150), spacing: 12)],
      alignment: .leading, spacing: 12
    ) {
      // Identified by the whole item, like on iPhone: a new icon or category redraws the tile.
      ForEach(values, id: \.self) { item in
        MacItemTile(item: item, isSelected: selection.contains(item.id)) {
          remove([item])
        }
        .onTapGesture { select(item) }
        .contextMenu { contextMenu(for: item) }
      }
    }
  }

  @ViewBuilder private func contextMenu(for item: ShoppingItem) -> some View {
    let targets = selection.contains(item.id) ? selectedItems : [item]
    Button(targets.count > 1 ? "Mark \(targets.count) Items as Bought" : "Mark as Bought") {
      remove(targets)
    }
    Button("Show Info") {
      selection = [item.id]
      inspectorPresented = true
    }
    Button(targets.count > 1 ? "Delete \(targets.count) Items" : "Delete", role: .destructive) {
      remove(targets)
    }
    Divider()
    Button("Copy") {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(
        targets.map { [$0.amountText, $0.label].compactMap { $0 }.joined(separator: " ") }
          .joined(separator: "\n"),
        forType: .string)
    }
  }

  // MARK: Toolbar

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .primaryAction) {
      if isCompact {
        // No room for a field: a button with the field in a popover, like Reminders.
        Button {
          addPopoverPresented = true
        } label: {
          Label("Add Item", systemImage: "plus")
        }
        .help("Add an item to \(store.activeList.name) (⌘N)")
        .popover(isPresented: $addPopoverPresented, arrowEdge: .bottom) {
          TextField("Add Item", text: $newItem)
            .textFieldStyle(.roundedBorder)
            .frame(width: 240)
            .focused($addFieldFocused)
            .onSubmit(addItem)
            .padding(12)
            .onAppear { addFieldFocused = true }
        }
      } else {
        // A plain field inside the toolbar's own capsule, like the search field: a bordered field
        // draws its rectangular focus ring inside the capsule and gets clipped.
        HStack(spacing: 6) {
          Image(systemName: "plus")
            .foregroundStyle(.secondary)
            .imageScale(.medium)
          TextField("Add Item", text: $newItem)
            .textFieldStyle(.plain)
            .focused($addFieldFocused)
            .onSubmit(addItem)
        }
        .padding(.horizontal, 8)
        // Toolbar items keep their ideal width, so the field is sized by hand.
        .frame(width: min(240, addFieldWidth))
        .contentShape(Rectangle())
        .onTapGesture { addFieldFocused = true }
        .help("Add an item to \(store.activeList.name) (⌘N)")
      }
    }
    if store.activeList.syncTarget != nil {
      ToolbarItem(placement: .primaryAction) {
        Button {
          sync()
        } label: {
          Label("Sync", systemImage: "arrow.triangle.2.circlepath")
        }
        .disabled(isSyncing)
        .help("Sync with \(store.activeList.storageDescription) (⌘R)")
      }
    }
    // While the inspector is open, its own toolbar has the button.
    if !inspectorPresented {
      ToolbarItem(placement: .primaryAction) { infoButton }
    }
  }

  private var infoButton: some View {
    Button {
      inspectorPresented.toggle()
    } label: {
      Label(inspectorPresented ? "Hide Info" : "Show Info", systemImage: "info.circle")
    }
    .help(inspectorPresented ? "Hide item info (⌥⌘I)" : "Show item info (⌥⌘I)")
  }

  private var subtitle: Text {
    let count = Text("^[\(items.count) item](inflect: true)")
    return Text("\(count) · \(store.activeList.storageDescription)")
  }

  private var windowActions: MacWindowActions {
    MacWindowActions(
      newItem: { if isCompact { addPopoverPresented = true } else { addFieldFocused = true } },
      newList: { newListPresented = true },
      sync: store.activeList.syncTarget == nil ? nil : { sync() },
      toggleInspector: { inspectorPresented.toggle() },
      removeSelection: selection.isEmpty ? nil : { removeSelection() })
  }

  // MARK: Actions

  private func select(_ item: ShoppingItem) {
    gridFocused = true
    let modifiers = NSEvent.modifierFlags
    if modifiers.contains(.command) || modifiers.contains(.shift) {
      if selection.contains(item.id) {
        selection.remove(item.id)
      } else {
        selection.insert(item.id)
      }
    } else {
      selection = [item.id]
    }
    // Selecting an item shows its details.
    if !selection.isEmpty { inspectorPresented = true }
  }

  private func addItem() {
    let label = newItem.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !label.isEmpty else { return }
    newItem = ""
    Task { await store.addItem(label: label) }
  }

  private func removeSelection() { remove(selectedItems) }

  private func remove(_ values: [ShoppingItem]) {
    selection.subtract(values.map(\.id))
    Task {
      for item in values { await store.remove(item) }
    }
  }

  private func sync() {
    guard !isSyncing else { return }
    isSyncing = true
    Task {
      await store.sync()
      isSyncing = false
    }
  }
}

// MARK: Tiles

struct MacCategoryHeader: View {
  let category: GroceryCategory
  let count: Int

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: category.symbol)
        .foregroundStyle(category.accent)
        .frame(width: 18)
      Text(category.title)
        .font(.headline)
      Text("\(count)")
        .font(.subheadline.monospacedDigit())
        .foregroundStyle(.secondary)
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
  }
}

struct MacItemTile: View {
  let item: ShoppingItem
  let isSelected: Bool
  let markBought: () -> Void
  @State private var isHovered = false

  private var accent: Color { GroceryCategoryCatalog.category(for: item).accent }
  private static let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)

  var body: some View {
    VStack(spacing: 7) {
      ItemImage(item: item, size: 44)
      VStack(spacing: 1) {
        Text(item.label)
          .font(.callout.weight(.medium))
          .multilineTextAlignment(.center)
          .lineLimit(2)
        if let amount = item.amountText {
          Text(amount)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity)
    .frame(height: 108)
    .background(Self.shape.fill(fill))
    .overlay {
      Self.shape.strokeBorder(
        isSelected ? Color.accentColor : Color.primary.opacity(isHovered ? 0.12 : 0.07),
        lineWidth: isSelected ? 2 : 1)
    }
    .overlay(alignment: .topLeading) {
      if isHovered {
        Button(action: markBought) {
          Image(systemName: "checkmark.circle")
            .font(.title3)
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.borderless)
        .padding(6)
        .help("Mark as Bought")
        .transition(.opacity)
      }
    }
    .contentShape(Self.shape)
    .onHover { hovering in
      withAnimation(.easeOut(duration: 0.12)) { isHovered = hovering }
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    .accessibilityAction(named: "Mark as Bought", markBought)
  }

  private var fill: Color {
    if isSelected { return Color.accentColor.opacity(0.14) }
    return accent.opacity(isHovered ? 0.13 : 0.07)
  }
}
