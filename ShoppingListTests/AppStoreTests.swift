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

  func testCategoryLabelPreferencePersists() async {
    let store = AppStore(storageURL: fileURL)
    store.showCategoryLabels = false
    await store.flushPersistence()
    XCTAssertFalse(AppStore(storageURL: fileURL).showCategoryLabels)
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

  func testScannedProductTaxonomyOverridesAmbiguousLabel() {
    let item = ShoppingItem(
      barcode: "7610055103798", label: "Calanda Radler Peach",
      categoryHints: [
        "Non-alcoholic radler beers", "en:beverages", "en:non-alcoholic-beverages",
        "en:sweetened-beverages",
      ], sourceListID: UUID())
    XCTAssertEqual(GroceryCategoryCatalog.category(for: item), .beverages)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: item.label), .fruitsVegetables)
  }

  func testBroadFoodAndBeverageParentDoesNotMakePsylliumADrink() {
    let item = ShoppingItem(
      barcode: "7613312115152", label: "Téguments de graines de Psyllium",
      categoryHints: [
        "en:plant-based-foods-and-beverages", "en:plant-based-foods", "en:cooking-helpers",
        "en:psyllium",
      ], sourceListID: UUID())
    XCTAssertEqual(GroceryCategoryCatalog.category(for: item), .bakingSpices)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: "Flohsamenschalen"), .bakingSpices)
  }

  func testOpenFoodFactsCanonicalFamiliesMapToAppCategories() {
    let cases: [([String], GroceryCategory)] = [
      (["en:plant-based-foods-and-beverages", "en:fruits", "en:apples"], .fruitsVegetables),
      (["en:foods", "en:breads", "en:wholemeal-breads"], .bakery),
      (["en:dairies", "en:fermented-milk-products", "en:yogurts"], .dairyEggs),
      (["en:seafood", "en:fishes", "en:salmons"], .fishSeafood),
      (["en:groceries", "en:sauces", "en:mayonnaises"], .saucesCondiments),
      (["en:snacks", "en:sweet-snacks", "en:chocolates"], .snacksSweets),
      (["en:beverages", "en:teas", "en:green-teas"], .coffeeTea),
      (["en:beverages", "en:alcoholic-beverages", "en:wines"], .alcohol),
      (["en:frozen-foods", "en:frozen-pizzas"], .frozenFoods),
    ]
    for (hints, expected) in cases {
      let item = ShoppingItem(
        label: "Unhelpful product name", categoryHints: hints, sourceListID: UUID())
      XCTAssertEqual(
        GroceryCategoryCatalog.category(for: item), expected, hints.joined(separator: ","))
    }
    let beauty = ShoppingItem(
      label: "Unknown", productType: "beauty", categoryHints: ["en:products"], sourceListID: UUID())
    let petFood = ShoppingItem(
      label: "Unknown", productType: "petfood", categoryHints: ["en:foods"], sourceListID: UUID())
    XCTAssertEqual(GroceryCategoryCatalog.category(for: beauty), .personalCare)
    XCTAssertEqual(GroceryCategoryCatalog.category(for: petFood), .pets)
  }

  func testBackgroundSyncSuppressesTransientProviderErrors() async {
    let store = AppStore(storageURL: fileURL) { _, _ in FailingProvider() }
    store.providerConfigurations[.bring]?.enabled = true
    store.lists[0].syncTarget = SyncTarget(
      provider: .bring, remoteListID: "remote", remoteListName: "Remote")

    await store.backgroundSync()
    XCTAssertNil(store.errorMessage)

    await store.sync()
    XCTAssertNotNil(store.errorMessage)
  }

  func testCancelledManualSyncDoesNotShowError() async {
    let store = AppStore(storageURL: fileURL) { _, _ in CancelledProvider() }
    store.providerConfigurations[.bring]?.enabled = true
    store.lists[0].syncTarget = SyncTarget(
      provider: .bring, remoteListID: "remote", remoteListName: "Remote")

    await store.sync()

    XCTAssertNil(store.errorMessage)
  }

  func testGroceryCategoriesUseSupermarketOrder() {
    XCTAssertLessThan(GroceryCategory.fruitsVegetables.rawValue, GroceryCategory.bakery.rawValue)
    XCTAssertLessThan(
      GroceryCategory.beverages.rawValue, GroceryCategory.householdCleaning.rawValue)
    XCTAssertEqual(GroceryCategory.allCases.last, .other)
  }

  func testProductMetadataCachePersistsEANMetadata() async {
    let cacheURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathComponent("ean-cache.json")
    let metadata = ProductMetadata(
      label: "Cached product", exactLabel: "Cached product", genericLabel: "Product",
      brand: "Brand", imageURL: URL(string: "https://example.com/product.jpg"),
      stores: ["Store"], source: "Open Food Facts", productType: "food",
      categoryHints: ["en:beverages"])
    let firstCache = ProductMetadataCache(storageURL: cacheURL)
    await firstCache.store(metadata, for: "7613312115152|en|generic")

    let reloadedCache = ProductMetadataCache(storageURL: cacheURL)
    let cached = await reloadedCache.value(for: "7613312115152|en|generic")

    XCTAssertEqual(cached, metadata)
  }

  func testSpecificOpenFoodFactsCategoriesOverrideBroadProduceParents() {
    let cases: [(barcode: String, label: String, hints: [String], expected: GroceryCategory)] = [
      (
        "87157215", "Tomato Ketchup",
        [
          "en:plant-based-foods-and-beverages", "en:fruits-and-vegetables-based-foods",
          "en:vegetables-based-foods", "en:condiments", "en:sauces", "en:ketchup",
          "en:tomato-ketchup", "en:dressings-and-sauces",
        ], .saucesCondiments
      ),
      (
        "7613404584873", "Thousand island dressing",
        ["en:condiments", "en:sauces", "en:salad-dressings", "en:dressings-and-sauces"],
        .saucesCondiments
      ),
      (
        "8710604723565", "Cornichons Extra",
        [
          "en:fruits-and-vegetables-based-foods", "en:vegetables-based-foods",
          "en:canned-foods", "en:pickles", "en:pickled-vegetables", "en:pickled-cucumbers",
          "en:pickled-gherkins",
        ], .cannedJarred
      ),
    ]

    for value in cases {
      let item = ShoppingItem(
        barcode: value.barcode, label: value.label, categoryHints: value.hints,
        sourceListID: UUID())
      XCTAssertEqual(GroceryCategoryCatalog.category(for: item), value.expected, value.barcode)
    }
  }

  func testVerifiedEANCorrectionHandlesMissingProviderCategory() {
    let item = ShoppingItem(
      barcode: "8002510020006", label: "Pomodoro San Marzano", brand: "Longobardi",
      categoryHints: [], sourceListID: UUID())

    XCTAssertEqual(GroceryCategoryCatalog.category(for: item), .cannedJarred)
    XCTAssertEqual(
      GroceryCategoryCatalog.category(for: "Pomodoro San Marzano"), .fruitsVegetables,
      "The ambiguous product name must not make manually entered fresh tomatoes canned")
  }

  func testAddItemTrimsInputAndRetainsAllMetadata() async {
    let store = AppStore(storageURL: fileURL)
    await store.addItem(
      label: "  Sparkling Water  ", barcode: "7610000000000",
      imageURL: URL(string: "https://example.com/water.jpg"), brand: "Example", stores: ["Market"],
      quantity: 4, unit: "bottles", exactLabel: "Sparkling Water 1L",
      genericLabel: "Sparkling Water", productSource: "Test", productType: "food",
      categoryHints: ["en:beverages"], metadataResolved: true)

    let item = try! XCTUnwrap(store.activeItems.first)
    XCTAssertEqual(item.label, "Sparkling Water")
    XCTAssertEqual(item.quantity, 4)
    XCTAssertEqual(item.unit, "bottles")
    XCTAssertEqual(item.stores, ["Market"])
    XCTAssertEqual(item.categoryHints, ["en:beverages"])
    XCTAssertTrue(item.metadataResolved == true)
  }

  func testBlankItemIsRejected() async {
    let store = AppStore(storageURL: fileURL)
    await store.addItem(label: "   \n")
    XCTAssertTrue(store.activeItems.isEmpty)
  }

  func testListUpdateDeleteAndLastListProtection() {
    let store = AppStore(storageURL: fileURL)
    store.createList(name: "Weekend")
    var weekend = store.lists[1]
    weekend.name = "Saturday"
    store.updateList(weekend)
    XCTAssertEqual(store.lists[1].name, "Saturday")

    store.activeListID = weekend.id
    store.deleteList(weekend)
    XCTAssertEqual(store.lists.count, 1)
    XCTAssertEqual(store.activeListID, store.lists[0].id)
    store.deleteList(store.lists[0])
    XCTAssertEqual(store.lists.count, 1)
  }

  func testStoreCreateRenameAndDelete() {
    let store = AppStore(storageURL: fileURL)
    store.createStore(name: "Market")
    store.stores[0].name = "City Market"
    store.save()
    XCTAssertEqual(store.stores[0].name, "City Market")
    store.deleteStore(store.stores[0])
    XCTAssertTrue(store.stores.isEmpty)
  }

  func testCustomBarcodeValidationReplacementSortingAndDeletion() {
    let store = AppStore(storageURL: fileURL)
    store.saveCustomBarcode(barcode: "123", label: "Too short")
    store.saveCustomBarcode(barcode: "7612345678901", label: " Zebra ")
    store.saveCustomBarcode(barcode: "12345670", label: "Apple")
    store.saveCustomBarcode(barcode: "7612345678901", label: "Updated")
    XCTAssertEqual(store.customBarcodes.map(\.label), ["Apple", "Updated"])
    store.deleteCustomBarcode(store.customBarcodes[0])
    XCTAssertEqual(store.customBarcodes.map(\.label), ["Updated"])
  }

  func testRemoveCallsMappedProvider() async {
    let provider = ProviderSpy()
    let store = AppStore(storageURL: fileURL) { _, _ in provider }
    store.providerConfigurations[.mealie] = ProviderConfiguration(enabled: true)
    var list = store.activeList
    list.syncTarget = SyncTarget(
      provider: .mealie, remoteListID: "remote", remoteListName: "Remote")
    store.updateList(list)
    let item = ShoppingItem(label: "Milk", remoteItemID: "remote-milk", sourceListID: list.id)
    store.items[list.id] = [item]

    await store.remove(item)

    XCTAssertTrue(store.items[list.id, default: []].isEmpty)
    let removedLabels = await provider.removedLabels()
    XCTAssertEqual(removedLabels, ["Milk"])
  }

  func testSyncRemovesLocalItemsMissingFromProvider() async {
    let provider = ProviderSpy(initialItems: [ProviderItem(id: "remote-bread", label: "Bread")])
    let store = AppStore(storageURL: fileURL) { _, _ in provider }
    store.providerConfigurations[.bring] = ProviderConfiguration(enabled: true)
    var list = store.activeList
    list.syncTarget = SyncTarget(provider: .bring, remoteListID: "remote", remoteListName: "Remote")
    store.updateList(list)
    store.items[list.id] = [
      ShoppingItem(label: "Bread", remoteItemID: "remote-bread", sourceListID: list.id),
      ShoppingItem(label: "Removed remotely", remoteItemID: "gone", sourceListID: list.id),
    ]

    await store.sync(list)

    XCTAssertEqual(store.items[list.id]?.map(\.label), ["Bread"])
  }

  func testShoppingAcrossMultipleListsAndHistoryLifecycle() async {
    let store = AppStore(storageURL: fileURL)
    let firstList = store.activeListID
    await store.addItem(label: "Bread")
    store.createList(name: "Pharmacy")
    let secondList = store.lists[1].id
    store.activeListID = secondList
    await store.addItem(label: "Soap")
    store.createStore(name: "Town Centre")
    store.startShopping(store: store.stores[0], listIDs: [firstList, secondList])
    XCTAssertEqual(Set(store.activeSession?.listIDs ?? []), [firstList, secondList])

    let soap = store.items[secondList]![0]
    await store.purchase(soap)
    XCTAssertEqual(store.activeSession?.purchasedItems.map(\.item.label), ["Soap"])
    store.finishShopping()
    XCTAssertNil(store.activeSession)
    XCTAssertNotNil(store.sessions.last?.completedAt)
  }

  func testModelTitlesAndProviderErrorsAreStable() {
    XCTAssertEqual(AppLanguage.allCases.map(\.title).count, 7)
    XCTAssertEqual(
      ProductLanguage.allCases.map(\.title),
      ["Automatic", "German", "English", "French", "Italian"])
    XCTAssertEqual(
      ProductLabelStyle.allCases.map(\.title), ["Generic name", "Exact product", "Ask every time"])
    XCTAssertEqual(ProviderKind.allCases.map(\.title), ["Bring", "Mealie"])
    XCTAssertNotNil(ProviderError.notConfigured.errorDescription)
    XCTAssertTrue(ProviderError.requestFailed(503).errorDescription?.contains("503") == true)
  }
}

private actor ProviderSpy: ShoppingProvider {
  private var remoteItems: [ProviderItem]
  private var adds: [String] = []
  private var restores: [String] = []
  private var removes: [String] = []

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
    removes.append(item.label)
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
  func removedLabels() -> [String] { removes }
}

private struct FailingProvider: ShoppingProvider {
  func lists() async throws -> [ProviderList] { throw URLError(.timedOut) }
  func items(in listID: String) async throws -> [ProviderItem] { throw URLError(.timedOut) }
  func addItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    throw URLError(.timedOut)
  }
  func removeItem(_ item: ShoppingItem, from listID: String) async throws {
    throw URLError(.timedOut)
  }
}

private struct CancelledProvider: ShoppingProvider {
  func lists() async throws -> [ProviderList] { throw URLError(.cancelled) }
  func items(in listID: String) async throws -> [ProviderItem] { throw URLError(.cancelled) }
  func addItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    throw URLError(.cancelled)
  }
  func removeItem(_ item: ShoppingItem, from listID: String) async throws {
    throw URLError(.cancelled)
  }
}
