import CryptoKit
import SwiftUI
import UIKit

struct ItemCollection: View {
  let items: [ShoppingItem]
  let mode: ListViewMode
  let showCategoryLabels: Bool
  let action: (ShoppingItem) -> Void

  private var sections: [(category: GroceryCategory, items: [ShoppingItem])] {
    let grouped = Dictionary(grouping: items) { GroceryCategoryCatalog.category(for: $0) }
    return GroceryCategory.allCases.compactMap { category in
      guard let categoryItems = grouped[category], !categoryItems.isEmpty else { return nil }
      return (category, categoryItems)
    }
  }

  private var categorySortedItems: [ShoppingItem] {
    items.enumerated().sorted { left, right in
      let leftCategory = GroceryCategoryCatalog.category(for: left.element).rawValue
      let rightCategory = GroceryCategoryCatalog.category(for: right.element).rawValue
      return leftCategory == rightCategory
        ? left.offset < right.offset : leftCategory < rightCategory
    }.map(\.element)
  }

  var body: some View {
    Group {
      if showCategoryLabels && mode == .tiles {
        LazyVGrid(
          columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 3), spacing: 16
        ) {
          ForEach(sections, id: \.category) { section in
            Section {
              ForEach(section.items) { item in
                Button {
                  action(item)
                } label: {
                  ItemTile(item: item)
                }
                .buttonStyle(.plain)
                .aspectRatio(1, contentMode: .fit)
              }
            } header: {
              categoryHeader(section.category, count: section.items.count)
                .padding(.top, 2)
            }
          }
        }
      } else if showCategoryLabels {
        LazyVStack(alignment: .leading, spacing: 18) {
          ForEach(sections, id: \.category) { section in
            VStack(alignment: .leading, spacing: 9) {
              categoryHeader(section.category, count: section.items.count)
              itemLayout(section.items)
            }
          }
        }
      } else {
        itemLayout(categorySortedItems)
      }
    }
    .animation(.snappy(duration: 0.32, extraBounce: 0.12), value: items.map(\.id))
  }

  private func categoryHeader(_ category: GroceryCategory, count: Int) -> some View {
    HStack(spacing: 8) {
      Image(systemName: category.symbol)
        .font(.caption.weight(.bold))
        .foregroundStyle(category.accent)
        .frame(width: 26, height: 26)
        .background(category.accent.opacity(0.12), in: Circle())
      Text(category.title)
        .font(.headline)
        .foregroundStyle(.primary)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .layoutPriority(1)
      Text("\(count)")
        .font(.caption2.monospacedDigit().weight(.semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(.quaternary, in: Capsule())
      Rectangle()
        .fill(category.accent.opacity(0.18))
        .frame(height: 1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityAddTraits(.isHeader)
  }

  @ViewBuilder private func itemLayout(_ values: [ShoppingItem]) -> some View {
    if mode == .tiles {
      LazyVGrid(
        columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 3), spacing: 16
      ) {
        ForEach(values) { item in
          Button {
            action(item)
          } label: {
            ItemTile(item: item)
          }
          .buttonStyle(.plain)
          .aspectRatio(1, contentMode: .fit)
        }
      }
    } else {
      LazyVStack(spacing: 0) {
        ForEach(values) { item in
          Button {
            action(item)
          } label: {
            ItemRow(item: item)
          }.buttonStyle(.plain)
          Divider().padding(.leading, 58)
        }
      }
    }
  }
}

private struct ItemImage: View {
  let item: ShoppingItem
  var size: CGFloat
  private var accent: Color { GroceryCategoryCatalog.category(for: item).accent }
  var body: some View {
    Group {
      if let url = item.imageURL {
        CachedRemoteImage(url: url, fallback: fallback)
      } else {
        fallback
      }
    }
    .frame(width: size, height: size)
  }
  private var fallback: some View {
    ZStack {
      Circle().fill(accent.opacity(0.12))
      if let name = item.iconName, let image = UIImage(named: name) {
        icon(image)
      } else if let url = item.iconURL {
        RemoteIcon(url: url, render: icon, fallback: localIcon)
      } else {
        localIcon
      }
    }
  }

  /// The label matched against the bundled icons, or its initial.
  @ViewBuilder private var localIcon: some View {
    if let image = GroceryIconCatalog.imageName(for: item.label).flatMap({ UIImage(named: $0) }) {
      icon(image)
    } else {
      Text(initial)
        .font(.system(size: size * 0.48, weight: .regular, design: .rounded))
        .foregroundStyle(accent)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func icon(_ image: UIImage) -> some View {
    Image(uiImage: image.withRenderingMode(.alwaysTemplate))
      .resizable()
      .scaledToFit()
      .foregroundStyle(accent)
      .padding(size * 0.14)
  }

  private var initial: String {
    item.label.trimmingCharacters(in: .whitespacesAndNewlines).first.map {
      String($0).uppercased()
    } ?? "?"
  }
}

private struct CachedRemoteImage<Fallback: View>: View {
  let url: URL
  let fallback: Fallback
  @StateObject private var loader = ProductImageLoader()

  var body: some View {
    Group {
      if let image = loader.image {
        Image(uiImage: image).resizable().scaledToFit()
      } else {
        fallback
      }
    }
    .task(id: url) { await loader.load(url) }
  }
}

/// A provider icon that is not bundled with the app (e.g. one the server generated), cached on disk.
private struct RemoteIcon<Icon: View, Fallback: View>: View {
  let url: URL
  let render: (UIImage) -> Icon
  let fallback: Fallback
  @StateObject private var loader = ProductImageLoader()

  var body: some View {
    Group {
      if let image = loader.image {
        render(image)
      } else {
        fallback
      }
    }
    .task(id: url) { await loader.load(url) }
  }
}

@MainActor
private final class ProductImageLoader: ObservableObject {
  @Published private(set) var image: UIImage?
  private static let memoryCache = NSCache<NSURL, UIImage>()

  func load(_ url: URL) async {
    if let cached = Self.memoryCache.object(forKey: url as NSURL) {
      image = cached
      return
    }
    let fileURL = Self.fileURL(for: url)
    if let cached = UIImage(contentsOfFile: fileURL.path) {
      Self.memoryCache.setObject(cached, forKey: url as NSURL)
      image = cached
      return
    }
    guard
      let (data, response) = try? await URLSession.shared.data(from: url),
      (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true,
      let downloaded = UIImage(data: data)
    else { return }
    Self.memoryCache.setObject(downloaded, forKey: url as NSURL)
    image = downloaded
    try? FileManager.default.createDirectory(
      at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: fileURL, options: .atomic)
  }

  private static func fileURL(for url: URL) -> URL {
    let digest = SHA256.hash(data: Data(url.absoluteString.utf8))
      .map { String(format: "%02x", $0) }.joined()
    return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("product-images", isDirectory: true)
      .appendingPathComponent(digest)
  }
}

private struct ItemRow: View {
  let item: ShoppingItem
  var body: some View {
    HStack(spacing: 12) {
      ItemImage(item: item, size: 36)
      VStack(alignment: .leading, spacing: 2) {
        Text(amount + item.label).font(.body).foregroundStyle(.primary).lineLimit(2)
        if let detail = item.brand ?? item.barcode {
          Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
      }
      Spacer()
      Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
    }.padding(.vertical, 8).contentShape(Rectangle())
  }
  private var amount: String {
    item.quantity.map { "\($0.formatted())\(item.unit.map { " \($0)" } ?? "") " } ?? ""
  }
}

private struct ItemTile: View {
  let item: ShoppingItem
  private var accent: Color { GroceryCategoryCatalog.category(for: item).accent }
  private var displayLabel: String {
    guard let quantity = item.quantity else { return item.label }
    return "\(quantity.formatted())× \(item.label)"
  }
  var body: some View {
    VStack(spacing: 6) {
      ItemImage(item: item, size: 52)
      Text(displayLabel).font(
        displayLabel.count > 28 ? .caption2 : displayLabel.count > 16 ? .caption : .subheadline
      )
      .fontWeight(.medium)
      .multilineTextAlignment(.center)
      .lineLimit(2)
      .minimumScaleFactor(0.65)
      .frame(height: 32, alignment: .center)
    }
    .padding(.horizontal, 10)
    .padding(.top, 10)
    .padding(.bottom, 2)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(.thinMaterial)
        .overlay {
          LinearGradient(
            colors: [accent.opacity(0.10), .clear], startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(accent.opacity(0.10), lineWidth: 0.5)
    }
  }
}

extension GroceryCategory {
  var symbol: String {
    switch self {
    case .fruitsVegetables: "carrot.fill"
    case .bakery: "birthday.cake.fill"
    case .breakfast: "sunrise.fill"
    case .dairyEggs: "waterbottle.fill"
    case .cheese: "triangle.fill"
    case .meatPoultry: "fork.knife"
    case .fishSeafood: "fish.fill"
    case .deliConvenience: "takeoutbag.and.cup.and.straw.fill"
    case .plantBased: "leaf.fill"
    case .pastaRiceGrains: "takeoutbag.and.cup.and.straw"
    case .cannedJarred: "shippingbox.fill"
    case .saucesCondiments: "drop.fill"
    case .bakingSpices: "birthday.cake"
    case .international: "globe.europe.africa.fill"
    case .snacksSweets: "popcorn.fill"
    case .coffeeTea: "cup.and.saucer.fill"
    case .beverages: "waterbottle"
    case .alcohol: "wineglass.fill"
    case .frozenFoods: "snowflake"
    case .householdCleaning: "sparkles"
    case .paperStorage: "archivebox.fill"
    case .bathroomSupplies: "shower.fill"
    case .personalCare: "comb.fill"
    case .health: "cross.case.fill"
    case .baby: "figure.and.child.holdinghands"
    case .pets: "pawprint.fill"
    case .kitchenHome: "house.fill"
    case .seasonal: "gift.fill"
    case .checkout: "basket.fill"
    case .other: "square.grid.2x2.fill"
    }
  }

  var accent: Color {
    switch self {
    case .fruitsVegetables, .plantBased: .shoppingAccent
    case .bakery, .breakfast, .bakingSpices: .orange
    case .dairyEggs, .cheese: .yellow
    case .meatPoultry, .deliConvenience: .red
    case .fishSeafood, .frozenFoods, .beverages: .cyan
    case .pastaRiceGrains, .cannedJarred, .saucesCondiments: .brown
    case .international, .snacksSweets, .seasonal: .purple
    case .coffeeTea: .brown
    case .alcohol: .indigo
    case .householdCleaning, .paperStorage, .bathroomSupplies: .blue
    case .personalCare: .pink
    case .health: .red
    case .baby: .shoppingMint
    case .pets: .orange
    case .kitchenHome, .checkout, .other: .secondary
    }
  }
}
