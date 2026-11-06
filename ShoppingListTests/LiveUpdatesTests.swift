import XCTest

@testable import ShoppingList

final class ServerEventParserTests: XCTestCase {
  private func parse(_ text: String) -> (events: [ServerEvent], parser: ServerEventParser) {
    var parser = ServerEventParser()
    var events: [ServerEvent] = []
    for line in text.replacingOccurrences(of: "\r\n", with: "\n").split(
      separator: "\n", omittingEmptySubsequences: false)
    {
      if let event = parser.consume(String(line)) { events.append(event) }
    }
    return (events, parser)
  }

  func testParsesTheServersEvents() {
    let stream = """
      retry: 5000

      id: 1
      event: ready
      data: {"tenantId":"t1"}

      : ping

      id: 2
      event: item.created
      data: {"item":{"id":"i1","listId":"l1","label":"Milk","iconStatus":"pending"}}

      id: 3
      event: item.deleted
      data: {"id":"i1","listId":"l1"}

      id: 4
      event: list.deleted
      data: {"id":"l2"}

      id: 5
      event: list.updated
      data: {"list":{"id":"l3","name":"Party"}}


      """
    let (events, parser) = parse(stream)
    XCTAssertEqual(
      events.map(\.name), ["ready", "item.created", "item.deleted", "list.deleted", "list.updated"])
    XCTAssertEqual(events.map(\.listID), [nil, "l1", "l1", "l2", "l3"])
    XCTAssertEqual(events.last?.listName, "Party")
    XCTAssertEqual(parser.lastEventID, "5")
    XCTAssertEqual(parser.retry, .milliseconds(5000))
  }

  func testJoinsDataLinesAndDefaultsTheEventName() {
    let (events, _) = parse("data: first\r\ndata:second\r\n\r\n")
    XCTAssertEqual(events, [ServerEvent(name: "message", data: "first\nsecond")])
  }

  func testIgnoresEventsWithoutData() {
    let (events, parser) = parse("id: 7\nevent: ping\n\n")
    XCTAssertTrue(events.isEmpty)
    XCTAssertEqual(parser.lastEventID, "7")
  }
}

@MainActor
final class LiveUpdatesStoreTests: XCTestCase {
  private var fileURL: URL!

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
    let store = AppStore(
      storageURL: fileURL,
      providerFactory: { kind, config in
        ShoppingListServerProvider(configuration: config, client: client)
      })
    store.providerConfigurations[.cloud] = ProviderConfiguration(
      enabled: true, serverURL: "https://cloud.example.com", secret: "slt_session")
    store.cloudAccount = CloudAccount(userID: "u1", appleUserID: "a1", name: nil)
    store.storageMode = .online
    store.lists[0].syncTarget = SyncTarget(
      provider: .cloud, remoteListID: "r1", remoteListName: "Groceries")
    return store
  }

  private func event(_ name: String, _ data: String) -> ServerEvent {
    ServerEvent(name: name, data: data)
  }

  func testItemEventFromAnotherDeviceSyncsThatList() async throws {
    let store = makeStore()
    StubURLProtocol.respond(
      #"{"items":[{"id":"i1","listId":"r1","label":"Pears","checked":false}]}"#)

    await store.handle(
      event("item.created", #"{"item":{"id":"i1","listId":"r1","label":"Pears"}}"#), from: .cloud)
    try await Task.sleep(for: .milliseconds(600))

    XCTAssertEqual(store.activeItems.map(\.label), ["Pears"])
    XCTAssertEqual(StubURLProtocol.requests.count, 1)
  }

  func testBurstOfEventsIsOneSync() async throws {
    let store = makeStore()
    StubURLProtocol.respond(#"{"items":[]}"#)
    for _ in 0..<5 {
      await store.handle(
        event("item.updated", #"{"item":{"id":"i1","listId":"r1"}}"#), from: .cloud)
    }
    try await Task.sleep(for: .milliseconds(600))
    XCTAssertEqual(StubURLProtocol.requests.count, 1)
  }

  func testEventsForOtherListsAndReadyAreIgnored() async throws {
    let store = makeStore()
    await store.handle(event("ready", #"{"tenantId":"t"}"#), from: .cloud)
    await store.handle(event("item.created", #"{"item":{"listId":"r1"}}"#), from: .server)
    try await Task.sleep(for: .milliseconds(400))
    XCTAssertTrue(StubURLProtocol.requests.isEmpty)
  }

  func testListEventsRenameAndDeleteCloudLists() async throws {
    let store = makeStore()
    let party = store.createList(
      name: "Party",
      target: SyncTarget(provider: .cloud, remoteListID: "r2", remoteListName: "Party"))

    await store.handle(
      event("list.updated", #"{"list":{"id":"r2","name":"Fest"}}"#), from: .cloud)
    XCTAssertEqual(store.lists.first(where: { $0.id == party.id })?.name, "Fest")

    await store.handle(event("list.deleted", #"{"id":"r2"}"#), from: .cloud)
    XCTAssertNil(store.lists.first(where: { $0.id == party.id }))
    // The last list is kept.
    await store.handle(event("list.deleted", #"{"id":"r1"}"#), from: .cloud)
    XCTAssertEqual(store.lists.count, 1)
    XCTAssertTrue(StubURLProtocol.requests.isEmpty)
  }

  func testLiveUpdateKeyFollowsActivityAndServers() {
    let store = makeStore()
    XCTAssertEqual(store.liveUpdateKey(isActive: true).servers.count, 1)
    XCTAssertNotEqual(store.liveUpdateKey(isActive: true), store.liveUpdateKey(isActive: false))
    store.signOutOfCloud()
    XCTAssertTrue(store.liveUpdateKey(isActive: true).servers.isEmpty)
  }
}
