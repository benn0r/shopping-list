import Foundation

/// The household a Cloud session belongs to: everyone in it shares the same lists.
struct Household: Codable, Hashable, Sendable {
  struct Member: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String?
    var role: Role
    var you: Bool?
  }
  enum Role: String, Codable, Sendable {
    case owner, member
  }
  var id: String
  var name: String
  var role: Role
  var members: [Member] = []
  var pendingInvites: Int?

  var isOwner: Bool { role == .owner }
}

enum HouseholdError: LocalizedError {
  case onlyHousehold
  var errorDescription: String? {
    switch self {
    case .onlyHousehold:
      String(localized: "This is your only household, so you can't leave it.")
    }
  }
}

/// One of the households the account belongs to.
struct HouseholdSummary: Codable, Hashable, Identifiable, Sendable {
  var id: String
  var name: String
  var role: Household.Role
  var current: Bool?
}

struct HouseholdInvite: Decodable, Sendable {
  var url: URL
  var expiresAt: String?
}

struct InviteDetails: Decodable, Sendable {
  struct Summary: Decodable, Sendable { var name: String }
  var household: Summary
  var member: Bool
}

/// A session token for one household, from switching households or accepting an invite.
struct HouseholdSession: Decodable, Sendable {
  struct Summary: Decodable, Sendable {
    var id: String
    var name: String
    var role: Household.Role
  }
  var token: String
  var household: Summary
}

/// Invite links: `https://<server>/app/invite/<token>` (universal link) or
/// `shoppinglist://invite/<token>`.
enum InviteLink {
  static func token(in url: URL) -> String? {
    let parts = url.pathComponents.filter { $0 != "/" }
    if url.scheme == "shoppinglist" {
      // shoppinglist://invite/<token>: the host is "invite".
      guard url.host == "invite", let token = parts.first, !token.isEmpty else { return nil }
      return token
    }
    guard url.scheme == "https", let index = parts.firstIndex(of: "invite"),
      index > 0, parts[index - 1] == "app", index + 1 < parts.count
    else { return nil }
    return parts[index + 1]
  }
}

extension CloudService {
  private func authorized(_ path: String, token: String, method: String = "GET") throws
    -> URLRequest
  {
    var request = URLRequest(url: try url(path))
    request.httpMethod = method
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  func household(token: String) async throws -> Household {
    try JSONDecoder().decode(
      Household.self, from: await client.request(try authorized("household", token: token)))
  }

  func households(token: String) async throws -> [HouseholdSummary] {
    struct Page: Decodable { var items: [HouseholdSummary] }
    return try JSONDecoder().decode(
      Page.self, from: await client.request(try authorized("households", token: token))
    ).items
  }

  func createInvite(token: String) async throws -> HouseholdInvite {
    try JSONDecoder().decode(
      HouseholdInvite.self,
      from: await client.request(
        try authorized("household/invites", token: token, method: "POST")))
  }

  func revokeInvites(token: String) async throws {
    _ = try await client.request(
      try authorized("household/invites", token: token, method: "DELETE"))
  }

  /// Removes a member; with your own ID, leaves the household.
  func removeMember(_ userID: String, token: String) async throws {
    _ = try await client.request(
      try authorized("household/members/\(userID)", token: token, method: "DELETE"))
  }

  func session(forHousehold id: String, token: String) async throws -> HouseholdSession {
    try JSONDecoder().decode(
      HouseholdSession.self,
      from: await client.request(
        try authorized("households/\(id)/session", token: token, method: "POST")))
  }

  /// The invitation goes in the body, never the path: the server logs request paths.
  private func inviteRequest(_ path: String, invite: String, token: String) throws -> URLRequest {
    var request = try authorized(path, token: token, method: "POST")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(["invite": invite])
    return request
  }

  /// The household an invitation is for, and whether the account already belongs to it.
  func lookUpInvite(_ invite: String, token: String) async throws -> InviteDetails {
    try JSONDecoder().decode(
      InviteDetails.self,
      from: await client.request(try inviteRequest("invites/lookup", invite: invite, token: token)))
  }

  func acceptInvite(_ invite: String, token: String) async throws -> HouseholdSession {
    try JSONDecoder().decode(
      HouseholdSession.self,
      from: await client.request(try inviteRequest("invites/accept", invite: invite, token: token)))
  }
}
