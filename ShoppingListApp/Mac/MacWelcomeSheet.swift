import SwiftUI

/// First launch: keep lists on this Mac, or use Shopping List Cloud with an Apple ID.
struct MacWelcomeSheet: View {
  @EnvironmentObject private var store: AppStore
  @State private var choice: StorageMode = .online
  @State private var isWorking = false
  @State private var failure: String?
  @State private var infoPresented = false

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(spacing: 14) {
        Image(nsImage: NSApp.applicationIconImage)
          .resizable()
          .frame(width: 64, height: 64)
        VStack(alignment: .leading, spacing: 3) {
          Text("Welcome to Shopping List")
            .font(.title2.weight(.semibold))
          Text("How do you want to use the app? You can change this later in Settings.")
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      VStack(spacing: 0) {
        option(
          .online, symbol: "icloud", title: "Online",
          detail: "Shopping List Cloud with your Apple ID. Share lists with family, use them on iPhone and Mac, and connect AI assistants.")
        Divider().padding(.leading, 44)
        option(
          .offline, symbol: "laptopcomputer", title: "Offline",
          detail: "Your lists stay on this Mac. No account needed.")
      }
      .background(.background.secondary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .strokeBorder(.separator, lineWidth: 1)
      }

      Label("Bring and Mealie lists work in both modes.", systemImage: "link")
        .font(.callout)
        .foregroundStyle(.secondary)

      if let failure {
        Text(failure).font(.callout).foregroundStyle(.red)
      }

      HStack {
        Button("About Shopping List Cloud") { infoPresented = true }
          .buttonStyle(.link)
        Spacer()
        if choice == .online {
          GoOnlineButton(isWorking: $isWorking, failure: $failure)
            .frame(width: 220)
        } else {
          Button("Continue") { store.chooseOffline() }
            .keyboardShortcut(.defaultAction)
            .controlSize(.large)
        }
      }
    }
    .padding(24)
    .frame(width: 520)
    .interactiveDismissDisabled()
    .sheet(isPresented: $infoPresented) { CloudInfoSheet().frame(width: 460, height: 460) }
    .onAppear {
      // Someone already signed in on this Mac most likely wants to stay online.
      if store.isCloudSignedIn { choice = .online }
    }
  }

  private func option(
    _ mode: StorageMode, symbol: String, title: LocalizedStringKey, detail: LocalizedStringKey
  ) -> some View {
    Button {
      choice = mode
    } label: {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: choice == mode ? "largecircle.fill.circle" : "circle")
          .font(.title3)
          .foregroundStyle(choice == mode ? Color.accentColor : .secondary)
          .frame(width: 20)
        VStack(alignment: .leading, spacing: 3) {
          Label(title, systemImage: symbol).font(.headline)
          Text(detail)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
      }
      .padding(12)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(choice == mode ? .isSelected : [])
  }
}
