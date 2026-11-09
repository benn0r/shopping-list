import AuthenticationServices
import SwiftUI

/// Where a new list is stored.
enum ListStorage: Hashable {
  case local, cloud, connected
}

struct CloudPerk {
  let symbol: String
  let title: LocalizedStringKey
  let detail: LocalizedStringKey
}

/// The perks of going online, shown on the welcome screen and in the Cloud info sheet.
@MainActor enum CloudBenefits {
  static let perks: [CloudPerk] = [
    CloudPerk(
      symbol: "person.2.fill", title: "Share with Family",
      detail: "Shop together from the same lists."),
    CloudPerk(
      symbol: "icloud.and.arrow.up.fill", title: "Backup to Cloud",
      detail: "Your lists are safe and on all your devices."),
    CloudPerk(
      symbol: "point.3.connected.trianglepath.dotted", title: "MCP",
      detail: "Let AI assistants read and update your lists."),
  ]
}

struct StorageOptionCard<Details: View>: View {
  let symbol: String
  let title: LocalizedStringKey
  let subtitle: LocalizedStringKey
  var badge: LocalizedStringKey?
  let isSelected: Bool
  let identifier: String
  let action: () -> Void
  @ViewBuilder var details: Details

  private static var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: 22, style: .continuous)
  }

  var body: some View {
    Button(action: action) {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: symbol)
          .font(.title3.weight(.semibold))
          .foregroundStyle(isSelected ? Color.white : Color.shoppingAccent)
          .frame(width: 40, height: 40)
          .background(
            isSelected ? Color.shoppingAccent : Color.shoppingAccent.opacity(0.12),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Text(title).font(.headline).foregroundStyle(.primary)
            if let badge {
              Text(badge)
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .foregroundStyle(Color.shoppingAccent)
                .background(Color.shoppingAccent.opacity(0.14), in: Capsule())
            }
          }
          Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
          details
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
          .font(.title3)
          .foregroundStyle(isSelected ? Color.shoppingAccent : Color.secondary.opacity(0.5))
      }
      .padding(16)
      .background(.background, in: Self.shape)
      // strokeBorder draws inside the edge, so list rows with zero insets don't clip it.
      .overlay {
        Self.shape.strokeBorder(
          isSelected ? Color.shoppingAccent : Color.secondary.opacity(0.18),
          lineWidth: isSelected ? 2 : 1)
      }
      .contentShape(Self.shape)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    .accessibilityIdentifier(identifier)
  }
}

/// Choice of where a new list is stored, limited to what the current mode allows. Each option is
/// its own Form row with a checkmark, so the Form draws the grouping and nothing gets clipped.
struct StoragePicker: View {
  @Binding var selection: ListStorage
  let options: [ListStorage]

  var body: some View {
    ForEach(options, id: \.self) { option in
      StorageRow(option: option, isSelected: selection == option) { selection = option }
    }
  }
}

private struct StorageRow: View {
  let option: ListStorage
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: symbol)
          .font(.body.weight(.semibold))
          .foregroundStyle(isSelected ? Color.white : Color.shoppingAccent)
          .frame(width: 34, height: 34)
          .background(
            isSelected ? Color.shoppingAccent : Color.shoppingAccent.opacity(0.12),
            in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        VStack(alignment: .leading, spacing: 2) {
          Text(title).foregroundStyle(.primary)
          Text(subtitle).font(.footnote).foregroundStyle(.secondary)
        }
        Spacer(minLength: 8)
        Image(systemName: "checkmark")
          .font(.body.weight(.semibold))
          .foregroundStyle(Color.shoppingAccent)
          .opacity(isSelected ? 1 : 0)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    .accessibilityIdentifier(identifier)
  }

  private var symbol: String {
    switch option {
    case .local: "iphone"
    case .cloud: "icloud.fill"
    case .connected: "link"
    }
  }
  private var title: LocalizedStringKey {
    switch option {
    case .local: "On this iPhone"
    case .cloud: "Shopping List Cloud"
    case .connected: "Connected service"
    }
  }
  private var subtitle: LocalizedStringKey {
    switch option {
    case .local: "Private and works offline."
    case .cloud: "Shared, backed up, and available through MCP."
    case .connected: "Bring, Mealie, or your own server."
    }
  }
  private var identifier: String {
    switch option {
    case .local: "storage-local"
    case .cloud: "storage-cloud"
    case .connected: "storage-connected"
    }
  }
}

