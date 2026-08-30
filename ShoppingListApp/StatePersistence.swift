import Foundation

actor StatePersistence {
  private var storedSecrets: [ProviderKind: String] = [:]

  func write(
    snapshot: AppStateSnapshot, secrets: [ProviderKind: String], to storageURL: URL
  ) throws {
    for (provider, secret) in secrets where storedSecrets[provider] != secret {
      CredentialVault.write(secret, provider: provider)
      storedSecrets[provider] = secret
    }
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try JSONEncoder().encode(snapshot).write(to: storageURL, options: .atomic)
  }
}
