import XCTest

@testable import ShoppingList

@MainActor
final class CloudTests: XCTestCase {
  private var fileURL: URL!
  private let baseURL = "https://cloud.example.com"

  override func setUp() {
    fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  }
  /// Set by tests that switch households: switching schedules syncs (250 ms debounce) that must
  /// finish before the next test's request log starts.
  private var schedulesSyncs = false

  override func tearDown() async throws {
    if schedulesSyncs { try await Task.sleep(for: .milliseconds(700)) }
    try? FileManager.default.removeItem(at: fileURL)
    StubURLProtocol.reset()
  }

  private func makeStore() -> AppStore {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StubURLProtocol.self]
    let client = HTTPClient(session: URLSession(configuration: configuration))
    return AppStore(
      storageURL: fileURL,
      providerFactory: { kind, config in
        kind == .cloud
          ? ShoppingListServerProvider(configuration: config, client: client)
          : ProviderFactory.make(kind: kind, configuration: config)
      },
      cloudService: CloudService(baseURL: baseURL, client: client))
  }

  private func signIn(_ store: AppStore) async throws {
    StubURLProtocol.respond(#"{"token":"slt_session","user":{"id":"u1","name":"Alex"}}"#)
    try await store.signInToCloud(with: CloudConfiguration.mockCredential)
  }

  func testFreshInstallAndUpdatedInstallAskForMode() async throws {
    let store = makeStore()
    XCTAssertTrue(store.needsModeChoice)
    await store.flushPersistence()
    XCTAssertTrue(AppStore(storageURL: fileURL).needsModeChoice)

    // State saved by an older version, with the old welcome flag and no mode, asks again.
    var json = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: fileURL)) as? [String: Any])
    json["storageMode"] = nil
    json["needsWelcome"] = false
    try JSONSerialization.data(withJSONObject: json).write(to: fileURL)
    XCTAssertTrue(AppStore(storageURL: fileURL).needsModeChoice)
  }

  func testOfflineIsRememberedAndUploadsNothing() async throws {
    let store = makeStore()
    store.chooseOffline()
    XCTAssertEqual(store.storageMode, .offline)
    XCTAssertNil(store.activeList.syncTarget)
    XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    await store.flushPersistence()
    XCTAssertEqual(AppStore(storageURL: fileURL).storageMode, .offline)
  }

  func testChoosingOfflineSignsOutALeftoverSession() async throws {
    let store = makeStore()
    try await signIn(store)
    store.chooseOffline()
    XCTAssertFalse(store.isCloudSignedIn)
    XCTAssertEqual(store.storageMode, .offline)
  }

  func testGoingOnlineMovesLocalListsAndAddsCloudLists() async throws {
    let store = makeStore()
    await store.addItem(label: "Milk")
    store.createList(name: "Party")
    let bring = store.createList(
      name: "Bring", target: SyncTarget(provider: .bring, remoteListID: "b1", remoteListName: "B"))
    try await signIn(store)
    // Cloud already has "groceries" (from another device) and "Work".
    StubURLProtocol.respond(
      #"{"items":[{"id":"r9","name":"groceries"},{"id":"r5","name":"Work"}]}"#)
    StubURLProtocol.respond(#"{"id":"r2","name":"Party"}"#, status: 201)
    StubURLProtocol.respond(#"{"items":[]}"#)  // Groceries (r9) before upload
    StubURLProtocol.respond(
      #"{"id":"m1","listId":"r9","label":"Milk","checked":false}"#, status: 201)

    try await store.goOnline()

    XCTAssertEqual(store.storageMode, .online)
    XCTAssertEqual(store.lists.map(\.name), ["Groceries", "Party", "Bring", "Work"])
    XCTAssertEqual(
      store.lists.map { $0.syncTarget?.remoteListID }, ["r9", "r2", "b1", "r5"])
    XCTAssertEqual(
      store.lists.map { $0.syncTarget?.provider }, [.cloud, .cloud, .bring, .cloud])
    XCTAssertEqual(store.lists.first(where: { $0.id == bring.id })?.syncTarget?.provider, .bring)
    XCTAssertTrue(store.lists.allSatisfy { $0.syncTarget != nil }, "Online keeps no local lists")
    let create = try XCTUnwrap(
      StubURLProtocol.requests.first { $0.httpMethod == "POST" && $0.url?.path == "/api/v1/lists" })
    XCTAssertEqual(create.value(forHTTPHeaderField: "Authorization"), "Bearer slt_session")
    // Milk had no remote ID, so syncing Groceries uploads it.
    XCTAssertTrue(
      StubURLProtocol.requests.contains {
        $0.httpMethod == "POST" && $0.url?.path == "/api/v1/lists/r9/items"
      })
  }

  func testGoingOnlineFailureStaysUndecidedAndRetryFinishes() async throws {
    let store = makeStore()
    store.createList(name: "Party")
    try await signIn(store)
    StubURLProtocol.respond(#"{"items":[]}"#)
    StubURLProtocol.respond(#"{"id":"r1","name":"Groceries"}"#, status: 201)
    StubURLProtocol.respond(#"{"error":"unavailable"}"#, status: 503)
    do {
      try await store.goOnline()
      XCTFail("Expected Cloud to fail")
    } catch {}
    XCTAssertNil(store.storageMode)
    XCTAssertEqual(store.lists.map { $0.syncTarget?.remoteListID }, ["r1", nil])

    // The retry sees r1 as already linked and only creates Party.
    StubURLProtocol.respond(#"{"items":[{"id":"r1","name":"Groceries"}]}"#)
    StubURLProtocol.respond(#"{"id":"r2","name":"Party"}"#, status: 201)
    try await store.goOnline()
    XCTAssertEqual(store.storageMode, .online)
    XCTAssertEqual(store.lists.map { $0.syncTarget?.remoteListID }, ["r1", "r2"])
  }

  func testGoingOnlineRequiresSignIn() async {
    let store = makeStore()
    do {
      try await store.goOnline()
      XCTFail("Expected notConfigured")
    } catch {}
    XCTAssertNil(store.storageMode)
    XCTAssertTrue(StubURLProtocol.requests.isEmpty)
  }

  func testSignInStoresAccountAndSendsAppleCredential() async throws {
    let store = makeStore()
    try await signIn(store)

    XCTAssertTrue(store.isCloudSignedIn)
    XCTAssertEqual(store.cloudAccount?.name, "Alex")
    XCTAssertEqual(store.cloudAccount?.appleUserID, "mock-apple-user")
    XCTAssertEqual(store.providerConfigurations[.cloud]?.secret, "slt_session")
    let request = try XCTUnwrap(StubURLProtocol.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "\(baseURL)/api/v1/auth/apple")
    XCTAssertEqual(request.httpMethod, "POST")
    let body = try XCTUnwrap(
      JSONSerialization.jsonObject(with: StubURLProtocol.bodies.first ?? Data()) as? [String: Any])
    XCTAssertEqual(body["identityToken"] as? String, "mock-identity-token")
    XCTAssertEqual(body["authorizationCode"] as? String, "mock-authorization-code")
    XCTAssertEqual(body["givenName"] as? String, "Alex")
  }

  func testFailedSignInLeavesStoreSignedOut() async {
    let store = makeStore()
    StubURLProtocol.respond(#"{"error":"unauthorized"}"#, status: 401)
    do {
      try await store.signInToCloud(with: CloudConfiguration.mockCredential)
      XCTFail("Expected sign-in to fail")
    } catch {}
    XCTAssertFalse(store.isCloudSignedIn)
    XCTAssertNil(store.cloudAccount)
  }

  func testCreateCloudListCreatesNothingWhenServerFails() async throws {
    let store = makeStore()
    try await signIn(store)
    StubURLProtocol.respond(#"{}"#, status: 500)
    do {
      try await store.createCloudList(name: "Party")
      XCTFail("Expected failure")
    } catch {}
    XCTAssertEqual(store.lists.count, 1)

    StubURLProtocol.respond(#"{"id":"r2","name":"Party"}"#, status: 201)
    try await store.createCloudList(name: "Party")
    XCTAssertEqual(store.lists.last?.syncTarget?.remoteListID, "r2")
    XCTAssertEqual(store.lists.last?.syncTarget?.provider, .cloud)
  }

  func testCreatingCloudListRequiresSignIn() async {
    let store = makeStore()
    do {
      try await store.createCloudList(name: "Party")
      XCTFail("Expected notConfigured")
    } catch ProviderError.notConfigured {
    } catch { XCTFail("Unexpected error \(error)") }
    XCTAssertTrue(StubURLProtocol.requests.isEmpty)
  }

  func testSignOutKeepsCloudListsLocally() async throws {
    let store = makeStore()
    try await signIn(store)
    StubURLProtocol.respond(#"{"items":[]}"#)
    StubURLProtocol.respond(#"{"id":"r1","name":"Groceries"}"#, status: 201)
    StubURLProtocol.respond(
      #"{"items":[{"id":"i1","listId":"r1","label":"Milk","checked":false}]}"#)
    try await store.goOnline()
    XCTAssertEqual(store.activeItems.first?.remoteItemID, "i1")

    store.signOutOfCloud()

    XCTAssertFalse(store.isCloudSignedIn)
    XCTAssertEqual(store.storageMode, .offline, "Signing out switches to offline")
    XCTAssertNil(store.activeList.syncTarget)
    XCTAssertEqual(store.activeItems.map(\.label), ["Milk"])
    XCTAssertNil(store.activeItems.first?.remoteItemID)
  }

  func testDeleteAccountCallsServerThenSignsOut() async throws {
    let store = makeStore()
    try await signIn(store)
    StubURLProtocol.respond("", status: 204)

    try await store.deleteCloudAccount()

    let request = try XCTUnwrap(StubURLProtocol.requests.last)
    XCTAssertEqual(request.httpMethod, "DELETE")
    XCTAssertEqual(request.url?.absoluteString, "\(baseURL)/api/v1/me")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer slt_session")
    XCTAssertFalse(store.isCloudSignedIn)
  }

  func testFailedDeletionKeepsAccount() async throws {
    let store = makeStore()
    try await signIn(store)
    StubURLProtocol.respond("{}", status: 500)
    do {
      try await store.deleteCloudAccount()
      XCTFail("Expected failure")
    } catch {}
    XCTAssertTrue(store.isCloudSignedIn)
  }

  func testPendingIconClearsWhenServerFinishes() async throws {
    let store = makeStore()
    try await signIn(store)
    StubURLProtocol.respond(#"{"items":[]}"#)
    StubURLProtocol.respond(#"{"id":"r1","name":"Groceries"}"#, status: 201)
    StubURLProtocol.respond(#"{"items":[]}"#)
    try await store.goOnline()

    StubURLProtocol.respond(
      #"{"id":"k1","listId":"r1","label":"Kombucha","checked":false,"icon":null,"iconStatus":"pending"}"#,
      status: 201)
    await store.addItem(label: "Kombucha")
    XCTAssertEqual(store.activeItems.first?.iconPending, true)
    XCTAssertTrue(store.activeListHasPendingIcons)

    StubURLProtocol.respond(
      #"{"items":[{"id":"k1","listId":"r1","label":"Kombucha","checked":false,"icon":"gen-kombucha","iconUrl":"https://cloud.example.com/static/icons/gen-kombucha.png","category":"beverages","iconStatus":"ready"}]}"#
    )
    await store.sync()
    XCTAssertNil(store.activeItems.first?.iconPending)
    XCTAssertEqual(store.activeItems.first?.iconName, "gen-kombucha")
    XCTAssertFalse(store.activeListHasPendingIcons)
  }

  func testSameLabelTwiceOnServerKeepsTwoItemsThatBothUpdate() async throws {
    let store = makeStore()
    try await signIn(store)
    StubURLProtocol.respond(#"{"items":[]}"#)
    StubURLProtocol.respond(#"{"id":"r1","name":"Groceries"}"#, status: 201)
    StubURLProtocol.respond(#"{"items":[]}"#)
    try await store.goOnline()

    StubURLProtocol.respond(
      #"{"id":"k1","listId":"r1","label":"Kombucha","checked":false,"icon":null,"iconStatus":"pending"}"#,
      status: 201)
    await store.addItem(label: "Kombucha")

    // The same label was added again elsewhere: both stay, each with its own local ID.
    StubURLProtocol.respond(
      #"{"items":[{"id":"k1","listId":"r1","label":"Kombucha","checked":false,"icon":null,"iconStatus":"pending"},{"id":"k2","listId":"r1","label":"Kombucha","checked":false,"icon":null,"iconStatus":"pending"}]}"#
    )
    await store.sync()
    XCTAssertEqual(store.activeItems.map(\.remoteItemID), ["k1", "k2"])
    XCTAssertEqual(Set(store.activeItems.map(\.id)).count, 2, "Local IDs must stay unique")

    StubURLProtocol.respond(
      #"{"items":[{"id":"k1","listId":"r1","label":"Kombucha","checked":false,"icon":"gen-kombucha","iconUrl":"https://cloud.example.com/api/v1/icons/gen-kombucha.png","iconStatus":"ready"},{"id":"k2","listId":"r1","label":"Kombucha","checked":false,"icon":"gen-kombucha","iconUrl":"https://cloud.example.com/api/v1/icons/gen-kombucha.png","iconStatus":"ready"}]}"#
    )
    await store.sync()
    XCTAssertEqual(store.activeItems.count, 2)
    XCTAssertEqual(Set(store.activeItems.map(\.id)).count, 2)
    XCTAssertTrue(store.activeItems.allSatisfy { $0.iconPending == nil })
    XCTAssertTrue(store.activeItems.allSatisfy { $0.iconName == "gen-kombucha" })
    XCTAssertFalse(store.activeListHasPendingIcons)
  }

  func testLocalListsNeverReportPendingIcons() async {
    let store = makeStore()
    await store.addItem(label: "Kombucha")
    store.items[store.activeListID]?[0].iconPending = true
    XCTAssertFalse(store.activeListHasPendingIcons, "Only synced lists can be polled")
  }

  func testCloudAccountPersistsWithTokenInKeychain() async throws {
    let store = makeStore()
    try await signIn(store)
    await store.flushPersistence()

    let saved = try String(contentsOf: fileURL, encoding: .utf8)
    XCTAssertFalse(saved.contains("slt_session"), "The session token must not be in the JSON file")
    let reloaded = AppStore(storageURL: fileURL)
    XCTAssertEqual(reloaded.cloudAccount?.userID, "u1")
    XCTAssertTrue(reloaded.isCloudSignedIn)
    reloaded.signOutOfCloud()
    await reloaded.flushPersistence()
  }

  func testSyncResultKeepsItemsAddedAndRemovedWhileItRan() {
    let list = UUID()
    let milk = ShoppingItem(label: "Milk", sourceListID: list)
    let bread = ShoppingItem(label: "Bread", sourceListID: list)
    let eggs = ShoppingItem(label: "Eggs", sourceListID: list)
    var syncedMilk = milk
    syncedMilk.iconName = "milk"
    syncedMilk.iconPending = nil
    let syncedBread = bread
    let remoteOnly = ShoppingItem(label: "Cheese", sourceListID: list)

    // Snapshot at sync start: milk, bread. Meanwhile bread was deleted and eggs added.
    let merged = AppStore.merge(
      [syncedMilk, syncedBread, remoteOnly], into: [milk, eggs], snapshot: [milk, bread])

    XCTAssertEqual(merged.map(\.label), ["Milk", "Cheese", "Eggs"])
    XCTAssertEqual(merged.first?.iconName, "milk", "The sync's newer presentation wins")
  }

  func testNonGroceryCategories() {
    let expected: [String: GroceryCategory] = [
      "Hose": .clothing, "Socken": .clothing, "T-Shirt": .clothing, "Schuhe": .clothing,
      "Gartenschlauch": .gardenDIY, "garden hose": .gardenDIY, "Blumenerde": .gardenDIY,
      "Glühbirne": .gardenDIY, "Ladekabel": .electronics, "Batterien": .electronics,
      "Kopfhörer": .electronics, "Kugelschreiber": .officeSchool, "Druckerpapier": .officeSchool,
      // Words that must stay groceries.
      "Coca Cola": .beverages, "Penne": .pastaRiceGrains, "Sonnenblumenkerne": .other,
    ]
    for (label, category) in expected {
      XCTAssertEqual(GroceryCategoryCatalog.category(for: label), category, label)
    }
    XCTAssertEqual(GroceryCategory(key: "clothing"), .clothing)
    XCTAssertEqual(GroceryCategory.allCases.last, .other, "Other stays last")
  }

  // MARK: Households

  private func onlineWithGroceries(_ store: AppStore) async throws {
    schedulesSyncs = true
    try await signIn(store)
    StubURLProtocol.respond(#"{"items":[]}"#)
    StubURLProtocol.respond(#"{"id":"r1","name":"Groceries"}"#, status: 201)
    StubURLProtocol.respond(#"{"items":[]}"#)
    try await store.goOnline()
    StubURLProtocol.reset()
  }

  func testSwitchingHouseholdsReplacesOnlyCloudLists() async throws {
    let store = makeStore()
    try await onlineWithGroceries(store)
    let bring = store.createList(
      name: "Bring", target: SyncTarget(provider: .bring, remoteListID: "b1", remoteListName: "B"))
    StubURLProtocol.respond(
      #"{"token":"slt_sam","household":{"id":"h2","name":"Sam","role":"member"}}"#)
    StubURLProtocol.respond(#"{"items":[{"id":"s1","name":"Sam's Groceries"}]}"#)

    try await store.switchHousehold(to: "h2")

    XCTAssertEqual(store.providerConfigurations[.cloud]?.secret, "slt_sam")
    XCTAssertEqual(store.lists.map(\.name), ["Bring", "Sam's Groceries"])
    XCTAssertTrue(store.lists.contains { $0.id == bring.id })
    XCTAssertTrue(store.lists.contains { $0.id == store.activeListID })
    let session = try XCTUnwrap(StubURLProtocol.requests.first)
    XCTAssertEqual(session.url?.path, "/api/v1/households/h2/session")
    XCTAssertEqual(session.value(forHTTPHeaderField: "Authorization"), "Bearer slt_session")
    // The new household's lists are loaded with the new token.
    XCTAssertEqual(
      StubURLProtocol.requests[1].value(forHTTPHeaderField: "Authorization"), "Bearer slt_sam")
  }

  func testFailedSwitchChangesNothing() async throws {
    let store = makeStore()
    try await onlineWithGroceries(store)
    let before = store.lists
    StubURLProtocol.respond(
      #"{"token":"slt_sam","household":{"id":"h2","name":"Sam","role":"member"}}"#)
    StubURLProtocol.respond(#"{"error":"unavailable"}"#, status: 503)
    do {
      try await store.switchHousehold(to: "h2")
      XCTFail("Expected failure")
    } catch {}
    XCTAssertEqual(store.lists, before)
    XCTAssertEqual(store.providerConfigurations[.cloud]?.secret, "slt_session")
  }

  func testEmptyHouseholdGetsAGroceriesList() async throws {
    let store = makeStore()
    try await onlineWithGroceries(store)
    StubURLProtocol.respond(
      #"{"token":"slt_new","household":{"id":"h3","name":"New","role":"member"}}"#)
    StubURLProtocol.respond(#"{"items":[]}"#)
    StubURLProtocol.respond(#"{"id":"n1","name":"Groceries"}"#, status: 201)

    try await store.acceptInvite("abc")

    let accept = StubURLProtocol.requests[0]
    XCTAssertEqual(
      accept.url?.path, "/api/v1/invites/accept", "The invitation never goes in the path")
    XCTAssertEqual(
      try JSONSerialization.jsonObject(with: StubURLProtocol.bodies[0]) as? [String: String],
      ["invite": "abc"])
    XCTAssertEqual(store.lists.map { $0.syncTarget?.remoteListID }, ["n1"])
  }

  func testLeavingGetsTheNextSessionBeforeLeaving() async throws {
    let store = makeStore()
    try await onlineWithGroceries(store)
    store.household = Household(id: "h1", name: "Mine", role: .member)
    StubURLProtocol.respond(
      #"{"items":[{"id":"h1","name":"Mine","role":"member"},{"id":"h2","name":"Own","role":"owner"}]}"#
    )
    StubURLProtocol.respond(
      #"{"token":"slt_own","household":{"id":"h2","name":"Own","role":"owner"}}"#)
    StubURLProtocol.respond("", status: 204)
    StubURLProtocol.respond(#"{"items":[{"id":"o1","name":"Own Groceries"}]}"#)

    try await store.leaveHousehold()

    XCTAssertEqual(
      StubURLProtocol.requests.prefix(3).map { "\($0.httpMethod ?? "") \($0.url?.path ?? "")" },
      [
        "GET /api/v1/households", "POST /api/v1/households/h2/session",
        "DELETE /api/v1/household/members/u1",
      ])
    XCTAssertEqual(store.providerConfigurations[.cloud]?.secret, "slt_own")
    XCTAssertEqual(store.lists.map(\.name), ["Own Groceries"])
  }

  func testCannotLeaveTheOnlyHousehold() async throws {
    let store = makeStore()
    try await onlineWithGroceries(store)
    store.household = Household(id: "h1", name: "Mine", role: .owner)
    StubURLProtocol.respond(#"{"items":[{"id":"h1","name":"Mine","role":"owner"}]}"#)
    do {
      try await store.leaveHousehold()
      XCTFail("Expected onlyHousehold")
    } catch HouseholdError.onlyHousehold {
    } catch { XCTFail("Unexpected \(error)") }
    XCTAssertEqual(StubURLProtocol.requests.count, 1)
  }

  func testInviteLinks() {
    XCTAssertEqual(
      InviteLink.token(in: URL(string: "https://shopping-list.tueftli.com/app/invite/abc123")!),
      "abc123")
    XCTAssertEqual(InviteLink.token(in: URL(string: "shoppinglist://invite/abc123")!), "abc123")
    XCTAssertNil(InviteLink.token(in: URL(string: "https://example.com/invite/abc")!))
    XCTAssertNil(InviteLink.token(in: URL(string: "shoppinglist://lists/abc")!))
  }

  func testToysSportsCarBooksAndPharmacy() {
    let expected: [String: GroceryCategory] = [
      "LEGO": .toysGames, "Puzzle": .toysGames, "Zauberwürfel": .toysGames,
      "Malbuch": .toysGames, "Seifenblasen": .toysGames, "Brettspiel": .toysGames,
      "Plüschtier": .toysGames, "Spielkarten": .toysGames,
      "Tennisbälle": .sportsOutdoor, "Wanderschuhe": .sportsOutdoor,
      "Campinggas": .sportsOutdoor, "Badehose": .sportsOutdoor, "Yogamatte": .sportsOutdoor,
      "Motoröl": .carBike, "Scheibenwischwasser": .carBike, "Vignette": .carBike,
      "Velopumpe": .carBike, "Fahrradpumpe": .carBike, "Kettenöl": .carBike,
      "Veloschlauch": .carBike, "Fahrradschlauch": .carBike, "Reifen": .carBike,
      "Velolicht": .carBike,
      "Zeitung": .booksMagazines, "Zeitschrift": .booksMagazines, "Buch": .booksMagazines,
      "Rätselheft": .booksMagazines, "Comic": .booksMagazines, "newspaper": .booksMagazines,
      "Kondom": .health, "Kondome": .health, "condoms": .health, "Präservativ": .health,
      "préservatif": .health, "preservativo": .health, "Gleitgel": .health,
      "lubricant": .health, "Schwangerschaftstest": .health, "pregnancy test": .health,
      "Ibuprofen": .health, "Paracetamol": .health, "Aspirin": .health, "Dafalgan": .health,
      "Nasenspray": .health, "Hustensirup": .health, "cough syrup": .health,
      "Lutschtabletten": .health, "throat lozenges": .health,
      "Fieberthermometer": .health, "Vitamintabletten": .health,
      // Words that must keep their category.
      "Mozzarella": .cheese, "Heft": .officeSchool, "Sonnencreme": .personalCare,
      "Kaugummi": .snacksSweets, "sunscreen": .personalCare,
    ]
    for (label, category) in expected {
      XCTAssertEqual(GroceryCategoryCatalog.category(for: label), category, label)
    }
    XCTAssertEqual(
      GroceryCategory.allCases.suffix(5),
      [.toysGames, .sportsOutdoor, .carBike, .booksMagazines, .other])
  }
}