/// Apple's "Continue with Apple" button, which signs in to Cloud and then runs `onSignedIn`.
struct CloudContinueButton: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.colorScheme) private var colorScheme
  @Binding var isWorking: Bool
  @Binding var failure: String?
  let onSignedIn: () async -> Void

  var body: some View {
    Group {
      if CloudConfiguration.usesMockAppleSignIn {
        Button {
          Task { await signIn(with: CloudConfiguration.mockCredential) }
        } label: {
          Label("Continue with Apple", systemImage: "applelogo")
            .font(.headline).frame(maxWidth: .infinity).frame(height: 50)
        }
        .buttonStyle(.borderedProminent).tint(colorScheme == .dark ? .white : .black)
        .foregroundStyle(colorScheme == .dark ? .black : .white)
      } else {
        SignInWithAppleButton(.continue) { request in
          request.requestedScopes = [.fullName]
        } onCompletion: { result in
          switch result {
          case .success(let authorization):
            guard
              let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
              let credential = AppleSignInCredential(apple)
            else {
              failure = String(localized: "Sign in with Apple did not return a usable account.")
              return
            }
            Task { await signIn(with: credential) }
          case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled {
              failure = error.localizedDescription
            }
          }
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: 50)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .disabled(isWorking)
    .opacity(isWorking ? 0.5 : 1)
    .accessibilityIdentifier("continue-with-apple")
  }

  private func signIn(with credential: AppleSignInCredential) async {
    isWorking = true
    defer { isWorking = false }
    failure = nil
    do {
      try await store.signInToCloud(with: credential)
    } catch {
      failure = String(localized: "Couldn't sign in to Shopping List Cloud. Please try again.")
      return
    }
    await onSignedIn()
  }
}

struct CloudFootnote: View {
  let showInfo: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(
        "Your lists are stored on our server so they can sync. You can delete your account at any time in Settings."
      )
      Button("About Shopping List Cloud", action: showInfo)
        .font(.footnote.weight(.semibold))
        .accessibilityIdentifier("cloud-info-button")
    }
    .font(.footnote).foregroundStyle(.secondary)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct CloudInfoSheet: View {
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    NavigationStack {
      List {
        Section("Features") {
          ForEach(Array(CloudBenefits.perks.enumerated()), id: \.offset) { _, perk in
            Label {
              VStack(alignment: .leading, spacing: 2) {
                Text(perk.title)
                Text(perk.detail).font(.footnote).foregroundStyle(.secondary)
              }
            } icon: {
              Image(systemName: perk.symbol).foregroundStyle(Color.shoppingAccent)
            }
          }
          Label("Generated icons for every item", systemImage: "sparkles")
        }
        Section("What is stored") {
          Text(
            "Your lists and their items, and your name from your Apple ID. Your email address is not requested."
          )
          Text(
            "Bring and Mealie lists stay with those services. In offline mode nothing is uploaded.")
        }
        Section("Your control") {
          Text(
            "Sign out or delete your account in Settings at any time. Both switch the app to offline; copies of your lists stay on this iPhone, and deleting removes your data from our server."
          )
          Text("Shopping List Cloud is free. Fair-use limits apply to generated icons.")
        }
      }
      .navigationTitle("Shopping List Cloud")
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
      }
    }
    .presentationDetents([.medium, .large])
  }
}

