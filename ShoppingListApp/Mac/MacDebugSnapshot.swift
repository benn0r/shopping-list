#if DEBUG
  import AppKit

  /// For checking the Mac layout without screen recording rights: launched with
  /// `-snapshot <path.png>`, the app draws its main window into that file after a few seconds.
  /// `-snapshot-inspector` opens the inspector on the first item first.
  @MainActor enum MacDebugSnapshot {
    static var path: String? {
      let arguments = ProcessInfo.processInfo.arguments
      guard let index = arguments.firstIndex(of: "-snapshot"), index + 1 < arguments.count else {
        return nil
      }
      return arguments[index + 1]
    }

    static func scheduleIfRequested() {
      guard let path else { return }
      if ProcessInfo.processInfo.arguments.contains("-snapshot-dark") {
        NSApp.appearance = NSAppearance(named: .darkAqua)
      }
      let settings = ProcessInfo.processInfo.arguments.first { $0.hasPrefix("-snapshot-settings") }
      Task { @MainActor in
        try? await Task.sleep(for: .seconds(3))
        // `-snapshot-settings[=<tab index>]` captures the Settings window instead.
        let window =
          settings != nil
          ? NSApp.windows.first { $0.isVisible && $0.frame.width < 700 && $0.frame.height > 100 }
          : NSApp.windows.first { $0.isVisible && $0.contentView != nil && $0.frame.width > 400 }
        guard let window else { exit(1) }
        // `-snapshot-width <points>[,<points>…]` resizes the window first, one width after another.
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "-snapshot-width"), index + 1 < arguments.count {
          for width in arguments[index + 1].split(separator: ",").compactMap({ Double($0) }) {
            window.setContentSize(NSSize(width: width, height: window.contentLayoutRect.height))
            try? await Task.sleep(for: .seconds(1.5))
          }
        }
        write(window, to: path)
        // A sheet is a window of its own: saved next to the main window as "<name>-sheet.png".
        if let sheet = window.attachedSheet {
          write(sheet, to: path.replacingOccurrences(of: ".png", with: "-sheet.png"))
        }
        exit(0)
      }
    }

    private static func write(_ window: NSWindow, to path: String) {
      guard let image = capture(window) else { return }
      let rep = NSBitmapImageRep(cgImage: image)
      try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    }

    /// `CGWindowListCreateImage` is hidden from the macOS 15 SDK but still works for an app's
    /// own windows, which need no screen recording permission.
    private static func capture(_ window: NSWindow) -> CGImage? {
      typealias Create = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
      guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreateImage")
      else { return nil }
      let create = unsafeBitCast(symbol, to: Create.self)
      // kCGWindowListOptionIncludingWindow, kCGWindowImageBoundsIgnoreFraming
      return create(.null, 1 << 3, UInt32(window.windowNumber), 1 << 0)?.takeRetainedValue()
    }
  }
#endif
