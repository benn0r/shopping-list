import XCTest

@testable import ShoppingList

@MainActor
final class AppStoreTests: XCTestCase {
  private var fileURL: URL!
  override func setUp() {
    fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  }
  override func tearDown() { try? FileManager.default.removeItem(at: fileURL) }

  func testManualItemPersists() async throws {
    let store = AppStore(storageURL: fileURL)
    await store.addItem(label: "Bread")
    XCTAssertEqual(store.activeItems.map(\.label), ["Bread"])
    await store.flushPersistence()
    let reloaded = AppStore(storageURL: fileURL)
    XCTAssertEqual(reloaded.activeItems.map(\.label), ["Bread"])
  }

  func testMultipleListsAndStores() {
    let store = AppStore(storageURL: fileURL)
    store.createList(name: "Home")
    store.createStore(name: "Market")
    XCTAssertEqual(store.lists.count, 2)
    XCTAssertEqual(store.stores.first?.name, "Market")
  }

  func testShoppingPurchaseAndRestoreKeepsSourceList() async {
    let store = AppStore(storageURL: fileURL)
    store.createStore(name: "Market")
    await store.addItem(label: "Milk")
    let item = store.activeItems[0]
    store.startShopping(store: store.stores[0], listIDs: [store.activeListID])
    await store.purchase(item)
    XCTAssertTrue(store.activeItems.isEmpty)
    let purchase = try! XCTUnwrap(store.activeSession?.purchasedItems.first)
    await store.restore(purchase)
    XCTAssertEqual(store.activeItems.first?.sourceListID, store.activeListID)
  }

  func testGroceryIconMappingsMatchPreviousApp() {
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Brötchen"), "cornbread")
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Jus d’orange"), "orange_juice")
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Leite de aveia"), "oat_milk")
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Schneidebrett"), "cutting_board")
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Sparkling water"), "sparkling_water")
    XCTAssertNil(GroceryIconCatalog.imageName(for: "Completely unknown product"))
  }
}