/// Settings section: the Cloud account when online, or the way to go online when offline.
struct CloudAccountSection: View {
  @EnvironmentObject private var store: AppStore
  @State private var isWorking = false
  @State private var failure: String?
  @State private var confirmingSignOut = false
  @State private var confirmingDeletion = false
  @State private var infoPresented = false

  var body: some View {
    Section {
      if let account = store.cloudAccount, store.isCloudSignedIn, store.storageMode == .online {
        LabeledContent("Signed in as") {
          Text(account.name ?? String(localized: "Apple ID"))
        }
        .accessibilityIdentifier("cloud-account-name")
        LabeledContent("Lists in Cloud") {
          Text("\(store.lists.filter { $0.syncTarget?.provider == .cloud }.count)")
        }
        Button("Sign Out") { confirmingSignOut = true }
          .accessibilityIdentifier("cloud-sign-out")
        Button("Delete Account", role: .destructive) { confirmingDeletion = true }
          .disabled(isWorking)
          .accessibilityIdentifier("cloud-delete-account")
      } else {
        LabeledContent("Mode") { Text("Offline") }
          .accessibilityIdentifier("storage-mode")
        GoOnlineButton(isWorking: $isWorking, failure: $failure)
          .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
      }
      // The sheet sits on the row: a sheet on a Form section is never presented.
      Button("About Shopping List Cloud") { infoPresented = true }
        .sheet(isPresented: $infoPresented) { CloudInfoSheet() }
      if let failure {
        Text(failure).font(.footnote).foregroundStyle(.red)
      }
    } header: {
      Text("Shopping List Cloud")
    } footer: {
      if store.storageMode != .online {
        Text(
          "Go online to share with family, back up to Cloud, and use MCP. Your lists on this iPhone move to Shopping List Cloud."
        )
      }
    }
    .confirmationDialog(
      "Sign out of Shopping List Cloud?", isPresented: $confirmingSignOut, titleVisibility: .visible
    ) {
      Button("Sign Out", role: .destructive) { store.signOutOfCloud() }
    } message: {
      Text("The app switches to offline. Your lists stay on this iPhone and stop syncing.")
    }
    .confirmationDialog(
      "Delete your Cloud account?", isPresented: $confirmingDeletion, titleVisibility: .visible
    ) {
      Button("Delete Account", role: .destructive) {
        Task {
          isWorking = true
          defer { isWorking = false }
          do {
            try await store.deleteCloudAccount()
          } catch {
            failure = String(localized: "Couldn't delete your account. Please try again.")
          }
        }
      }
    } message: {
      Text(
        "This permanently deletes your lists from our server and switches the app to offline. Copies stay on this iPhone."
      )
    }
  }
}

/// Signs in with Apple if needed, then moves the local lists to Cloud.
struct GoOnlineButton: View {
  @EnvironmentObject private var store: AppStore
  @Binding var isWorking: Bool
  @Binding var failure: String?

  var body: some View {
    if store.isCloudSignedIn {
      Button {
        Task {
          isWorking = true
          defer { isWorking = false }
          await goOnline()
        }
      } label: {
        Group {
          if isWorking { ProgressView().tint(.white) } else { Text("Go Online") }
        }
        .font(.headline).frame(maxWidth: .infinity).frame(height: 50)
      }
      .buttonStyle(.borderedProminent).tint(.shoppingAccent)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .disabled(isWorking)
      .accessibilityIdentifier("go-online")
    } else {
      CloudContinueButton(isWorking: $isWorking, failure: $failure) { await goOnline() }
    }
  }

  private func goOnline() async {
    failure = nil
    do {
      try await store.goOnline()
    } catch {
      failure = String(
        localized: "Couldn't move your lists to Shopping List Cloud. Please try again.")
    }
  }
}

