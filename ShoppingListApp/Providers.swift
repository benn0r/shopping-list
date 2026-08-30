import Foundation

enum ProviderError: LocalizedError {
  case notConfigured, missingBringAPIKey, invalidResponse
  case requestFailed(Int)
  var errorDescription: String? {
    switch self {
    case .notConfigured: "Sync provider is not configured."
    case .missingBringAPIKey:
      "Bring API key is missing from this build. Set BRING_API_KEY and rebuild the app."
    case .invalidResponse: "The sync provider returned an invalid response."
    case .requestFailed(let status): "The sync provider request failed (HTTP \(status))."
    }
  }
}

protocol ShoppingProvider: Sendable {
  func lists() async throws -> [ProviderList]
  func items(in listID: String) async throws -> [ProviderItem]
  func addItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem
  func removeItem(_ item: ShoppingItem, from listID: String) async throws
  func restoreItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem
}

extension ShoppingProvider {
  func restoreItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    try await addItem(item, to: listID)
  }
}

enum ProviderFactory {
  static func make(kind: ProviderKind, configuration: ProviderConfiguration) -> ShoppingProvider {
    switch kind {
    case .bring: BringProvider(configuration: configuration)
    case .mealie: MealieProvider(configuration: configuration)
    }
  }
}

struct HTTPClient: Sendable {
  var session = URLSession.shared
  func request(_ request: URLRequest) async throws -> Data {
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw ProviderError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      throw ProviderError.requestFailed(http.statusCode)
    }
    return data
  }
}

extension URLRequest {
  fileprivate mutating func jsonBody<T: Encodable>(_ value: T) throws {
    setValue("application/json", forHTTPHeaderField: "Content-Type")
    httpBody = try JSONEncoder().encode(value)
  }
}

