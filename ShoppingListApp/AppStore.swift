import Foundation
import SwiftUI

@MainActor
final class AppStore: ObservableObject {
  @Published var lists: [ShoppingListDefinition]
  @Published var stores: [StoreDefinition]
  @Published var items: [UUID: [ShoppingItem]]
  @Published var sessions: [ShoppingSession]
  @Published var activeListID: UUID
  @Published var viewMode: ListViewMode
  @Published var showCategoryLabels: Bool
  @Published var oneTapShopping: Bool
  @Published var providerConfigurations: [ProviderKind: ProviderConfiguration]
  @Published var lookupPreferences: ProductLookupPreferences
  @Published var customBarcodes: [CustomBarcode]
  @Published var appLanguage: AppLanguage
  @Published var cloudAccount: CloudAccount?
  @Published var storageMode: StorageMode?
  /// The Cloud household and the account's other households; loaded by Settings, not saved.
  @Published var household: Household?
  @Published var households: [HouseholdSummary] = []
  @Published var errorMessage: String?

  private let storageURL: URL
  private let providerFactory: (ProviderKind, ProviderConfiguration) -> ShoppingProvider
  private let cloudService: CloudService
  private let persistence = StatePersistence()
  private var persistenceTask: Task<Void, Never>?
  private var syncingListIDs: Set<UUID> = []
  /// Items whose `addItem` request is still running; a sync must not upload them a second time.
  private var uploadingItemIDs: Set<UUID> = []
  private var liveDirtyListIDs: Set<UUID> = []
  private var liveSyncingListIDs: Set<UUID> = []
  private var isBackgroundSyncing = false

