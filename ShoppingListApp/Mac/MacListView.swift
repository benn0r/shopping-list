import AppKit
import SwiftUI

/// The selected list: an "Add Item" field in the toolbar, items as tiles grouped by category and
/// an inspector with the selected item's details.
struct MacListView: View {
  @EnvironmentObject private var store: AppStore
  @Binding var newListPresented: Bool
  @State private var newItem = ""
  @State private var selection: Set<UUID> = []
  @State private var inspectorPresented = false
  @State private var isSyncing = false
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
      .navigationSubtitle(subtitle)
      .toolbar { toolbar }
      .inspector(isPresented: $inspectorPresented) {
        MacItemInspector(items: selectedItems) { remove($0) }
          .inspectorColumnWidth(min: 250, ideal: 290, max: 380)
      }
      .focusedSceneValue(\.macWindowActions, windowActions)
      #if DEBUG
        .onAppear {
          // `-snapshot-inspector`: the first item selected with the inspector open.
          if ProcessInfo.processInfo.arguments.contains("-snapshot-inspector"),
            let first = sections.first?.items.first
          {
            selection = [first.id]
            inspectorPresented = true
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
        .simultaneousGesture(
          TapGesture(count: 2).onEnded {
            selection = [item.id]
            inspectorPresented = true
          }
        )
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
      TextField("Add Item", text: $newItem)
        .textFieldStyle(.roundedBorder)
        .frame(width: 240)
        .focused($addFieldFocused)
        .onSubmit(addItem)
        .help("Add an item to \(store.activeList.name) (⌘N)")
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
    ToolbarItem(placement: .primaryAction) {
      Button {
        inspectorPresented.toggle()
      } label: {
        Label("Show Info", systemImage: "info.circle")
      }
      .help("Show item info (⌥⌘I)")
    }
  }

  private var subtitle: Text {
    let count = Text("^[\(items.count) item](inflect: true)")
    return Text("\(count) · \(store.activeList.storageDescription)")
  }

  private var windowActions: MacWindowActions {
    MacWindowActions(
      newItem: { addFieldFocused = true },
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
