import XCTest

@testable import ShoppingList

@MainActor
final class CloudTests: XCTestCase {
  private var fileURL: URL!
  private let baseURL = "https://cloud.example.com"

  override func setUp() {
    fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  }
  override func tearDown() {
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

  func testFreshInstallShowsWelcomeButSavedStateDoesNot() async throws {
    let store = makeStore()
    XCTAssertTrue(store.needsWelcome)
    await store.flushPersistence()
    XCTAssertTrue(AppStore(storageURL: fileURL).needsWelcome)

    // State saved by a version without the welcome card must not show it.
    var json = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: fileURL)) as? [String: Any])
    json["needsWelcome"] = nil
    try JSONSerialization.data(withJSONObject: json).write(to: fileURL)
    XCTAssertFalse(AppStore(storageURL: fileURL).needsWelcome)
  }

  func testWelcomeKeepsListOnIPhone() async throws {
    let store = makeStore()
    try await store.completeWelcome(name: "  Wocheneinkauf ", inCloud: false)
    XCTAssertFalse(store.needsWelcome)
    XCTAssertEqual(store.lists.map(\.name), ["Wocheneinkauf"])
    XCTAssertNil(store.activeList.syncTarget)
    XCTAssertTrue(StubURLProtocol.requests.isEmpty)
  }

  func testAddingAnItemAnswersWelcomeWithLocal() async {
    let store = makeStore()
    await store.addItem(label: "Milk")
    XCTAssertFalse(store.needsWelcome)
    XCTAssertNil(store.activeList.syncTarget)
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

  func testWelcomeInCloudCreatesRemoteListAndUploadsItems() async throws {
    let store = makeStore()
    try await signIn(store)
    StubURLProtocol.respond(#"{"id":"r1","name":"Groceries"}"#, status: 201)
    StubURLProtocol.respond(#"{"items":[]}"#)

    try await store.completeWelcome(name: "Groceries", inCloud: true)

    XCTAssertFalse(store.needsWelcome)
    XCTAssertEqual(
      store.activeList.syncTarget,
      SyncTarget(provider: .cloud, remoteListID: "r1", remoteListName: "Groceries"))
    let create = StubURLProtocol.requests[1]
    XCTAssertEqual(create.httpMethod, "POST")
    XCTAssertEqual(create.url?.path, "/api/v1/lists")
    XCTAssertEqual(create.value(forHTTPHeaderField: "Authorization"), "Bearer slt_session")
    XCTAssertEqual(
      try JSONSerialization.jsonObject(with: StubURLProtocol.bodies[1]) as? [String: String],
      ["name": "Groceries"])
  }

  func testWelcomeInCloudFailureKeepsCardAndLocalList() async throws {
    let store = makeStore()
    try await signIn(store)
    StubURLProtocol.respond(#"{"error":"unavailable"}"#, status: 503)
    do {
      try await store.completeWelcome(name: "Groceries", inCloud: true)
      XCTFail("Expected Cloud to be unreachable")
    } catch {}
    XCTAssertTrue(store.needsWelcome)
    XCTAssertNil(store.activeList.syncTarget)
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
    StubURLProtocol.respond(#"{"id":"r1","name":"Groceries"}"#, status: 201)
    StubURLProtocol.respond(
      #"{"items":[{"id":"i1","listId":"r1","label":"Milk","checked":false}]}"#)
    try await store.completeWelcome(name: "Groceries", inCloud: true)
    XCTAssertEqual(store.activeItems.first?.remoteItemID, "i1")

    store.signOutOfCloud()

    XCTAssertFalse(store.isCloudSignedIn)
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
    StubURLProtocol.respond(#"{"id":"r1","name":"Groceries"}"#, status: 201)
    StubURLProtocol.respond(#"{"items":[]}"#)
    try await store.completeWelcome(name: "Groceries", inCloud: true)

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
}