struct MealieProvider: ShoppingProvider {
  let configuration: ProviderConfiguration
  var client = HTTPClient()
  private var baseURL: URL? {
    URL(
      string: configuration.serverURL.hasSuffix("/")
        ? String(configuration.serverURL.dropLast()) : configuration.serverURL)
  }
  private func request(_ path: String, method: String = "GET") throws -> URLRequest {
    guard let baseURL, let url = URL(string: path, relativeTo: baseURL.appendingPathComponent("/"))
    else { throw ProviderError.notConfigured }
    var request = URLRequest(url: url.absoluteURL)
    request.httpMethod = method
    request.setValue("Bearer \(configuration.secret)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }
  func lists() async throws -> [ProviderList] {
    let data = try await client.request(try request("api/households/shopping/lists?perPage=-1"))
    return try decodeCollection(data, as: ProviderList.self)
  }
  func items(in listID: String) async throws -> [ProviderItem] {
    let data = try await client.request(
      try request("api/households/shopping/items?queryFilter=shoppingListId%3D\(listID)&perPage=-1")
    )
    let values = try decodeCollection(data, as: MealieItem.self)
    return values.filter { !$0.checked && $0.shoppingListId == listID }.map {
      ProviderItem(
        id: $0.id, label: $0.food?.name ?? $0.note ?? $0.display ?? "Item",
        barcode: $0.extras?.barcode, quantity: $0.quantity, unit: $0.unit?.name,
        specification: $0.display)
    }
  }
  func addItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    var request = try request("api/households/shopping/items", method: "POST")
    try request.jsonBody(
      MealieCreate(
        shoppingListId: listID, checked: false, note: item.label, quantity: item.quantity ?? 1,
        extras: .init(barcode: item.barcode)))
    let data = try await client.request(request)
    let value = try JSONDecoder().decode(MealieItem.self, from: data)
    return ProviderItem(
      id: value.id, label: item.label, barcode: item.barcode, quantity: item.quantity,
      unit: item.unit)
  }
  func removeItem(_ item: ShoppingItem, from listID: String) async throws {
    guard let id = item.remoteItemID else { return }
    let get = try request("api/households/shopping/items/\(id)")
    let data = try await client.request(get)
    var value = try JSONDecoder().decode(MealieItem.self, from: data)
    value.checked = true
    var put = try request("api/households/shopping/items/\(id)", method: "PUT")
    try put.jsonBody(value)
    _ = try await client.request(put)
  }

  func restoreItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    let raw = try await rawItems(in: listID)
    let normalizedLabel = item.label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if var match = raw.first(where: {
      $0.checked
        && ($0.id == item.remoteItemID
          || ($0.note ?? $0.display ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() == normalizedLabel)
    }) {
      match.checked = false
      var put = try request("api/households/shopping/items/\(match.id)", method: "PUT")
      try put.jsonBody(match)
      _ = try await client.request(put)
      return ProviderItem(
        id: match.id, label: match.food?.name ?? match.note ?? match.display ?? item.label,
        barcode: match.extras?.barcode ?? item.barcode, quantity: match.quantity,
        unit: match.unit?.name, specification: match.display)
    }
    return try await addItem(item, to: listID)
  }

  private func rawItems(in listID: String) async throws -> [MealieItem] {
    let data = try await client.request(
      try request("api/households/shopping/items?queryFilter=shoppingListId%3D\(listID)&perPage=-1")
    )
    return try decodeCollection(data, as: MealieItem.self).filter { $0.shoppingListId == listID }
  }
}

private struct CollectionEnvelope<T: Codable>: Codable { var items: [T] }
private func decodeCollection<T: Codable>(_ data: Data, as: T.Type) throws -> [T] {
  if let array = try? JSONDecoder().decode([T].self, from: data) { return array }
  return try JSONDecoder().decode(CollectionEnvelope<T>.self, from: data).items
}
private struct MealieFood: Codable { var name: String? }
private struct MealieUnit: Codable { var name: String? }
private struct MealieExtras: Codable { var barcode: String? }
private struct MealieCreate: Codable {
  var shoppingListId: String
  var checked: Bool
  var note: String
  var quantity: Double
  var extras: MealieExtras
}
private struct MealieItem: Codable {
  var id: String
  var shoppingListId: String
  var checked: Bool
  var note: String?
  var display: String?
  var food: MealieFood?
  var quantity: Double?
  var unit: MealieUnit?
  var extras: MealieExtras?
}

struct BringProvider: ShoppingProvider {
  let configuration: ProviderConfiguration
  var client = HTTPClient()
  private var baseURL: URL? {
    URL(
      string: configuration.serverURL.isEmpty
        ? "https://api.getbring.com/rest/v2" : configuration.serverURL)
  }
  private struct Session: Decodable {
    var uuid: String
    var accessToken: String
    var publicUUID: String?
    var tokenType: String?
    enum CodingKeys: String, CodingKey {
      case uuid
      case accessToken = "access_token"
      case publicUUID = "publicUuid"
      case tokenType = "token_type"
    }
  }
  private func session() async throws -> Session {
    guard let baseURL else { throw ProviderError.notConfigured }
    var request = URLRequest(url: baseURL.appending(path: "bringauth"))
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    request.httpBody =
      "email=\(configuration.username.urlEncoded)&password=\(configuration.secret.urlEncoded)".data(
        using: .utf8)
    return try JSONDecoder().decode(Session.self, from: await client.request(request))
  }
  private func authorized(_ path: String, method: String = "GET", session: Session) throws
    -> URLRequest
  {
    guard let baseURL else { throw ProviderError.notConfigured }
    if configuration.serverURL.isEmpty && Self.apiKey.isEmpty {
      throw ProviderError.missingBringAPIKey
    }
    var request = URLRequest(url: baseURL.appending(path: path))
    request.httpMethod = method
    request.setValue(
      "\(session.tokenType ?? "Bearer") \(session.accessToken)", forHTTPHeaderField: "Authorization"
    )
    request.setValue(session.uuid, forHTTPHeaderField: "X-BRING-USER-UUID")
    if let publicUUID = session.publicUUID {
      request.setValue(publicUUID, forHTTPHeaderField: "X-BRING-PUBLIC-USER-UUID")
    }
    request.setValue("android", forHTTPHeaderField: "X-BRING-CLIENT")
    request.setValue("bring", forHTTPHeaderField: "X-BRING-APPLICATION")
    request.setValue("CH", forHTTPHeaderField: "X-BRING-COUNTRY")
    request.setValue(Self.apiKey, forHTTPHeaderField: "X-BRING-API-KEY")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }
  func lists() async throws -> [ProviderList] {
    let auth = try await session()
    let data = try await client.request(
      try authorized("bringusers/\(auth.uuid)/lists", session: auth))
    struct Body: Decodable {
      struct Entry: Decodable {
        var listUuid: String
        var name: String?
      }
      var lists: [Entry]
    }
    return try JSONDecoder().decode(Body.self, from: data).lists.map {
      .init(id: $0.listUuid, name: $0.name ?? "Shopping list")
    }
  }
  func items(in listID: String) async throws -> [ProviderItem] {
    let auth = try await session()
    let data = try await client.request(try authorized("bringlists/\(listID)", session: auth))
    struct Body: Decodable {
      struct Entry: Decodable {
        var uuid: String?
        var itemId: String?
        var name: String?
        var specification: String?
        var spec: String?
      }
      struct Items: Decodable { var purchase: [Entry]? }
      var items: Items?
      var purchase: [Entry]?
    }
    let body = try JSONDecoder().decode(Body.self, from: data)
    return (body.items?.purchase ?? body.purchase ?? []).compactMap {
      guard let id = $0.uuid, let label = $0.itemId ?? $0.name else { return nil }
      let specification = $0.specification ?? $0.spec
      return
        .init(
          id: id, label: label,
          barcode: specification.flatMap { Self.barcode(from: $0) },
          specification: specification)
    }
  }
  func addItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    let auth = try await session()
    var request = try authorized("bringlists/\(listID)", method: "PUT", session: auth)
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    let metadata = [
      item.quantity.map { "\($0.formatted())×" } ?? "",
      item.barcode.map { "EAN:\($0)" } ?? "",
    ].filter { !$0.isEmpty }.joined(separator: " · ")
    request.httpBody = [
      "purchase=\(item.label.urlEncoded)", "recently=", "specification=\(metadata.urlEncoded)",
      "remove=", "sender=null",
    ].joined(separator: "&").data(using: .utf8)
    _ = try await client.request(request)
    let candidates = try await items(in: listID)
    return candidates.first(where: {
      $0.barcode != nil && $0.barcode == item.barcode
    }) ?? candidates.last(where: {
      $0.label.trimmingCharacters(in: .whitespacesAndNewlines).localizedCaseInsensitiveCompare(
        item.label.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
    }) ?? ProviderItem(id: item.label, label: item.label, barcode: item.barcode)
  }
  func removeItem(_ item: ShoppingItem, from listID: String) async throws {
    let auth = try await session()
    var request = try authorized("bringlists/\(listID)/items", method: "PUT", session: auth)
    struct Change: Encodable {
      var itemId: String
      var uuid: String?
      var spec: String
      var operation = "TO_RECENTLY"
      var accuracy = "0.0"
      var altitude = "0.0"
      var latitude = "0.0"
      var longitude = "0.0"
    }
    struct Body: Encodable {
      var changes: [Change]
      var sender = ""
    }
    try request.jsonBody(
      Body(
        changes: [
          Change(
            itemId: item.label, uuid: item.remoteItemID, spec: item.remoteSpecification ?? "")
        ]))
    _ = try await client.request(request)
  }