/// Shown on first launch and on the first launch after updating: offline or online.
struct ModeChoiceScreen: View {
  @EnvironmentObject private var store: AppStore
  @State private var choice: StorageMode?
  @State private var isWorking = false
  @State private var failure: String?
  @State private var infoPresented = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        VStack(alignment: .leading, spacing: 8) {
          Image(systemName: "cart.fill")
            .font(.system(size: 30, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 64, height: 64)
            .background(
              LinearGradient(
                colors: [.shoppingAccent, .shoppingMint], startPoint: .topLeading,
                endPoint: .bottomTrailing),
              in: RoundedRectangle(cornerRadius: 16, style: .continuous)
            )
            .padding(.bottom, 6)
            .accessibilityHidden(true)
          Text("Welcome to Shopping List").font(.largeTitle.bold())
          Text("How do you want to use the app? You can change this later in Settings.")
            .font(.subheadline).foregroundStyle(.secondary)
        }
        VStack(spacing: 12) {
          StorageOptionCard(
            symbol: "icloud.fill", title: "Online",
            subtitle: "Shopping List Cloud with your Apple ID.",
            badge: "FREE", isSelected: choice == .online, identifier: "mode-online"
          ) {
            choice = .online
          } details: {
            VStack(alignment: .leading, spacing: 10) {
              ForEach(Array(CloudBenefits.perks.enumerated()), id: \.offset) { _, perk in
                HStack(alignment: .top, spacing: 10) {
                  Image(systemName: perk.symbol)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.shoppingAccent)
                    .frame(width: 22)
                  VStack(alignment: .leading, spacing: 1) {
                    Text(perk.title).font(.subheadline.weight(.semibold))
                      .foregroundStyle(.primary)
                    Text(perk.detail).font(.footnote).foregroundStyle(.secondary)
                  }
                }
              }
            }
            .padding(.top, 8)
          }
          StorageOptionCard(
            symbol: "iphone", title: "Offline",
            subtitle: "Your lists stay on this iPhone. No account needed.",
            isSelected: choice == .offline, identifier: "mode-offline"
          ) {
            choice = .offline
          } details: {
            EmptyView()
          }
        }
        Label("Bring and Mealie lists work in both modes.", systemImage: "link")
          .font(.footnote).foregroundStyle(.secondary)
      }
      .padding(.horizontal, 20)
      .padding(.top, 32)
      .padding(.bottom, 16)
    }
    .safeAreaInset(edge: .bottom) {
      VStack(spacing: 10) {
        switch choice {
        case .online:
          GoOnlineButton(isWorking: $isWorking, failure: $failure)
          if let failure {
            Text(failure).font(.footnote).foregroundStyle(.red)
              .frame(maxWidth: .infinity, alignment: .leading)
              .accessibilityIdentifier("mode-error")
          }
          VStack(alignment: .leading, spacing: 4) {
            Text("Your lists on this iPhone move to Shopping List Cloud.")
            Button("About Shopping List Cloud") { infoPresented = true }
              .font(.footnote.weight(.semibold))
              .accessibilityIdentifier("cloud-info-button")
          }
          .font(.footnote).foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
        case .offline, nil:
          Button {
            store.chooseOffline()
          } label: {
            Text("Continue").font(.headline).frame(maxWidth: .infinity).frame(height: 50)
          }
          .buttonStyle(.borderedProminent).tint(.shoppingAccent)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .disabled(choice == nil)
          .accessibilityIdentifier("mode-continue")
        }
      }
      .padding(.horizontal, 20)
      .padding(.top, 12)
      .padding(.bottom, 8)
      .background(.bar)
    }
    .background(Color.groupedBackground)
    .animation(.snappy, value: choice)
    .interactiveDismissDisabled()
    .sheet(isPresented: $infoPresented) { CloudInfoSheet() }
    .onAppear {
      // Someone already signed in before this screen existed most likely wants to stay online.
      if choice == nil, store.isCloudSignedIn { choice = .online }
      #if DEBUG
        if Demo.isActive { choice = .online }
      #endif
    }
  }
}

