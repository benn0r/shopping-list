import XCTest

@testable import ShoppingList

@MainActor
final class OneTapShoppingTests: XCTestCase {
  private var fileURL: URL!

  override func setUp() {
    fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  }
  override func tearDown() { try? FileManager.default.removeItem(at: fileURL) }

  func testOneTapCheckOffRemovesAndUndoRestores() async {
    let store = AppStore(storageURL: fileURL)
    await store.addItem(label: "Bread")
    await store.addItem(label: "Milk")
    let bread = store.activeItems[0]

    await store.checkOff(bread)
    XCTAssertEqual(store.activeItems.map(\.label), ["Milk"])

    await store.undoCheckOff(bread)
    XCTAssertEqual(Set(store.activeItems.map(\.label)), ["Bread", "Milk"])
    XCTAssertEqual(store.activeItems.first(where: { $0.label == "Bread" })?.id, bread.id)
  }

  func testOneTapDuringShoppingTripCountsAsBought() async {
    let store = AppStore(storageURL: fileURL)
    store.createStore(name: "Market")
    await store.addItem(label: "Bread")
    store.startShopping(store: store.stores[0], listIDs: [store.activeListID])
    let bread = store.activeItems[0]

    await store.checkOff(bread)
    XCTAssertTrue(store.activeItems.isEmpty)
    XCTAssertEqual(store.activeSession?.purchasedItems.map(\.item.label), ["Bread"])

    await store.undoCheckOff(bread)
    XCTAssertEqual(store.activeItems.map(\.label), ["Bread"])
    XCTAssertEqual(store.activeSession?.purchasedItems.count, 0)
  }

  func testOneTapSettingPersists() async {
    let store = AppStore(storageURL: fileURL)
    XCTAssertFalse(store.oneTapShopping)
    store.oneTapShopping = true
    await store.flushPersistence()
    XCTAssertTrue(AppStore(storageURL: fileURL).oneTapShopping)
  }
}
