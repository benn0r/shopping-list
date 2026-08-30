@preconcurrency import AVFoundation
import SwiftUI

struct ShoppingListScreen: View {
  @EnvironmentObject private var store: AppStore
  @State private var newItem = ""
  @State private var selectedItem: ShoppingItem?
  @State private var scannerPresented = false

  var body: some View {
    NavigationStack {
      ScrollView {
        ItemCollection(items: store.activeItems, mode: store.viewMode) { selectedItem = $0 }
          .padding(.horizontal, 16)
      }
      .refreshable { await store.sync() }
      .safeAreaInset(edge: .bottom) { composer }
      .navigationTitle(store.activeList.name)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Menu {
            Picker("Shopping List", selection: $store.activeListID) {
              ForEach(store.lists) { Text($0.name).tag($0.id) }
            }
          } label: {
            Label("Choose list", systemImage: "list.bullet")
          }
        }
      }
      .sheet(item: $selectedItem) { ItemDetails(item: $0) }
      .sheet(isPresented: $scannerPresented) { ScannerSheet() }
      .alert("Sync Error", isPresented: .constant(store.errorMessage != nil)) {
        Button("OK") { store.errorMessage = nil }
      } message: {
        Text(store.errorMessage ?? "")
      }
    }
  }

  private var composer: some View {
    HStack(spacing: 10) {
      TextField("Add…", text: $newItem)
        .textFieldStyle(.roundedBorder).submitLabel(.done)
        .onSubmit {
          let label = newItem
          newItem = ""
          Task { await store.addItem(label: label) }
        }
        .accessibilityIdentifier("add-item-field")
      Button {
        scannerPresented = true
      } label: {
        Image(systemName: "camera.fill").font(.title3).frame(width: 44, height: 44)
      }
      .buttonStyle(.borderedProminent).buttonBorderShape(.circle).tint(.teal)
      .accessibilityIdentifier("scan-item-button")
    }.padding().background(.ultraThinMaterial)
  }
}

private struct ItemDetails: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  let item: ShoppingItem
  var body: some View {
    NavigationStack {
      List {
        Section {
          LabeledContent("Added", value: item.addedAt.formatted())
          if let barcode = item.barcode { LabeledContent("Barcode", value: barcode) }
          if let brand = item.brand { LabeledContent("Brand", value: brand) }
        }
        Section("Stores") {
          Text(item.stores.isEmpty ? "Unknown" : item.stores.joined(separator: ", "))
        }
        Section {
          Button("Remove", role: .destructive) {
            Task {
              await store.remove(item)
              dismiss()
            }
          }
        }
      }.navigationTitle(item.label).toolbar { Button("Done") { dismiss() } }
    }
  }
}

private struct ScannerSheet: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  @State private var code: String?
  @State private var product: ScannedProduct?
  @State private var isLookingUp = false
  @State private var lookupError: String?

  var body: some View {
    NavigationStack {
      ZStack {
        BarcodeScanner(code: $code).ignoresSafeArea(edges: .bottom)
        ScannerOverlay(isLookingUp: isLookingUp)
      }
      .navigationTitle("Scan Product").navigationBarTitleDisplayMode(.inline)
      .toolbar { Button("Cancel") { dismiss() } }
      .onChange(of: code) { _, value in
        guard let value, !isLookingUp, product == nil else { return }
        isLookingUp = true
        Task {
          let metadata = try? await ProductLookup().find(barcode: value)
          product = ScannedProduct(barcode: value, metadata: metadata)
          isLookingUp = false
        }
      }
      .sheet(item: $product) { value in
        ProductConfirmationSheet(product: value) { label, quantity in
          Task {
            await store.addItem(
              label: label, barcode: value.barcode, imageURL: value.metadata?.imageURL,
              brand: value.metadata?.brand, stores: value.metadata?.stores ?? [],
              quantity: quantity)
            dismiss()
          }
        } onRescan: {
          code = nil
        }
        .presentationDetents([.large])
      }
      .alert("Product lookup failed", isPresented: .constant(lookupError != nil)) {
        Button("Try Again") {
          lookupError = nil
          code = nil
        }
      } message: {
        Text(lookupError ?? "")
      }
    }
  }
}

private struct ScannedProduct: Identifiable {
  let id = UUID()
  let barcode: String
  let metadata: ProductMetadata?
}

