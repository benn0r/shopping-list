import SwiftUI

/// The inspector on the right: details of the selected item.
struct MacItemInspector: View {
  @EnvironmentObject private var store: AppStore
  let items: [ShoppingItem]
  let markBought: ([ShoppingItem]) -> Void

  var body: some View {
    if items.count == 1, let item = items.first {
      details(item)
    } else if items.count > 1 {
      ContentUnavailableView {
        Label("^[\(items.count) item](inflect: true) Selected", systemImage: "square.grid.2x2")
      } actions: {
        Button("Mark as Bought") { markBought(items) }
      }
    } else {
      ContentUnavailableView(
        "No Selection", systemImage: "info.circle",
        description: Text("Select an item to see its details."))
    }
  }

  private func details(_ item: ShoppingItem) -> some View {
    let category = GroceryCategoryCatalog.category(for: item)
    return Form {
      Section {
        VStack(spacing: 10) {
          if let imageURL = item.imageURL {
            AsyncImage(url: imageURL) { image in
              image.resizable().scaledToFit()
            } placeholder: {
              ItemImage(item: item, size: 72)
            }
            .frame(height: 120)
          } else {
            ItemImage(item: item, size: 72)
          }
          Text(item.label)
            .font(.title3.weight(.semibold))
            .multilineTextAlignment(.center)
            .textSelection(.enabled)
          if let brand = item.brand {
            Text(brand).foregroundStyle(.secondary)
          }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
      }
      Section {
        LabeledContent("Category") {
          Label(category.title, systemImage: category.symbol)
            .foregroundStyle(category.accent)
        }
        if let amount = item.amountText {
          LabeledContent("Quantity", value: amount)
        }
        LabeledContent("Added") {
          Text(item.addedAt, format: .dateTime.day().month().year().hour().minute())
        }
        if let list = store.lists.first(where: { $0.id == item.sourceListID }) {
          LabeledContent("List", value: list.name)
        }
      }
      if item.barcode != nil || item.productSource != nil || item.productType != nil
        || !item.stores.isEmpty
      {
        Section("Product") {
          if let barcode = item.barcode {
            LabeledContent("Barcode") { Text(barcode).textSelection(.enabled).monospacedDigit() }
          }
          if let type = item.productType { LabeledContent("Product Type", value: type) }
          if !item.stores.isEmpty {
            LabeledContent("Stores", value: item.stores.joined(separator: ", "))
          }
          if let source = item.productSource { LabeledContent("Source", value: source) }
        }
      }
      if let specification = item.remoteSpecification, !specification.isEmpty {
        Section("Note") { Text(specification).textSelection(.enabled) }
      }
      Section {
        Button("Mark as Bought") { markBought([item]) }
          .frame(maxWidth: .infinity)
      }
    }
    .formStyle(.grouped)
  }
}
