import Foundation

/// One message from a Server-Sent Events stream.
struct ServerEvent: Equatable, Sendable {
  var name: String = "message"
  var data: String = ""
  var id: String?

  /// The remote list an event refers to: `item.listId` and `listId` for item events, `list.id`
  /// for list events, and `id` for `list.deleted`. Nil for `ready` and unknown events.
  var listID: String? {
    struct Payload: Decodable {
      struct Reference: Decodable {
        var id: String?
        var listId: String?
      }
      var id: String?
      var listId: String?
      var item: Reference?
      var list: Reference?
    }
    guard let payload = try? JSONDecoder().decode(Payload.self, from: Data(data.utf8)) else {
      return nil
    }
    if name == "list.deleted" { return payload.id }
    return payload.item?.listId ?? payload.listId ?? payload.list?.id
  }
}

extension ServerEvent {
  /// The list's name in `list.created` and `list.updated`.
  var listName: String? {
    struct Payload: Decodable {
      struct List: Decodable { var name: String? }
      var list: List?
    }
    return (try? JSONDecoder().decode(Payload.self, from: Data(data.utf8)))?.list?.name
  }
}

/// Turns the lines of a `text/event-stream` body into events, following the WHATWG rules:
/// fields until a blank line, `:` comments ignored, several `data:` lines joined by newlines.
struct ServerEventParser {
  private var event = ServerEvent()
  private var dataLines: [String] = []
  private var hasData = false
  private(set) var lastEventID: String?
  private(set) var retry: Duration?

  mutating func consume(_ line: String) -> ServerEvent? {
    if line.isEmpty { return dispatch() }
    if line.hasPrefix(":") { return nil }
    let field: Substring
    var value: Substring
    if let colon = line.firstIndex(of: ":") {
      field = line[..<colon]
      value = line[line.index(after: colon)...]
      if value.hasPrefix(" ") { value = value.dropFirst() }
    } else {
      field = Substring(line)
      value = ""
    }
    switch field {
    case "event": event.name = value.isEmpty ? "message" : String(value)
    case "data":
      dataLines.append(String(value))
      hasData = true
    case "id" where !value.contains("\0"): event.id = String(value)
    case "retry": if let ms = Int(value) { retry = .milliseconds(ms) }
    default: break
    }
    return nil
  }

  private mutating func dispatch() -> ServerEvent? {
    defer {
      event = ServerEvent()
      dataLines = []
      hasData = false
    }
    if let id = event.id { lastEventID = id }
    guard hasData else { return nil }
    var finished = event
    finished.data = dataLines.joined(separator: "\n")
    return finished
  }
}

/// Keeps a Shopping List Server's event stream open and reconnects after errors. Each call to
/// `run` lasts until its task is cancelled, which closes the connection.
struct ServerEventStream: Sendable {
  /// Path of the stream below the server's base URL.
  static let path = "api/v1/events"

  let configuration: ProviderConfiguration
  var session: URLSession = .shared

  /// - Parameters:
  ///   - onConnect: called each time the stream is (re)connected, so missed changes can be fetched.
  ///   - onEvent: called for every event.
  func run(
    onConnect: @escaping @Sendable () async -> Void,
    onEvent: @escaping @Sendable (ServerEvent) async -> Void
  ) async {
    var lastEventID: String?
    var retry: Duration = .seconds(1)
    var failures = 0
    while !Task.isCancelled {
      do {
        guard let request = request(lastEventID: lastEventID) else { return }
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw ProviderError.invalidResponse }
        // Without the stream on the server (older versions) or with a revoked key, stop quietly:
        // the regular sync still works. 429 (too many open streams) is retried with back-off.
        if [401, 403, 404, 405].contains(http.statusCode) { return }
        guard (200..<300).contains(http.statusCode) else {
          throw ProviderError.requestFailed(http.statusCode)
        }
        failures = 0
        await onConnect()
        var parser = ServerEventParser()
        // Split lines by hand: `AsyncBytes.lines` skips empty lines, and an empty line is what
        // ends each event.
        var line: [UInt8] = []
        for try await byte in bytes {
          guard byte == 0x0A else {
            line.append(byte)
            continue
          }
          if line.last == 0x0D { line.removeLast() }
          let text = String(decoding: line, as: UTF8.self)
          line.removeAll(keepingCapacity: true)
          if let event = parser.consume(text) { await onEvent(event) }
          lastEventID = parser.lastEventID ?? lastEventID
          if let value = parser.retry { retry = value }
        }
      } catch {
        if Task.isCancelled { return }
        failures += 1
      }
      // Back off after repeated failures: 1 s, 2 s, 4 s … up to 60 s, or the server's `retry`.
      let delay = failures == 0 ? retry : min(retry * Int(pow(2, Double(failures - 1))), .seconds(60))
      try? await Task.sleep(for: delay)
    }
  }

  private func request(lastEventID: String?) -> URLRequest? {
    let value = configuration.serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !configuration.secret.isEmpty,
      let base = URL(string: value.hasSuffix("/") ? String(value.dropLast()) : value),
      base.scheme != nil
    else { return nil }
    var request = URLRequest(url: base.appending(path: Self.path))
    request.setValue("Bearer \(configuration.secret)", forHTTPHeaderField: "Authorization")
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
    if let lastEventID { request.setValue(lastEventID, forHTTPHeaderField: "Last-Event-ID") }
    // The stream stays open for as long as the app is active; only the server ends it.
    request.timeoutInterval = 24 * 60 * 60
    return request
  }
}

/// What the live connections depend on: when it changes, the streams are reopened.
struct LiveUpdateKey: Hashable {
  var isActive: Bool
  var servers: [String]
}
