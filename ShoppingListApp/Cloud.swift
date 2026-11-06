import AuthenticationServices
import Foundation

/// What Sign in with Apple hands back, reduced to the parts the server needs.
struct AppleSignInCredential: Sendable, Hashable {
  var appleUserID: String
  var identityToken: String
  var authorizationCode: String
  /// Apple sends the name only on the very first sign-in, so the server must keep it.
  var givenName: String?
  var familyName: String?

  init(
    appleUserID: String, identityToken: String, authorizationCode: String,
    givenName: String? = nil, familyName: String? = nil
  ) {
    self.appleUserID = appleUserID
    self.identityToken = identityToken
    self.authorizationCode = authorizationCode
    self.givenName = givenName
    self.familyName = familyName
  }

  init?(_ credential: ASAuthorizationAppleIDCredential) {
    guard let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }),
      let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) })
    else { return nil }
    self.init(
      appleUserID: credential.user, identityToken: token, authorizationCode: code,
      givenName: credential.fullName?.givenName, familyName: credential.fullName?.familyName)
  }
}

enum CloudConfiguration {
  /// Base URL of the hosted Shopping List Server, set through `CLOUD_SERVER_URL` at build time.
  /// Debug builds accept a `-cloudServerURL <url>` launch argument so tests can use the mock server.
  static var serverURL: String {
    #if DEBUG
      if let override = launchValue("cloudServerURL"), !override.isEmpty { return override }
    #endif
    let value = (Bundle.main.object(forInfoDictionaryKey: "CloudServerURL") as? String) ?? ""
    return value.isEmpty || value.hasPrefix("$(") ? "https://shopping-list.tueftli.com" : value
  }

  /// Debug-only: `-mockAppleSignIn YES` replaces the Apple sheet with a fixed credential so
  /// simulator E2E tests never need a real Apple ID.
  static var usesMockAppleSignIn: Bool {
    #if DEBUG
      ["true", "yes", "1"].contains(launchValue("mockAppleSignIn")?.lowercased() ?? "")
    #else
      false
    #endif
  }

  #if DEBUG
    /// Reads a launch argument given as `-key value`, `key value`, or `key=value`
    /// (Maestro and Xcode pass them differently), falling back to user defaults.
    static func launchValue(_ key: String, arguments: [String] = ProcessInfo.processInfo.arguments)
      -> String?
    {
      for (index, argument) in arguments.enumerated() {
        let name = argument.drop(while: { $0 == "-" })
        if name.hasPrefix("\(key)=") { return String(name.dropFirst(key.count + 1)) }
        if name == key, index + 1 < arguments.count {
          return arguments[index + 1]
        }
      }
      return UserDefaults.standard.string(forKey: key)
    }
  #endif

  static let mockCredential = AppleSignInCredential(
    appleUserID: "mock-apple-user", identityToken: "mock-identity-token",
    authorizationCode: "mock-authorization-code", givenName: "Alex")
}

struct CloudSession: Decodable, Sendable {
  struct User: Decodable, Sendable {
    var id: String
    var name: String?
  }
  var token: String
  var user: User
}

/// Account endpoints of Shopping List Cloud. List and item calls go through
/// `ShoppingListServerProvider`, because Cloud is a hosted Shopping List Server.
struct CloudService: Sendable {
  var baseURL: String = CloudConfiguration.serverURL
  var client = HTTPClient()

  private func url(_ path: String) throws -> URL {
    let trimmed = baseURL.hasSuffix("/") ? String(baseURL.dropLast()) : baseURL
    guard let url = URL(string: trimmed), url.scheme != nil else {
      throw ProviderError.notConfigured
    }
    return url.appending(path: "api/v1/\(path)")
  }

  /// Exchanges an Apple credential for a Cloud session, creating the account on first use.
  func signIn(with credential: AppleSignInCredential) async throws -> CloudSession {
    struct Body: Encodable {
      var identityToken: String
      var authorizationCode: String
      var givenName: String?
      var familyName: String?
    }
    var request = URLRequest(url: try url("auth/apple"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(
      Body(
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        givenName: credential.givenName, familyName: credential.familyName))
    return try JSONDecoder().decode(CloudSession.self, from: await client.request(request))
  }

  /// Deletes the account and all its data; the server also revokes the Apple token.
  func deleteAccount(token: String) async throws {
    var request = URLRequest(url: try url("me"))
    request.httpMethod = "DELETE"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    _ = try await client.request(request)
  }
}

enum AppleCredentialCheck {
  /// False when the user has stopped using Sign in with Apple for this app in iOS Settings.
  static func isStillAuthorized(appleUserID: String) async -> Bool {
    if CloudConfiguration.usesMockAppleSignIn { return true }
    return await withCheckedContinuation { continuation in
      ASAuthorizationAppleIDProvider().getCredentialState(forUserID: appleUserID) { state, _ in
        continuation.resume(returning: state == .authorized || state == .transferred)
      }
    }
  }
}
