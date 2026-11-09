import SwiftUI

#if os(macOS)
  import AppKit
#endif

extension Color {
  /// The background behind grouped content: the grouped table colour on iPhone, the window
  /// colour on the Mac.
  static var groupedBackground: Color {
    #if os(iOS)
      Color(.systemGroupedBackground)
    #else
      Color(nsColor: .windowBackgroundColor)
    #endif
  }
}

extension View {
  /// A small, centred navigation title on iPhone; the Mac has no large titles.
  @ViewBuilder func inlineNavigationTitle() -> some View {
    #if os(iOS)
      navigationBarTitleDisplayMode(.inline)
    #else
      self
    #endif
  }
}
