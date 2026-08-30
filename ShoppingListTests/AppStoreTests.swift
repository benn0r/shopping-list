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

  func testActiveListSelectionPersists() async {
    let store = AppStore(storageURL: fileURL)
    store.createList(name: "Home")
    store.activeListID = store.lists[1].id
    store.save()
    await store.flushPersistence()
    XCTAssertEqual(AppStore(storageURL: fileURL).activeList.name, "Home")
  }

  func testStoreNamesMatchAccentsPunctuationAndEitherDirection() {
    XCTAssertTrue(storeNamesMatch("Coop Supermarkt Zürich", "Coop"))
    XCTAssertTrue(storeNamesMatch("Migros", "Migros Zürich-City"))
    XCTAssertTrue(storeNamesMatch("Marché du Pont", "Marche du Pont"))
    XCTAssertFalse(storeNamesMatch("Coop", "Migros"))
  }

  func testLookupPreferencesAndCustomBarcodesPersist() async {
    let store = AppStore(storageURL: fileURL)
    store.lookupPreferences = ProductLookupPreferences(language: .fr, labelStyle: .exact)
    store.appLanguage = .ptBR
    store.saveCustomBarcode(barcode: "7612345678901", label: "Special Bread")
    await store.flushPersistence()

    let reloaded = AppStore(storageURL: fileURL)
    XCTAssertEqual(reloaded.lookupPreferences.language, .fr)
    XCTAssertEqual(reloaded.lookupPreferences.labelStyle, .exact)
    XCTAssertEqual(reloaded.appLanguage, .ptBR)
    XCTAssertEqual(
      reloaded.customBarcodes, [CustomBarcode(barcode: "7612345678901", label: "Special Bread")])
  }

  func testCustomBarcodeTakesPriorityWithoutNetworkLookup() async throws {
    let product = try await ProductLookup().find(
      barcode: "7612345678901", preferences: .init(),
      customBarcodes: [CustomBarcode(barcode: "7612345678901", label: "My Bread")])
    XCTAssertEqual(product?.label, "My Bread")
    XCTAssertEqual(product?.source, "Custom barcode")
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

  func testSyncUploadsPendingItemsAndPreservesMetadata() async {
    let provider = ProviderSpy()
    let store = AppStore(storageURL: fileURL) { _, _ in provider }
    store.providerConfigurations[.mealie] = ProviderConfiguration(enabled: true)
    var list = store.activeList
    list.syncTarget = SyncTarget(
      provider: .mealie, remoteListID: "remote", remoteListName: "Remote")
    store.updateList(list)
    let local = ShoppingItem(
      barcode: "7612345678901", label: "Bread", brand: "Local Brand",
      imageURL: URL(string: "https://example.com/bread.jpg"), sourceListID: list.id)
    store.items[list.id] = [local]

    await store.sync(list)

    let addedLabels = await provider.addedLabels()
    XCTAssertEqual(addedLabels, ["Bread"])
    XCTAssertEqual(store.items[list.id]?.first?.remoteItemID, "remote-Bread")
    XCTAssertEqual(store.items[list.id]?.first?.brand, "Local Brand")
    XCTAssertEqual(
      store.items[list.id]?.first?.imageURL?.absoluteString, "https://example.com/bread.jpg")
  }

  func testSyncLinksMatchingRemoteItemWithoutDuplicateUpload() async {
    let provider = ProviderSpy(
      initialItems: [ProviderItem(id: "existing", label: " bread ", barcode: "7612345678901")])
    let store = AppStore(storageURL: fileURL) { _, _ in provider }
    store.providerConfigurations[.bring] = ProviderConfiguration(enabled: true)
    var list = store.activeList
    list.syncTarget = SyncTarget(provider: .bring, remoteListID: "remote", remoteListName: "Remote")
    store.updateList(list)
    store.items[list.id] = [
      ShoppingItem(barcode: "7612345678901", label: "Bread", sourceListID: list.id)
    ]

    await store.sync(list)

    let addedLabels = await provider.addedLabels()
    XCTAssertTrue(addedLabels.isEmpty)
    XCTAssertEqual(store.items[list.id]?.first?.remoteItemID, "existing")
  }

  func testRestoreUsesProviderRestoreAndStoresReturnedID() async {
    let provider = ProviderSpy()
    let store = AppStore(storageURL: fileURL) { _, _ in provider }
    store.providerConfigurations[.mealie] = ProviderConfiguration(enabled: true)
    var list = store.activeList
    list.syncTarget = SyncTarget(
      provider: .mealie, remoteListID: "remote", remoteListName: "Remote")
    store.updateList(list)
    store.createStore(name: "Market")
    store.startShopping(store: store.stores[0], listIDs: [list.id])
    let item = ShoppingItem(label: "Milk", remoteItemID: "old-id", sourceListID: list.id)
    store.sessions[store.sessions.count - 1].purchasedItems = [PurchasedItem(item: item)]

    await store.restore(store.sessions.last!.purchasedItems[0])

    let restoredLabels = await provider.restoredLabels()
    XCTAssertEqual(restoredLabels, ["Milk"])
    XCTAssertEqual(store.items[list.id]?.first?.remoteItemID, "restored-Milk")
  }

  func testGroceryIconMappingsMatchPreviousApp() {
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Brötchen"), "cornbread")
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Jus d’orange"), "orange_juice")
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Leite de aveia"), "oat_milk")
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Schneidebrett"), "cutting_board")
    XCTAssertEqual(GroceryIconCatalog.imageName(for: "Sparkling water"), "sparkling_water")
    XCTAssertNil(GroceryIconCatalog.imageName(for: "Completely unknown product"))
  }

  func testGroceryCategoriesReuseMultilingualIconAliases() {
    for label in ["Apple", "Apples", "Apfel", "Äpfel", "pomme", "mele", "maçãs"] {
      XCTAssertEqual(GroceryCategoryCatalog.category(for: label), .fruitsVegetables, label)
      XCTAssertEqual(GroceryIconCatalog.imageName(for: label), "apple", label)
    }
  }

  func testGroceryCategoryVocabularyCoversSupportedLanguages() {
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "Waschmittel"), .householdCleaning)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "liquide vaisselle"), .householdCleaning)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "carta igienica"), .bathroomSupplies)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "fraldas"), .baby)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "croquettes chat"), .pets)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "pizza surgelée"), .frozenFoods)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "unknown xyz"), .other)
  }

  func testPaperAndStorageMatchesRetailSpellingsAndCompounds() {
    for label in [
      "WC Papier", "WC-Papier", "Toiletpaper", "Toilet Paper 4 ply", "Papier toilette",
      "Carta igienica", "Papel higiênico",
    ] {
      XCTAssertEqual(GroceryCategoryCatalog.category(for: label), .bathroomSupplies, label)
    }
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "Küchenrolle"), .paperStorage)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "Aluminium foil"), .paperStorage)
  }

  func testCategoryMatchingToleratesLikelyTypos() {
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "Mayonaise"), .saucesCondiments)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "mayonaisse"), .saucesCondiments)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "Mayonaisse light"), .saucesCondiments)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "toiletenpapier"), .bathroomSupplies)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "completely unknown xyz"), .other)
  }

  func testGroceryCategoriesUseSupermarketOrder() {
    XCTAssertLessThan(GroceryCategory.fruitsVegetables.rawValue, GroceryCategory.bakery.rawValue)
    XCTAssertLessThan(
      GroceryCategory.beverages.rawValue, GroceryCategory.householdCleaning.rawValue)
    XCTAssertEqual(GroceryCategory.allCases.last, .other)
  }
}

private actor ProviderSpy: ShoppingProvider {
  private var remoteItems: [ProviderItem]
  private var adds: [String] = []
  private var restores: [String] = []

  init(initialItems: [ProviderItem] = []) { remoteItems = initialItems }

  func lists() async throws -> [ProviderList] { [] }
  func items(in listID: String) async throws -> [ProviderItem] { remoteItems }
  func addItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    adds.append(item.label)
    let remote = ProviderItem(
      id: "remote-\(item.label)", label: item.label, barcode: item.barcode,
      quantity: item.quantity, unit: item.unit)
    remoteItems.append(remote)
    return remote
  }
  func removeItem(_ item: ShoppingItem, from listID: String) async throws {
    remoteItems.removeAll { $0.id == item.remoteItemID }
  }
  func restoreItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    restores.append(item.label)
    let remote = ProviderItem(id: "restored-\(item.label)", label: item.label)
    remoteItems.append(remote)
    return remote
  }
  func addedLabels() -> [String] { adds }
  func restoredLabels() -> [String] { restores }
}
