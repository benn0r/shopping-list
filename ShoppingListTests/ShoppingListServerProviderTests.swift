import XCTest

@testable import ShoppingList

final class ShoppingListServerProviderTests: XCTestCase {
  override func tearDown() { StubURLProtocol.reset() }

  private func provider(url: String = "https://lists.example.com/", secret: String = "slt_test")
    -> ShoppingListServerProvider
  {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StubURLProtocol.self]
    return ShoppingListServerProvider(
      configuration: ProviderConfiguration(enabled: true, serverURL: url, secret: secret),
      client: HTTPClient(session: URLSession(configuration: configuration)))
  }

  func testListsSendBearerTokenAndDecodeEnvelope() async throws {
    StubURLProtocol.respond(
      #"{"items":[{"id":"l1","name":"Groceries","openItems":2,"checkedItems":0}]}"#)

    let lists = try await provider().lists()

    XCTAssertEqual(lists, [ProviderList(id: "l1", name: "Groceries")])
    let request = try XCTUnwrap(StubURLProtocol.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://lists.example.com/api/v1/lists")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer slt_test")
  }

  func testItemsRequestOpenItemsAndKeepServerIcon() async throws {
    StubURLProtocol.respond(
      #"""
      {"items":[
        {"id":"i1","listId":"l1","label":"Hafermilch","quantity":2,"unit":"l","barcode":null,
         "note":null,"checked":false,"icon":"oat_milk"},
        {"id":"i2","listId":"l1","label":"Mystery","quantity":null,"unit":null,"barcode":null,
         "note":null,"checked":false,"icon":null},
        {"id":"i3","listId":"l1","label":"Kombucha","quantity":null,"unit":null,"barcode":null,
         "note":null,"checked":false,"icon":"gen-kombucha","category":"beverages",
         "iconUrl":"https://lists.example.com/static/icons/gen-kombucha.png"}
      ]}
      """#)

    let items = try await provider().items(in: "l1")

    XCTAssertEqual(
      StubURLProtocol.requests.first?.url?.absoluteString,
      "https://lists.example.com/api/v1/lists/l1/items?filter=open")
    XCTAssertEqual(items.map(\.icon), ["oat_milk", nil, "gen-kombucha"])
    XCTAssertEqual(
      items.last?.iconURL?.absoluteString,
      "https://lists.example.com/static/icons/gen-kombucha.png")
    XCTAssertEqual(items.map(\.category), [nil, nil, "beverages"])
    XCTAssertEqual(items.first?.quantity, 2)
    XCTAssertEqual(items.first?.unit, "l")
  }

  func testAddPostsItemAndReturnsCreatedIcon() async throws {
    StubURLProtocol.respond(
      #"{"id":"new","listId":"l1","label":"Milk","quantity":1,"unit":null,"barcode":"7612345678901","note":null,"checked":false,"icon":"milk"}"#,
      status: 201)
    let item = ShoppingItem(
      barcode: "7612345678901", label: "Milk", quantity: 1, sourceListID: UUID())

    let remote = try await provider().addItem(item, to: "l1")

    XCTAssertEqual(remote.id, "new")
    XCTAssertEqual(remote.icon, "milk")
    let request = try XCTUnwrap(StubURLProtocol.requests.first)
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.url?.path, "/api/v1/lists/l1/items")
    let body = try XCTUnwrap(
      JSONSerialization.jsonObject(with: StubURLProtocol.bodies.first ?? Data()) as? [String: Any])
    XCTAssertEqual(body["label"] as? String, "Milk")
    XCTAssertEqual(body["barcode"] as? String, "7612345678901")
    XCTAssertNil(body["unit"])
  }

  func testRemoveAndRestoreToggleChecked() async throws {
    let item = ShoppingItem(label: "Milk", remoteItemID: "i1", sourceListID: UUID())
    StubURLProtocol.respond(
      #"{"id":"i1","listId":"l1","label":"Milk","checked":true,"icon":"milk"}"#)
    try await provider().removeItem(item, from: "l1")
    StubURLProtocol.respond(
      #"{"id":"i1","listId":"l1","label":"Milk","checked":false,"icon":"milk"}"#)
    let restored = try await provider().restoreItem(item, to: "l1")

    XCTAssertEqual(StubURLProtocol.requests.map(\.httpMethod), ["PATCH", "PATCH"])
    XCTAssertEqual(StubURLProtocol.requests.map(\.url?.path), ["/api/v1/items/i1", "/api/v1/items/i1"])
    let bodies = try StubURLProtocol.bodies.map {
      try XCTUnwrap(JSONSerialization.jsonObject(with: $0) as? [String: Bool])
    }
    XCTAssertEqual(bodies, [["checked": true], ["checked": false]])
    XCTAssertEqual(restored.icon, "milk")
  }

  func testRestoreAddsItemAgainWhenServerDeletedIt() async throws {
    let item = ShoppingItem(label: "Milk", remoteItemID: "gone", sourceListID: UUID())
    StubURLProtocol.respond(#"{"error":"not_found","message":"Item not found."}"#, status: 404)
    StubURLProtocol.respond(
      #"{"id":"again","listId":"l1","label":"Milk","checked":false,"icon":null}"#, status: 201)

    let restored = try await provider().restoreItem(item, to: "l1")

    XCTAssertEqual(restored.id, "again")
    XCTAssertEqual(StubURLProtocol.requests.map(\.httpMethod), ["PATCH", "POST"])
  }

  func testMissingURLOrKeyIsNotConfigured() async {
    for value in [provider(url: ""), provider(secret: "")] {
      do {
        _ = try await value.lists()
        XCTFail("Expected notConfigured")
      } catch ProviderError.notConfigured {
      } catch { XCTFail("Unexpected error \(error)") }
    }
    XCTAssertTrue(StubURLProtocol.requests.isEmpty)
  }
}

private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var responses: [(status: Int, body: String)] = []
  nonisolated(unsafe) private(set) static var requests: [URLRequest] = []
  nonisolated(unsafe) private(set) static var bodies: [Data] = []

  static func respond(_ body: String, status: Int = 200) {
    lock.withLock { responses.append((status, body)) }
  }
  static func reset() {
    lock.withLock {
      responses = []
      requests = []
      bodies = []
    }
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let response = Self.lock.withLock {
      Self.requests.append(request)
      if let body = request.httpBody ?? request.httpBodyStream.map(Self.read) {
        Self.bodies.append(body)
      }
      return Self.responses.isEmpty ? (status: 404, body: "{}") : Self.responses.removeFirst()
    }
    let http = HTTPURLResponse(
      url: request.url!, statusCode: response.status, httpVersion: nil,
      headerFields: ["Content-Type": "application/json"])!
    client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(response.body.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}

  private static func read(_ stream: InputStream) -> Data {
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
      let count = stream.read(&buffer, maxLength: buffer.count)
      guard count > 0 else { break }
      data.append(buffer, count: count)
    }
    return data
  }
}
