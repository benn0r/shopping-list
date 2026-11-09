// Puts window captures on a 2880×1800 background for the Mac App Store (no transparency).
//   swift scripts/mac-frame.swift <out.png> <light|dark> <window.png>[@x,y] [<window.png>[@x,y] …]
// Each window is drawn with a shadow, centered unless a position (in pixels from the top left)
// is given; later windows are drawn on top.
import AppKit

let arguments = CommandLine.arguments.dropFirst()

// `--check <window.png>`: exits 1 when the capture is blank (the window wasn't drawn yet).
if arguments.first == "--check" {
  guard arguments.count == 2,
    let image = NSImage(contentsOfFile: arguments[arguments.startIndex + 1])?
      .cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { exit(1) }
  let rep = NSBitmapImageRep(cgImage: image)
  let points = [(0.25, 0.25), (0.5, 0.5), (0.75, 0.3), (0.3, 0.8)]
  let opaque = points.filter {
    (rep.colorAt(x: Int(Double(image.width) * $0.0), y: Int(Double(image.height) * $0.1))?.alphaComponent ?? 0) > 0.5
  }
  exit(opaque.count >= 3 ? 0 : 1)
}
guard arguments.count >= 3 else {
  FileHandle.standardError.write("usage: mac-frame.swift out.png light|dark window.png[@x,y] …\n".data(using: .utf8)!)
  exit(1)
}
let output = arguments[arguments.startIndex]
let dark = arguments[arguments.startIndex + 1] == "dark"
let width = 2880
let height = 1800

let space = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CGContext(
  data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!

func color(_ hex: UInt32) -> CGColor {
  CGColor(
    srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

let colors = dark ? [color(0x1F3A33), color(0x101615)] : [color(0xD9EFE5), color(0xF6F1E4)]
let gradient = CGGradient(colorsSpace: space, colors: colors as CFArray, locations: [0, 1])!
context.drawLinearGradient(
  gradient, start: CGPoint(x: 0, y: CGFloat(height)), end: CGPoint(x: CGFloat(width), y: 0), options: [])

for argument in arguments.dropFirst(2) {
  let parts = argument.split(separator: "@", maxSplits: 1)
  guard let source = NSImage(contentsOfFile: String(parts[0])),
    let image = source.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else {
    FileHandle.standardError.write("can't read \(parts[0])\n".data(using: .utf8)!)
    exit(1)
  }
  var x = (width - image.width) / 2
  var top = (height - image.height) / 2
  if parts.count == 2 {
    let position = parts[1].split(separator: ",").compactMap { Int($0) }
    if position.count == 2 { (x, top) = (position[0], position[1]) }
  }
  let rect = CGRect(x: x, y: height - top - image.height, width: image.width, height: image.height)
  context.saveGState()
  context.setShadow(
    offset: CGSize(width: 0, height: -24), blur: 90,
    color: CGColor(gray: 0, alpha: dark ? 0.6 : 0.28))
  context.draw(image, in: rect)
  context.restoreGState()
}

let rep = NSBitmapImageRep(cgImage: context.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
print(output)