  func restoreItem(_ item: ShoppingItem, to listID: String) async throws -> ProviderItem {
    let auth = try await session()
    var request = try authorized("bringlists/\(listID)/items", method: "PUT", session: auth)
    struct Change: Encodable {
      var itemId: String
      var uuid: String?
      var spec: String
      var operation = "TO_PURCHASE"
      var accuracy = "0.0"
      var altitude = "0.0"
      var latitude = "0.0"
      var longitude = "0.0"
    }
    struct Body: Encodable {
      var changes: [Change]
      var sender = ""
    }
    try request.jsonBody(
      Body(
        changes: [
          Change(
            itemId: item.label, uuid: item.remoteItemID, spec: item.remoteSpecification ?? "")
        ]))
    _ = try await client.request(request)
    return try await items(in: listID).first(where: {
      $0.id == item.remoteItemID
        || $0.label.localizedCaseInsensitiveCompare(item.label) == .orderedSame
    })
      ?? ProviderItem(id: item.remoteItemID ?? item.label, label: item.label, barcode: item.barcode)
  }

  private static func barcode(from specification: String) -> String? {
    guard let range = specification.range(of: #"EAN:\s*[0-9]{8,14}"#, options: .regularExpression)
    else { return nil }
    return specification[range].filter(\.isNumber)
  }

  private static var apiKey: String {
    (Bundle.main.object(forInfoDictionaryKey: "BringAPIKey") as? String)
      ?? ProcessInfo.processInfo.environment["BRING_API_KEY"] ?? ""
  }
}

extension String {
  fileprivate var urlEncoded: String {
    addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
  }
}
