import Foundation
import Security

enum CredentialVault {
  /// The Mac uses the same data protection keychain as iOS, not the legacy file keychain.
  private static var platformAttributes: [String: Any] {
    #if os(macOS)
      [kSecUseDataProtectionKeychain as String: true]
    #else
      [:]
    #endif
  }

  static func read(_ provider: ProviderKind) -> String {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "ch.benn0r.shoppinglist.providers",
      kSecAttrAccount as String: provider.rawValue,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    query.merge(platformAttributes) { $1 }
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return "" }
    return String(data: data, encoding: .utf8) ?? ""
  }

  static func write(_ value: String, provider: ProviderKind) {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "ch.benn0r.shoppinglist.providers",
      kSecAttrAccount as String: provider.rawValue,
    ]
    query.merge(platformAttributes) { $1 }
    SecItemDelete(query as CFDictionary)
    guard !value.isEmpty, let data = value.data(using: .utf8) else { return }
    var entry = query
    entry[kSecValueData as String] = data
    entry[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(entry as CFDictionary, nil)
  }
}
