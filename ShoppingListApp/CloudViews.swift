import AuthenticationServices
import SwiftUI

/// Where a new list is stored.
enum ListStorage: Hashable {
  case local, cloud, connected
}

/// The Cloud features advertised wherever the user can choose Cloud.
@MainActor enum CloudBenefits {
  static let all: [(symbol: String, text: LocalizedStringKey)] = [
    ("sparkles", "Generated icons for every item"),
    ("person.2.fill", "Share lists with family and friends"),
    ("arrow.triangle.2.circlepath", "Sync across your devices"),
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

  var body: some View {
    Button(action: action) {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: symbol)
          .font(.title3.weight(.semibold))
          .foregroundStyle(isSelected ? Color.white : Color.shoppingAccent)
          .frame(width: 40, height: 40)
          .background(
            isSelected ? Color.shoppingAccent : Color.shoppingAccent.opacity(0.12),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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
      .padding(14)
      .background(.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(
            isSelected ? Color.shoppingAccent : Color.secondary.opacity(0.22),
            lineWidth: isSelected ? 2 : 1)
      }
      .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    .accessibilityIdentifier(identifier)
  }
}

/// "On this iPhone" / "Shopping List Cloud" (/ "Connected service") choice.
struct StoragePicker: View {
  @Binding var selection: ListStorage
  var showsConnected = false

  var body: some View {
    VStack(spacing: 10) {
      StorageOptionCard(
        symbol: "iphone", title: "On this iPhone", subtitle: "Private and works offline.",
        isSelected: selection == .local, identifier: "storage-local"
      ) {
        selection = .local
      } details: {
        EmptyView()
      }
      StorageOptionCard(
        symbol: "icloud.fill", title: "Shopping List Cloud",
        subtitle: "Sign in with your Apple ID.",
        badge: "FREE", isSelected: selection == .cloud, identifier: "storage-cloud"
      ) {
        selection = .cloud
      } details: {
        VStack(alignment: .leading, spacing: 5) {
          ForEach(Array(CloudBenefits.all.enumerated()), id: \.offset) { _, benefit in
            Label(benefit.text, systemImage: benefit.symbol)
              .font(.footnote)
              .foregroundStyle(.primary)
              .labelStyle(BenefitLabelStyle())
          }
        }
        .padding(.top, 4)
      }
      if showsConnected {
        StorageOptionCard(
          symbol: "link", title: "Connected service",
          subtitle: "Bring, Mealie, or your own server.",
          isSelected: selection == .connected, identifier: "storage-connected"
        ) {
          selection = .connected
        } details: {
          EmptyView()
        }
      }
    }
  }
}

private struct BenefitLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      configuration.icon.foregroundStyle(Color.shoppingAccent).frame(width: 16)
      configuration.title
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

/// First-launch card: name the first list and choose where it is stored.
struct WelcomeCard: View {
  @EnvironmentObject private var store: AppStore
  @State private var name = String(localized: "Groceries")
  @State private var storage: ListStorage = .local
  @State private var isWorking = false
  @State private var failure: String?
  @State private var infoPresented = false

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 6) {
        Image(systemName: "cart.fill.badge.plus")
          .font(.system(size: 34, weight: .semibold))
          .foregroundStyle(Color.shoppingAccent)
          .padding(.bottom, 4)
        Text("Create your first list").font(.title2.bold())
        Text("Choose where it's stored. You can add more lists later in Settings.")
          .font(.subheadline).foregroundStyle(.secondary)
      }
      TextField("List name", text: $name)
        .font(.body.weight(.medium))
        .padding(.horizontal, 14).frame(height: 48)
        .background(.background, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(Color.secondary.opacity(0.22), lineWidth: 1)
        }
        .submitLabel(.done)
        .accessibilityIdentifier("welcome-list-name")
      StoragePicker(selection: $storage)
      VStack(spacing: 10) {
        if storage == .cloud && !store.isCloudSignedIn {
          CloudContinueButton(isWorking: $isWorking, failure: $failure) { await create() }
        } else {
          Button {
            Task { await create() }
          } label: {
            Group {
              if isWorking { ProgressView().tint(.white) } else { Text("Create List") }
            }
            .font(.headline).frame(maxWidth: .infinity).frame(height: 50)
          }
          .buttonStyle(.borderedProminent).tint(.shoppingAccent)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .disabled(isWorking || trimmedName.isEmpty)
          .accessibilityIdentifier("welcome-create-list")
        }
        if let failure {
          Text(failure).font(.footnote).foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("welcome-error")
        }
        if storage == .cloud {
          CloudFootnote { infoPresented = true }
        }
      }
    }
    .padding(20)
    .background {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(
          LinearGradient(
            colors: [.shoppingAccent.opacity(0.10), .shoppingMint.opacity(0.06)],
            startPoint: .topLeading, endPoint: .bottomTrailing))
    }
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(Color.shoppingAccent.opacity(0.16), lineWidth: 1)
    }
    .animation(.snappy, value: storage)
    .sheet(isPresented: $infoPresented) { CloudInfoSheet() }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("welcome-card")
  }

  private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

  private func create() async {
    isWorking = true
    defer { isWorking = false }
    failure = nil
    do {
      try await store.completeWelcome(name: trimmedName, inCloud: storage == .cloud)
    } catch {
      failure = String(
        localized:
          "Couldn't reach Shopping List Cloud. Try again, or keep the list on this iPhone.")
    }
  }
}

struct CloudFootnote: View {
  let showInfo: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(
        "Your list is stored on our server so it can sync. You can delete your account at any time in Settings."
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
          ForEach(Array(CloudBenefits.all.enumerated()), id: \.offset) { _, benefit in
            Label(benefit.text, systemImage: benefit.symbol)
          }
        }
        Section("What is stored") {
          Text(
            "The lists you put in Cloud and their items, and your name from your Apple ID. Your email address is not requested."
          )
          Text("Lists kept on this iPhone are never uploaded.")
        }
        Section("Your control") {
          Text(
            "Sign out or delete your account in Settings at any time. Deleting removes your Cloud data from our server; copies of your lists stay on this iPhone."
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

/// Settings section showing the Cloud account, with sign out and account deletion.
struct CloudAccountSection: View {
  @EnvironmentObject private var store: AppStore
  @State private var isWorking = false
  @State private var failure: String?
  @State private var confirmingSignOut = false
  @State private var confirmingDeletion = false
  @State private var infoPresented = false

  var body: some View {
    Section {
      if let account = store.cloudAccount, store.isCloudSignedIn {
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
        CloudContinueButton(isWorking: $isWorking, failure: $failure) {}
          .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
      }
      Button("About Shopping List Cloud") { infoPresented = true }
      if let failure {
        Text(failure).font(.footnote).foregroundStyle(.red)
      }
    } header: {
      Text("Shopping List Cloud")
    } footer: {
      if !store.isCloudSignedIn {
        Text("Sync and share lists for free. Lists on this iPhone stay local unless you move them.")
      }
    }
    .confirmationDialog(
      "Sign out of Shopping List Cloud?", isPresented: $confirmingSignOut, titleVisibility: .visible
    ) {
      Button("Sign Out", role: .destructive) { store.signOutOfCloud() }
    } message: {
      Text("Your Cloud lists stay on this iPhone as local lists and stop syncing.")
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
        "This permanently deletes your Cloud lists from our server. Copies stay on this iPhone.")
    }
    .sheet(isPresented: $infoPresented) { CloudInfoSheet() }
  }
}
