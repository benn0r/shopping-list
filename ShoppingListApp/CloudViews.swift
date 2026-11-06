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
          Text("Bring and Mealie lists stay with those services. In offline mode nothing is uploaded.")
        }
        Section("Your control") {
          Text(
            "Sign out or delete your account in Settings at any time. Both switch the app to offline; copies of your lists stay on this iPhone, and deleting removes your data from our server."
          )
          Text("Shopping List Cloud is free. Fair-use limits apply to generated icons.")
        }
      }
      .navigationTitle("Shopping List Cloud")
      .navigationBarTitleDisplayMode(.inline)
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
              in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.bottom, 6)
            .accessibilityHidden(true)
          Text("Welcome to Shopping List").font(.largeTitle.bold())
          Text("How do you want to use the app? You can change this later in Settings.")
            .font(.subheadline).foregroundStyle(.secondary)
        }
        VStack(spacing: 12) {
          StorageOptionCard(
            symbol: "icloud.fill", title: "Online", subtitle: "Shopping List Cloud with your Apple ID.",
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
    .background(Color(.systemGroupedBackground))
    .animation(.snappy, value: choice)
    .interactiveDismissDisabled()
    .sheet(isPresented: $infoPresented) { CloudInfoSheet() }
    .onAppear {
      // Someone already signed in before this screen existed most likely wants to stay online.
      if choice == nil, store.isCloudSignedIn { choice = .online }
    }
  }
}
