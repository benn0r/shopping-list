import SwiftUI
import UIKit

struct ItemCollection: View {
  let items: [ShoppingItem]
  let mode: ListViewMode
  let action: (ShoppingItem) -> Void

  private var sections: [(category: GroceryCategory, items: [ShoppingItem])] {
    let grouped = Dictionary(grouping: items) { GroceryCategoryCatalog.category(for: $0.label) }
    return GroceryCategory.allCases.compactMap { category in
      guard let categoryItems = grouped[category], !categoryItems.isEmpty else { return nil }
      return (category, categoryItems)
    }
  }

  var body: some View {
    LazyVStack(alignment: .leading, spacing: 18) {
      ForEach(sections, id: \.category) { section in
        VStack(alignment: .leading, spacing: 9) {
          Text(section.category.title)
            .font(.headline)
            .foregroundStyle(.secondary)
            .accessibilityAddTraits(.isHeader)
          if mode == .tiles {
            LazyVGrid(
              columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 3), spacing: 16
            ) {
              ForEach(section.items) { item in
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
              ForEach(section.items) { item in
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
    }
    .animation(.snappy(duration: 0.32, extraBounce: 0.12), value: items.map(\.id))
  }
}

private struct ItemImage: View {
  let item: ShoppingItem
  var size: CGFloat
  var body: some View {
    Group {
      if let url = item.imageURL {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFit()
        } placeholder: {
          fallback
        }
      } else {
        fallback
      }
    }
    .frame(width: size, height: size)
  }
  private var fallback: some View {
    ZStack {
      Circle().fill(.blue.opacity(0.1))
      if let name = GroceryIconCatalog.imageName(for: item.label), let image = UIImage(named: name)
      {
        Image(uiImage: image.withRenderingMode(.alwaysTemplate))
          .resizable()
          .scaledToFit()
          .foregroundStyle(.blue)
          .padding(size * 0.14)
      } else {
        Text(initial)
          .font(.system(size: size * 0.48, weight: .regular, design: .rounded))
          .foregroundStyle(.blue)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
  }

  private var initial: String {
    item.label.trimmingCharacters(in: .whitespacesAndNewlines).first.map {
      String($0).uppercased()
    } ?? "?"
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
  var body: some View {
    VStack(spacing: 6) {
      ItemImage(item: item, size: 52)
      Text(item.label).font(
        item.label.count > 28 ? .caption2 : item.label.count > 16 ? .caption : .subheadline
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
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
  }
}