  init(
    storageURL: URL = FileManager.default.urls(
      for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("shopping-list.json"),
    providerFactory: @escaping (ProviderKind, ProviderConfiguration) -> ShoppingProvider =
      ProviderFactory.make,
    cloudService: CloudService = CloudService()
  ) {
    self.storageURL = storageURL
    self.providerFactory = providerFactory
    self.cloudService = cloudService
    if let data = try? Data(contentsOf: storageURL),
      let snapshot = try? JSONDecoder().decode(AppStateSnapshot.self, from: data)
    {
      lists = snapshot.lists
      stores = snapshot.stores
      items = snapshot.items
      sessions = snapshot.sessions
      activeListID = snapshot.activeListID
      viewMode = snapshot.viewMode
      showCategoryLabels = snapshot.showCategoryLabels
      oneTapShopping = snapshot.oneTapShopping
      providerConfigurations = snapshot.providerConfigurations.mapValues { $0 }
      lookupPreferences = snapshot.lookupPreferences
      customBarcodes = snapshot.customBarcodes
      appLanguage = snapshot.appLanguage
      cloudAccount = snapshot.cloudAccount
      storageMode = snapshot.storageMode
      for provider in ProviderKind.allCases {
        providerConfigurations[provider]?.secret = CredentialVault.read(provider)
      }
    } else {
      let initial = ShoppingListDefinition(name: String(localized: "Groceries"))
      lists = [initial]
      stores = []
      items = [initial.id: []]
      sessions = []
      activeListID = initial.id
      viewMode = .list
      showCategoryLabels = true
      oneTapShopping = false
      providerConfigurations = [
        .bring: .init(), .mealie: .init(), .server: .init(), .cloud: .init(),
      ]
      lookupPreferences = .init()
      customBarcodes = []
      appLanguage = .automatic
      cloudAccount = nil
      storageMode = nil
    }
    #if DEBUG
      if Demo.isActive { Demo.seed(self) }
    #endif
  }

  /// Demo data for screenshots is never saved, synced or streamed.
  private var isDemo: Bool {
    #if DEBUG
      Demo.isActive
    #else
      false
    #endif
  }

  var activeList: ShoppingListDefinition {
    lists.first(where: { $0.id == activeListID }) ?? lists[0]
  }
  var activeItems: [ShoppingItem] { items[activeListID, default: []] }
  /// Whether the active list has items whose icon the server is still making.
  var activeListHasPendingIcons: Bool {
    activeList.syncTarget != nil && activeItems.contains { $0.iconPending == true }
  }
  var activeSession: ShoppingSession? { sessions.first(where: { $0.completedAt == nil }) }

  func save() {
    guard !isDemo else { return }
    let state = persistenceState()
    persistenceTask?.cancel()
    persistenceTask = Task { [persistence, storageURL] in
      do {
        try await Task.sleep(for: .milliseconds(150))
        guard !Task.isCancelled else { return }
        try await persistence.write(
          snapshot: state.snapshot, secrets: state.secrets, to: storageURL)
      } catch is CancellationError {
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  func flushPersistence() async {
    guard !isDemo else { return }
    persistenceTask?.cancel()
    let state = persistenceState()
    do {
      try await persistence.write(snapshot: state.snapshot, secrets: state.secrets, to: storageURL)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func persistenceState() -> (
    snapshot: AppStateSnapshot, secrets: [ProviderKind: String]
  ) {
    let secrets = providerConfigurations.mapValues(\.secret)
    let publicConfigurations = providerConfigurations.mapValues { configuration in
      var value = configuration
      value.secret = ""
      return value
    }
    let snapshot = AppStateSnapshot(
      lists: lists, stores: stores, items: items, sessions: sessions,
      activeListID: activeListID, viewMode: viewMode, showCategoryLabels: showCategoryLabels,
      oneTapShopping: oneTapShopping,
      providerConfigurations: publicConfigurations, lookupPreferences: lookupPreferences,
      customBarcodes: customBarcodes, appLanguage: appLanguage, cloudAccount: cloudAccount,
      storageMode: storageMode
    )
    return (snapshot, secrets)
  }

  func addItem(
    label: String, barcode: String? = nil, imageURL: URL? = nil, brand: String? = nil,
    stores: [String] = [], quantity: Double? = nil, unit: String? = nil,
    exactLabel: String? = nil, genericLabel: String? = nil, productSource: String? = nil,
    productType: String? = nil, categoryHints: [String]? = nil, metadataResolved: Bool? = nil
  ) async {
    let value = label.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return }
    // Adding an item before answering the welcome card keeps the first list on this iPhone.
    let item = ShoppingItem(
      barcode: barcode, label: value, brand: brand, imageURL: imageURL, quantity: quantity,
      unit: unit, stores: stores, exactLabel: exactLabel, genericLabel: genericLabel,
      productSource: productSource, productType: productType, categoryHints: categoryHints,
      metadataResolved: metadataResolved,
      sourceListID: activeListID)
    items[activeListID, default: []].append(item)
    save()
    if let target = activeList.syncTarget {
      uploadingItemIDs.insert(item.id)
      defer { uploadingItemIDs.remove(item.id) }
      do {
        let listID = item.sourceListID
        let remote = try await provider(for: target.provider).addItem(item, to: target.remoteListID)
        // Update the item as it is now: a sync may have linked or refreshed it meanwhile.
        if let index = items[listID]?.firstIndex(where: { $0.id == item.id }),
          items[listID]?[index].remoteItemID == nil
        {
          items[listID]?[index].remoteItemID = remote.id
          items[listID]?[index].adoptPresentation(of: remote)
          save()
        }
      } catch { errorMessage = error.localizedDescription }
    }
  }

  func remove(_ item: ShoppingItem, from listID: UUID? = nil) async {
    let id = listID ?? item.sourceListID
    guard let list = lists.first(where: { $0.id == id }) else { return }
    items[id, default: []].removeAll(where: { $0.id == item.id })
    save()
    if let target = list.syncTarget {
      do {
        try await provider(for: target.provider).removeItem(item, from: target.remoteListID)
      } catch { errorMessage = error.localizedDescription }
    }
  }

  func sync(_ list: ShoppingListDefinition? = nil, reportErrors: Bool = true) async {
    let list = list ?? activeList
    guard !isDemo, let target = list.syncTarget else { return }
    guard syncingListIDs.insert(list.id).inserted else { return }
    defer { syncingListIDs.remove(list.id) }
    do {
      let adapter = try provider(for: target.provider)
      var existing = items[list.id, default: []]
      var remote = try await adapter.items(in: target.remoteListID)
      var uploadedItem = false
      var inFlightIDs: Set<UUID> = []
      // Remote items already linked to a local item can't be claimed by another one.
      var linkedRemoteIDs = Set(existing.compactMap(\.remoteItemID))
      for index in existing.indices where existing[index].remoteItemID == nil {
        if let match = remote.first(where: {
          !linkedRemoteIDs.contains($0.id)
            && ((existing[index].barcode != nil && existing[index].barcode == $0.barcode)
              || Self.normalized(existing[index].label) == Self.normalized($0.label))
        }) {
          linkedRemoteIDs.insert(match.id)
          existing[index].remoteItemID = match.id
          existing[index].remoteSpecification = match.specification
          existing[index].adoptPresentation(of: match)
        } else if uploadingItemIDs.contains(existing[index].id) {
          inFlightIDs.insert(existing[index].id)
        } else {
          // Items still being added by `addItem` are left to it (above): uploading them here as
          // well would create a duplicate on the server.
          let added = try await adapter.addItem(existing[index], to: target.remoteListID)
          existing[index].remoteItemID = added.id
          existing[index].remoteSpecification = added.specification
          existing[index].adoptPresentation(of: added)
          uploadedItem = true
        }
      }
      if uploadedItem { remote = try await adapter.items(in: target.remoteListID) }
      var synchronized: [ShoppingItem] = []
      // Each local item belongs to at most one remote item: two remote items with the same label
      // (added twice, or on two devices) must not both map to one local item, or the list would
      // hold that item's ID twice and SwiftUI would keep showing a stale row for it.
      var claimedLocalIDs: Set<UUID> = []
      let remoteIDs = Set(remote.map(\.id))
      for remoteItem in remote {
        let local =
          existing.first(where: {
            !claimedLocalIDs.contains($0.id) && $0.remoteItemID == remoteItem.id
          })
          ?? existing.first(where: {
            !claimedLocalIDs.contains($0.id)
              && ($0.remoteItemID == nil || !remoteIDs.contains($0.remoteItemID!))
              && (($0.barcode != nil && $0.barcode == remoteItem.barcode)
                || Self.normalized($0.label) == Self.normalized(remoteItem.label))
          })
        if var local {
          claimedLocalIDs.insert(local.id)
          local.remoteItemID = remoteItem.id
          local.remoteSpecification = remoteItem.specification
          local.barcode = remoteItem.barcode ?? local.barcode
          local.quantity = remoteItem.quantity ?? local.quantity
          local.unit = remoteItem.unit ?? local.unit
          local.adoptPresentation(of: remoteItem)
          if local.imageURL == nil && local.brand == nil { local.label = remoteItem.label }
          synchronized.append(local)
          continue
        }
        var item = ShoppingItem(
          barcode: remoteItem.barcode, label: remoteItem.label,
          quantity: remoteItem.quantity, unit: remoteItem.unit,
          remoteItemID: remoteItem.id, remoteSpecification: remoteItem.specification,
          sourceListID: list.id
        )
        item.adoptPresentation(of: remoteItem)
        if let barcode = remoteItem.barcode,
          let metadata = try? await ProductLookup().find(
            barcode: barcode, preferences: lookupPreferences, customBarcodes: customBarcodes)
        {
          item.label = metadata.label
          item.brand = metadata.brand
          item.imageURL = metadata.imageURL
          item.stores = metadata.stores
          item.exactLabel = metadata.exactLabel
          item.genericLabel = metadata.genericLabel
          item.productSource = metadata.source
          item.productType = metadata.productType
          item.categoryHints = metadata.categoryHints
          item.metadataResolved = true
        }
        synchronized.append(item)
      }
      // Still being uploaded and not on the server yet: keep them, `addItem` links them.
      synchronized += existing.filter {
        inFlightIDs.contains($0.id) && !claimedLocalIDs.contains($0.id)
      }
      items[list.id] = Self.merge(
        synchronized, into: items[list.id, default: []], snapshot: existing)
      save()
    } catch {
      if reportErrors && !Self.isCancellation(error) {
        errorMessage = error.localizedDescription
      }
    }
  }

  func syncAll(reportErrors: Bool = true) async {
    for list in lists where list.syncTarget != nil {
      await sync(list, reportErrors: reportErrors)
    }
  }

  func backgroundSync() async {
    guard !isBackgroundSyncing else { return }
    isBackgroundSyncing = true
    defer { isBackgroundSyncing = false }
    await syncAll(reportErrors: false)
    await enrichMissingCategoryMetadata()
  }

  func enrichMissingCategoryMetadata() async {
    var changed = false
    for listID in lists.map(\.id) {
      guard let listItems = items[listID] else { continue }
      for index in listItems.indices {
        guard let barcode = listItems[index].barcode, listItems[index].categoryHints == nil else {
          continue
        }
        guard
          let metadata = try? await ProductLookup().find(
            barcode: barcode, preferences: lookupPreferences, customBarcodes: customBarcodes)
        else { continue }
        // Write into the item as it is now: syncs may have changed the list during the lookup.
        let itemID = listItems[index].id
        guard let current = items[listID]?.firstIndex(where: { $0.id == itemID }) else { continue }
        items[listID]?[current].categoryHints = metadata.categoryHints
        items[listID]?[current].productType = metadata.productType
        items[listID]?[current].productSource = metadata.source
        changed = true
      }
    }
    if changed { save() }
  }

  @discardableResult
  func createList(name: String, target: SyncTarget? = nil) -> ShoppingListDefinition {
    let list = ShoppingListDefinition(name: name, syncTarget: target)
    lists.append(list)
    items[list.id] = []
    save()
    return list
  }

  // MARK: Live updates

  /// Providers whose servers push changes: Shopping List Cloud and your own Shopping List Server.
  private var liveProviders: [ProviderKind] {
    [.cloud, .server].filter { kind in
      guard let configuration = providerConfigurations[kind], configuration.enabled,
        !configuration.secret.isEmpty
      else { return false }
      return lists.contains { $0.syncTarget?.provider == kind }
    }
  }

  /// Changes when a stream has to be reopened: app activity, server, key, or linked providers.
  func liveUpdateKey(isActive: Bool) -> LiveUpdateKey {
    LiveUpdateKey(
      isActive: isActive,
      servers: liveProviders.map { kind in
        let configuration = providerConfigurations[kind] ?? .init()
        return "\(kind.rawValue)|\(configuration.serverURL)|\(configuration.secret.hashValue)"
      })
  }

  /// Holds one event stream per live provider until the calling task is cancelled.
  func runLiveUpdates() async {
    guard !isDemo else { return }
    let streams = liveProviders.compactMap { kind in
      providerConfigurations[kind].map { (kind, ServerEventStream(configuration: $0)) }
    }
    await withTaskGroup(of: Void.self) { group in
      for (kind, stream) in streams {
        group.addTask {
          await stream.run(
            // A (re)connect may have missed events: catch up on every list of that server.
            onConnect: { await self.catchUp(kind) },
            onEvent: { event in await self.handle(event, from: kind) })
        }
      }
    }
  }

  private func catchUp(_ kind: ProviderKind) async {
    if kind == .cloud { await importNewCloudLists() }
    for list in lists where list.syncTarget?.provider == kind { syncSoon(list.id) }
  }

  /// Events from `GET /api/v1/events`. They also echo this app's own changes, which only costs
  /// a quick re-fetch.
  func handle(_ event: ServerEvent, from kind: ProviderKind) async {
    // `ready` comes once per connection; onConnect already caught up.
    guard event.name != "ready" else { return }
    guard let remoteListID = event.listID else {
      await catchUp(kind)
      return
    }
    let matching = lists.filter {
      $0.syncTarget?.provider == kind && $0.syncTarget?.remoteListID == remoteListID
    }
    if event.name == "list.deleted" {
      // Online, a Cloud list deleted elsewhere goes here too; the last list stays.
      if kind == .cloud, storageMode == .online {
        for list in matching { deleteList(list) }
      }
      return
    }
    if matching.isEmpty, kind == .cloud {
      await importNewCloudLists()
      return
    }
    if event.name.hasPrefix("list.") {
      // `list.updated` also follows every item change, which the item event already covers;
      // only a rename needs applying here.
      if kind == .cloud, storageMode == .online, let name = event.listName {
        for list in matching where list.name != name {
          var renamed = list
          renamed.name = name
          renamed.syncTarget?.remoteListName = name
          updateList(renamed)
        }
      }
      return
    }
    for list in matching { syncSoon(list.id) }
  }

  /// Syncs a list shortly, folding bursts of events into one sync and never dropping an event
  /// that arrives while the list is already syncing.
  func syncSoon(_ listID: UUID) {
    liveDirtyListIDs.insert(listID)
    guard liveSyncingListIDs.insert(listID).inserted else { return }
    Task {
      try? await Task.sleep(for: .milliseconds(250))
      while liveDirtyListIDs.remove(listID) != nil {
        while syncingListIDs.contains(listID) { try? await Task.sleep(for: .milliseconds(200)) }
        guard let list = lists.first(where: { $0.id == listID }) else { break }
        await sync(list, reportErrors: false)
      }
      liveSyncingListIDs.remove(listID)
    }
  }

  /// Online, every Cloud list belongs on this iPhone: adds lists created elsewhere and follows
  /// renames.
  func importNewCloudLists() async {
    guard storageMode == .online, let remote = try? await provider(for: .cloud).lists() else {
      return
    }
    var changed = false
    for list in remote {
      if let index = lists.firstIndex(where: {
        $0.syncTarget?.provider == .cloud && $0.syncTarget?.remoteListID == list.id
      }) {
        if lists[index].syncTarget?.remoteListName != list.name {
          lists[index].syncTarget?.remoteListName = list.name
          lists[index].name = list.name
          changed = true
        }
      } else {
        let added = ShoppingListDefinition(
          name: list.name,
          syncTarget: SyncTarget(provider: .cloud, remoteListID: list.id, remoteListName: list.name)
        )
        lists.append(added)
        items[added.id] = []
        changed = true
        syncSoon(added.id)
      }
    }
    if changed { save() }
  }

  // MARK: Households (sharing)

  private var cloudToken: String { providerConfigurations[.cloud]?.secret ?? "" }

  func refreshHousehold() async throws {
    guard isCloudSignedIn, !isDemo else { return }
    household = try await cloudService.household(token: cloudToken)
    households = (try? await cloudService.households(token: cloudToken)) ?? []
  }

  /// A single-use link that lets someone join this household.
  func createInvite() async throws -> URL {
    let invite = try await cloudService.createInvite(token: cloudToken)
    household?.pendingInvites = (household?.pendingInvites ?? 0) + 1
    return invite.url
  }

  func revokeInvites() async throws {
    try await cloudService.revokeInvites(token: cloudToken)
    household?.pendingInvites = 0
  }

  func removeMember(_ member: Household.Member) async throws {
    try await cloudService.removeMember(member.id, token: cloudToken)
    household?.members.removeAll { $0.id == member.id }
  }

  func switchHousehold(to id: String) async throws {
    try await adopt(cloudService.session(forHousehold: id, token: cloudToken))
  }

  func lookUpInvite(_ invite: String) async throws -> InviteDetails {
    try await cloudService.lookUpInvite(invite, token: cloudToken)
  }

  /// Joins a household from an invite link and switches to it. Returns its name.
  @discardableResult
  func acceptInvite(_ invite: String) async throws -> String {
    let session = try await cloudService.acceptInvite(invite, token: cloudToken)
    try await adopt(session)
    return session.household.name
  }

  /// Leaves the current household for another one the account belongs to. The token stops
  /// working once the membership is gone, so the session for the next household comes first.
  func leaveHousehold() async throws {
    guard let current = household, let userID = cloudAccount?.userID else { return }
    let others = try await cloudService.households(token: cloudToken).filter { $0.id != current.id }
    guard let next = others.first else { throw HouseholdError.onlyHousehold }
    let session = try await cloudService.session(forHousehold: next.id, token: cloudToken)
    try await cloudService.removeMember(userID, token: cloudToken)
    try await adopt(session)
  }

  /// Uses another household's session: its Cloud lists replace the ones on this iPhone. Lists
  /// from Bring and Mealie stay. Nothing changes when the new household's lists can't be loaded.
  private func adopt(_ session: HouseholdSession) async throws {
    var configuration = providerConfigurations[.cloud] ?? ProviderConfiguration()
    configuration.enabled = true
    configuration.secret = session.token
    let cloud = providerFactory(.cloud, configuration)
    var remote = try await cloud.lists()
    let oldCloudLists = lists.filter { $0.syncTarget?.provider == .cloud }.map(\.id)
    if remote.isEmpty, lists.count == oldCloudLists.count {
      remote = [try await cloud.createList(named: String(localized: "Groceries"))]
    }
    providerConfigurations[.cloud] = configuration
    let added = remote.map {
      ShoppingListDefinition(
        name: $0.name,
        syncTarget: SyncTarget(provider: .cloud, remoteListID: $0.id, remoteListName: $0.name))
    }
    lists.removeAll { oldCloudLists.contains($0.id) }
    for id in oldCloudLists { items[id] = nil }
    lists.append(contentsOf: added)
    for list in added { items[list.id] = [] }
    if !lists.contains(where: { $0.id == activeListID }), let first = lists.first {
      activeListID = first.id
    }
    household = nil
    save()
    for list in added { syncSoon(list.id) }
    try? await refreshHousehold()
  }

  // MARK: Shopping List Cloud

  var isCloudSignedIn: Bool {
    cloudAccount != nil && providerConfigurations[.cloud]?.secret.isEmpty == false
  }

  func signInToCloud(with credential: AppleSignInCredential) async throws {
    let session = try await cloudService.signIn(with: credential)
    cloudAccount = CloudAccount(
      userID: session.user.id, appleUserID: credential.appleUserID, name: session.user.name)
    providerConfigurations[.cloud] = ProviderConfiguration(
      enabled: true, serverURL: cloudService.baseURL, secret: session.token)
    save()
  }

  /// Creates a new list directly in Cloud. Nothing is created if the server can't be reached.
  func createCloudList(name: String) async throws {
    let remote = try await provider(for: .cloud).createList(named: name)
    createList(
      name: name,
      target: SyncTarget(provider: .cloud, remoteListID: remote.id, remoteListName: remote.name))
  }

  /// Whether the user still has to choose between offline and online.
  var needsModeChoice: Bool { storageMode == nil }

  /// Keeps everything on this iPhone. Signs out of Cloud if a session is left from before.
  func chooseOffline() {
    if cloudAccount != nil { signOutOfCloud() }
    storageMode = .offline
    save()
  }

  /// Switches to online after signing in: every list on this iPhone moves to Cloud. A local list
  /// whose name matches a Cloud list not yet on this iPhone is linked to it instead of creating a
  /// copy, and the remaining Cloud lists are added. If the server fails part way, lists already
  /// moved stay moved and calling this again finishes the rest.
  func goOnline() async throws {
    let cloud = try provider(for: .cloud)
    let linked = Set(
      lists.compactMap { $0.syncTarget?.provider == .cloud ? $0.syncTarget?.remoteListID : nil })
    var remaining = try await cloud.lists().filter { !linked.contains($0.id) }
    for listID in lists.filter({ $0.syncTarget == nil }).map(\.id) {
      guard let index = lists.firstIndex(where: { $0.id == listID }) else { continue }
      let name = lists[index].name
      let remote: ProviderList
      if let match = remaining.firstIndex(where: {
        Self.normalized($0.name) == Self.normalized(name)
      }) {
        remote = remaining.remove(at: match)
      } else {
        remote = try await cloud.createList(named: name)
      }
      guard let current = lists.firstIndex(where: { $0.id == listID }) else { continue }
      lists[current].syncTarget = SyncTarget(
        provider: .cloud, remoteListID: remote.id, remoteListName: remote.name)
      save()
    }
    for remote in remaining {
      createList(
        name: remote.name,
        target: SyncTarget(provider: .cloud, remoteListID: remote.id, remoteListName: remote.name))
    }
    storageMode = .online
    save()
    // Items already on the moved lists have no remote ID yet, so syncing uploads them.
    for list in lists where list.syncTarget?.provider == .cloud {
      await sync(list, reportErrors: false)
    }
  }

  /// Signs out of Cloud and switches to offline. Cloud lists stay on this iPhone as local lists.
  func signOutOfCloud() {
    for index in lists.indices where lists[index].syncTarget?.provider == .cloud {
      lists[index].syncTarget = nil
      let id = lists[index].id
      items[id] = items[id]?.map { item in
        var local = item
        local.remoteItemID = nil
        local.remoteSpecification = nil
        return local
      }
    }
    cloudAccount = nil
    household = nil
    households = []
    providerConfigurations[.cloud] = ProviderConfiguration()
    if storageMode == .online { storageMode = .offline }
    save()
  }

  /// Deletes the Cloud account and its server data; local copies of the lists are kept.
  func deleteCloudAccount() async throws {
    let token = providerConfigurations[.cloud]?.secret ?? ""
    if !token.isEmpty { try await cloudService.deleteAccount(token: token) }
    signOutOfCloud()
  }

  /// Signs out when the user has revoked Sign in with Apple for this app in iOS Settings.
  func verifyCloudCredential() async {
    guard !isDemo, let account = cloudAccount else { return }
    if !(await AppleCredentialCheck.isStillAuthorized(appleUserID: account.appleUserID)) {
      signOutOfCloud()
      errorMessage = String(
        localized:
          "You were signed out of Shopping List Cloud. Your lists are still on this iPhone.")
    }
  }
  func updateList(_ list: ShoppingListDefinition) {
    if let index = lists.firstIndex(where: { $0.id == list.id }) {
      lists[index] = list
      save()
    }
  }
  func deleteList(_ list: ShoppingListDefinition) {
    guard lists.count > 1 else { return }
    lists.removeAll(where: { $0.id == list.id })
    items[list.id] = nil
    if activeListID == list.id { activeListID = lists[0].id }
    save()
  }
  func createStore(name: String) {
    stores.append(StoreDefinition(name: name))
    save()
  }
  func deleteStore(_ store: StoreDefinition) {
    stores.removeAll(where: { $0.id == store.id })
    save()
  }

  func saveCustomBarcode(barcode: String, label: String) {
    let code = barcode.filter(\.isNumber)
    let value = label.trimmingCharacters(in: .whitespacesAndNewlines)
    guard (8...14).contains(code.count), !value.isEmpty else { return }
    customBarcodes.removeAll { $0.barcode == code }
    customBarcodes.append(CustomBarcode(barcode: code, label: value))
    customBarcodes.sort { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    save()
  }

  func deleteCustomBarcode(_ value: CustomBarcode) {
    customBarcodes.removeAll { $0.barcode == value.barcode }
    save()
  }

  func startShopping(store: StoreDefinition, listIDs: Set<UUID>) {
    sessions.append(
      ShoppingSession(
        store: store, listIDs: Array(listIDs),
        listNames: lists.filter { listIDs.contains($0.id) }.map(\.name)
      ))
    save()
  }
  /// One-tap shopping: the item leaves the list (checked off on a synced list). During a shopping
  /// trip it counts as bought.
  func checkOff(_ item: ShoppingItem) async {
    if activeSession != nil {
      await purchase(item)
    } else {
      await remove(item)
    }
  }

  /// Undoes `checkOff`: puts the item back, on its server too, and out of the trip's basket.
  func undoCheckOff(_ item: ShoppingItem) async {
    if let index = sessions.firstIndex(where: { $0.completedAt == nil }),
      let purchase = sessions[index].purchasedItems.last(where: { $0.item.id == item.id })
    {
      await restore(purchase)
      return
    }
    await restore(PurchasedItem(item: item), fromSession: false)
  }

  func purchase(_ item: ShoppingItem) async {
    guard let index = sessions.firstIndex(where: { $0.completedAt == nil }) else { return }
    sessions[index].purchasedItems.append(PurchasedItem(item: item))
    save()
    await remove(item)
  }
  func restore(_ purchase: PurchasedItem, fromSession: Bool = true) async {
    if fromSession {
      guard let index = sessions.firstIndex(where: { $0.completedAt == nil }) else { return }
      sessions[index].purchasedItems.removeAll(where: { $0.id == purchase.id })
    }
    var restoredItem = purchase.item
    items[purchase.item.sourceListID, default: []].append(restoredItem)
    save()
    if let list = lists.first(where: { $0.id == purchase.item.sourceListID }),
      let target = list.syncTarget
    {
      do {
        let remote = try await provider(for: target.provider).restoreItem(
          purchase.item, to: target.remoteListID)
        restoredItem.remoteItemID = remote.id
        restoredItem.remoteSpecification = remote.specification
        restoredItem.adoptPresentation(of: remote)
        if let itemIndex = items[purchase.item.sourceListID]?.firstIndex(where: {
          $0.id == restoredItem.id
        }) {
          items[purchase.item.sourceListID]?[itemIndex] = restoredItem
          save()
        }
      } catch { errorMessage = error.localizedDescription }
    }
  }
  func finishShopping() {
    if let index = sessions.firstIndex(where: { $0.completedAt == nil }) {
      sessions[index].completedAt = Date()
      save()
    }
  }

  private func provider(for kind: ProviderKind) throws -> ShoppingProvider {
    guard let config = providerConfigurations[kind], config.enabled else {
      throw ProviderError.notConfigured
    }
    return providerFactory(kind, config)
  }

  /// Applies a sync result to the list as it is now rather than as it was when the sync started:
  /// items added while the request ran are kept, and items removed meanwhile stay removed.
  static func merge(
    _ synchronized: [ShoppingItem], into current: [ShoppingItem], snapshot: [ShoppingItem]
  ) -> [ShoppingItem] {
    let snapshotIDs = Set(snapshot.map(\.id))
    let currentIDs = Set(current.map(\.id))
    let kept = synchronized.filter { !snapshotIDs.contains($0.id) || currentIDs.contains($0.id) }
    let keptIDs = Set(kept.map(\.id))
    let addedMeanwhile = current.filter { !snapshotIDs.contains($0.id) && !keptIDs.contains($0.id) }
    return kept + addedMeanwhile
  }

  private static func isCancellation(_ error: Error) -> Bool {
    error is CancellationError || (error as? URLError)?.code == .cancelled
  }

  private static func normalized(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
}