/// Settings section for sharing: the household's members, invitations, leaving and switching.
struct HouseholdSection: View {
  @EnvironmentObject private var store: AppStore
  @State private var isWorking = false
  @State private var failure: String?
  @State private var removing: Household.Member?
  @State private var confirmingLeave = false

  var body: some View {
    Section {
      if let household = store.household {
        LabeledContent("Household") { Text(household.name) }
          .accessibilityIdentifier("household-name")
        ForEach(household.members) { member in
          HStack {
            Image(systemName: "person.crop.circle.fill")
              .font(.title2).foregroundStyle(Color.shoppingAccent.opacity(0.8))
            VStack(alignment: .leading, spacing: 2) {
              Text(memberName(member))
              Text(member.role == .owner ? "Owner" : "Member")
                .font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            if household.isOwner, member.you != true {
              Button("Remove", role: .destructive) { removing = member }
                .font(.footnote).buttonStyle(.borderless)
                .accessibilityIdentifier("remove-member-\(member.id)")
            }
          }
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("household-member")
        }
        if household.isOwner {
          Button {
            Task { await createInvite() }
          } label: {
            Label("Invite Someone", systemImage: "person.badge.plus")
          }
          .disabled(isWorking)
          .accessibilityIdentifier("invite-member")
          if let pending = household.pendingInvites, pending > 0 {
            Button("Revoke Open Invitations (\(pending))", role: .destructive) {
              Task { await run { try await store.revokeInvites() } }
            }
            .accessibilityIdentifier("revoke-invites")
          }
        }
        if store.households.count > 1 {
          Picker(
            "Switch Household",
            selection: Binding(
              get: { household.id },
              set: { id in Task { await run { try await store.switchHousehold(to: id) } } })
          ) {
            ForEach(store.households) { Text($0.name).tag($0.id) }
          }
          .disabled(isWorking)
          .accessibilityIdentifier("switch-household")
          Button("Leave Household", role: .destructive) { confirmingLeave = true }
            .disabled(isWorking)
            .accessibilityIdentifier("leave-household")
        }
      } else if isWorking {
        ProgressView()
      }
      if let failure {
        Text(failure).font(.footnote).foregroundStyle(.red)
      }
    } header: {
      Text("Share with Family")
    } footer: {
      Text(
        "Everyone in your household sees and edits the same Cloud lists. Invitations are links that work once and expire after a few days."
      )
    }
    .task(id: store.providerConfigurations[.cloud]?.secret) {
      isWorking = true
      defer { isWorking = false }
      do {
        try await store.refreshHousehold()
        failure = nil
      } catch {
        failure = String(localized: "Couldn't load your household. Please try again.")
      }
    }
    .confirmationDialog(
      "Remove this member?",
      isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
      titleVisibility: .visible, presenting: removing
    ) { member in
      Button("Remove \(memberName(member))", role: .destructive) {
        Task { await run { try await store.removeMember(member) } }
      }
    } message: { _ in
      Text("They lose access to this household's lists. Their own lists stay with them.")
    }
    .confirmationDialog(
      "Leave this household?", isPresented: $confirmingLeave, titleVisibility: .visible
    ) {
      Button("Leave Household", role: .destructive) {
        Task { await run { try await store.leaveHousehold() } }
      }
    } message: {
      Text("Its lists disappear from this iPhone and you switch to your other household.")
    }
  }

  private func memberName(_ member: Household.Member) -> String {
    let name = member.name ?? String(localized: "Apple ID")
    return member.you == true ? String(localized: "\(name) (you)") : name
  }

  private func createInvite() async {
    await run {
      let url = try await store.createInvite()
      ShareSheet.present(items: [InviteShare.message, url])
    }
  }

  private func run(_ action: () async throws -> Void) async {
    isWorking = true
    defer { isWorking = false }
    failure = nil
    do {
      try await action()
    } catch {
      failure =
        (error as? HouseholdError)?.errorDescription
        ?? String(localized: "Couldn't reach Shopping List Cloud. Please try again.")
    }
  }
}

enum InviteShare {
  static var message: String { String(localized: "Join my shopping list in Shopping List:") }
}

/// The system share sheet. On iPhone it is presented by UIKit from the topmost screen: wrapped
/// in a SwiftUI sheet it could not be closed after Messages or Mail had opened on top of it.
@MainActor enum ShareSheet {
  static func present(items: [Any]) {
    #if os(iOS)
      let scene = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .first { $0.activationState == .foregroundActive }
      guard var top = scene?.keyWindow?.rootViewController else { return }
      while let presented = top.presentedViewController { top = presented }
      // No popover anchor: the app is iPhone-only, and an anchor turns the sheet into a small
      // popover without a close button.
      let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
      top.present(controller, animated: true)
    #else
      // The Mac's sharing menu, shown under the mouse pointer in the frontmost window.
      guard let window = NSApp.keyWindow, let view = window.contentView else { return }
      let point = view.convert(window.mouseLocationOutsideOfEventStream, from: nil)
      NSSharingServicePicker(items: items).show(
        relativeTo: NSRect(origin: point, size: .zero), of: view, preferredEdge: .minY)
    #endif
  }
}

/// Opened from an invite link: joins the household after confirming, going online first if
/// needed.
struct JoinHouseholdSheet: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  let invite: String
  @State private var isWorking = false
  @State private var failure: String?
  @State private var joined: String?
  @State private var details: InviteDetails?

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 18) {
        Image(systemName: joined == nil ? "person.2.fill" : "checkmark.circle.fill")
          .font(.system(size: 44)).foregroundStyle(Color.shoppingAccent)
        if let joined {
          Text("You joined \(joined)").font(.title2.bold())
            .accessibilityIdentifier("joined-household")
          Text("Its lists are now on this iPhone. You can switch households in Settings.")
            .foregroundStyle(.secondary)
          Button("Done") { dismiss() }
            .buttonStyle(.borderedProminent).tint(.shoppingAccent)
        } else {
          Group {
            if let details {
              Text("Join \(details.household.name)?")
            } else {
              Text("Join a shared household?")
            }
          }
          .font(.title2.bold())
          .accessibilityIdentifier("join-title")
          Text(
            "You were invited to share shopping lists. After joining, this iPhone shows the household's lists; your own lists stay in your account."
          )
          .foregroundStyle(.secondary)
          if store.isCloudSignedIn && store.storageMode == .online {
            Button {
              Task { await join() }
            } label: {
              Group {
                if isWorking { ProgressView().tint(.white) } else { Text("Join Household") }
              }
              .font(.headline).frame(maxWidth: .infinity).frame(height: 50)
            }
            .buttonStyle(.borderedProminent).tint(.shoppingAccent)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .disabled(isWorking)
            .accessibilityIdentifier("join-household")
          } else {
            Text(
              "Sharing needs Shopping List Cloud. Your lists on this iPhone move to Cloud first."
            )
            .font(.footnote).foregroundStyle(.secondary)
            GoOnlineButton(isWorking: $isWorking, failure: $failure)
          }
        }
        if let failure {
          Text(failure).font(.footnote).foregroundStyle(.red)
            .accessibilityIdentifier("join-error")
        }
        Spacer()
      }
      .padding(24)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      }
    }
    .presentationDetents([.medium, .large])
    // The household's name, once signed in; "Join a shared household?" until then.
    .task(id: store.isCloudSignedIn) {
      guard store.isCloudSignedIn, details == nil else { return }
      details = try? await store.lookUpInvite(invite)
    }
  }

  private func join() async {
    isWorking = true
    defer { isWorking = false }
    failure = nil
    do {
      joined = try await store.acceptInvite(invite)
    } catch ProviderError.requestFailed(404) {
      failure = String(localized: "This invitation has expired or was already used.")
    } catch {
      failure = String(localized: "Couldn't reach Shopping List Cloud. Please try again.")
    }
  }
}