private struct ScannerOverlay: View {
  let isLookingUp: Bool

  var body: some View {
    GeometryReader { geometry in
      let horizontalInset: CGFloat = 28
      let frameHeight: CGFloat = 126
      let frameTop = min(CGFloat(154), max(112, geometry.size.height * 0.28))
      ZStack(alignment: .top) {
        Color.black.opacity(0.46).frame(height: 92)
        Text("Align the barcode inside the frame")
          .font(.subheadline.weight(.semibold)).foregroundStyle(.white).padding(.top, 35)
        RoundedRectangle(cornerRadius: 12)
          .stroke(Color.teal, lineWidth: 3)
          .frame(width: geometry.size.width - horizontalInset * 2, height: frameHeight)
          .offset(y: frameTop)
        Text("EAN-8, EAN-13, UPC-A and UPC-E")
          .font(.footnote).foregroundStyle(.white.opacity(0.9))
          .padding(.horizontal, 12).padding(.vertical, 7)
          .background(.black.opacity(0.48), in: Capsule())
          .offset(y: frameTop + frameHeight + 14)
        if isLookingUp {
          Rectangle().fill(.black.opacity(0.56)).ignoresSafeArea()
          VStack(spacing: 12) {
            ProgressView().tint(.white).controlSize(.large)
            Text("Looking up product…").font(.subheadline.weight(.semibold))
          }.foregroundStyle(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }.allowsHitTesting(false)
  }
}

private struct ProductConfirmationSheet: View {
  @Environment(\.dismiss) private var dismiss
  let product: ScannedProduct
  let onAdd: (String, Double?) -> Void
  let onRescan: () -> Void
  @State private var label: String
  @State private var quantity = 1

  init(
    product: ScannedProduct, onAdd: @escaping (String, Double?) -> Void,
    onRescan: @escaping () -> Void
  ) {
    self.product = product
    self.onAdd = onAdd
    self.onRescan = onRescan
    _label = State(initialValue: product.metadata?.label ?? "EAN \(product.barcode)")
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          VStack(spacing: 10) {
            Group {
              if let imageURL = product.metadata?.imageURL {
                AsyncImage(url: imageURL) { image in
                  image.resizable().scaledToFit()
                } placeholder: {
                  ProgressView()
                }
              } else {
                Image(systemName: "barcode.viewfinder")
                  .font(.system(size: 54)).foregroundStyle(.teal)
              }
            }.frame(maxWidth: .infinity).frame(height: 140)
            if let brand = product.metadata?.brand, !brand.isEmpty {
              Text(brand).font(.subheadline).foregroundStyle(.secondary)
            }
          }.listRowBackground(Color.clear)
        }
        Section("Item") {
          TextField("Label", text: $label)
          Stepper("Quantity: \(quantity)", value: $quantity, in: 1...99)
        }
        Section("Product information") {
          LabeledContent("Barcode", value: product.barcode)
          LabeledContent("Source", value: product.metadata?.source ?? "No match found")
          if let stores = product.metadata?.stores, !stores.isEmpty {
            LabeledContent("Stores", value: stores.joined(separator: ", "))
          }
        }
      }
      .navigationTitle("Add Item").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Rescan") {
            dismiss()
            onRescan()
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Add") { onAdd(label, Double(quantity)) }
            .disabled(label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
    }
  }
}

private struct BarcodeScanner: UIViewControllerRepresentable {
  @Binding var code: String?
  func makeCoordinator() -> Coordinator { Coordinator(code: $code) }
  func makeUIViewController(context: Context) -> UIViewController {
    let controller = UIViewController()
    let session = AVCaptureSession()
    guard let device = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input)
    else { return controller }
    session.addInput(input)
    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else { return controller }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(context.coordinator, queue: .main)
    output.metadataObjectTypes = [.ean8, .ean13, .upce]
    let preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspectFill
    preview.frame = UIScreen.main.bounds
    controller.view.layer.addSublayer(preview)
    DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
    return controller
  }
  func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
  final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
    @Binding var code: String?
    init(code: Binding<String?>) { _code = code }
    func metadataOutput(
      _ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject],
      from connection: AVCaptureConnection
    ) {
      guard code == nil else { return }
      code = (objects.first as? AVMetadataMachineReadableCodeObject)?.stringValue
    }
  }
}
