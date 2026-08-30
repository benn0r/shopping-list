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
        ItemCollection(
          items: store.activeItems, mode: store.viewMode,
          showCategoryLabels: store.showCategoryLabels
        ) { selectedItem = $0 }
        .padding(.horizontal, 16)
      }
      .refreshable { await store.sync() }
      .task {
        guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else {
          return
        }
        while !Task.isCancelled {
          try? await Task.sleep(for: .seconds(60))
          guard !Task.isCancelled else { return }
          await store.backgroundSync()
        }
      }
      .safeAreaInset(edge: .bottom) { composer }
      .navigationTitle(store.activeList.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Menu {
            Picker("Shopping List", selection: $store.activeListID) {
              ForEach(store.lists) { Text($0.name).tag($0.id) }
            }
          } label: {
            Label("Choose list", systemImage: "list.bullet")
          }
          .onChange(of: store.activeListID) { store.save() }
        }
      }
      .sheet(item: $selectedItem) { ItemDetails(item: $0) }
      .sheet(isPresented: $scannerPresented) { ScannerSheet() }
      .alert(
        "Error",
        isPresented: Binding(
          get: { store.errorMessage != nil },
          set: { if !$0 { store.errorMessage = nil } })
      ) {
        Button("OK") { store.errorMessage = nil }
      } message: {
        Text(store.errorMessage ?? "")
      }
    }
  }

  private var composer: some View {
    HStack(spacing: 10) {
      TextField("Add…", text: $newItem)
        .padding(.horizontal, 16)
        .frame(height: 46)
        .background(.background, in: Capsule())
        .overlay {
          Capsule().stroke(Color.shoppingAccent.opacity(0.16), lineWidth: 1)
        }
        .submitLabel(.done)
        .onSubmit {
          let label = newItem
          newItem = ""
          Task { await store.addItem(label: label) }
        }
        .accessibilityIdentifier("add-item-field")
      Button {
        scannerPresented = true
      } label: {
        Image(systemName: "camera.fill")
          .font(.system(size: 19, weight: .semibold))
          .frame(width: 46, height: 46)
      }
      .buttonStyle(.borderedProminent).buttonBorderShape(.circle).tint(.shoppingAccent)
      .accessibilityIdentifier("scan-item-button")
    }
    .padding(.horizontal, 16)
    .padding(.top, 12)
    .padding(.bottom, 10)
    .background {
      ZStack(alignment: .top) {
        Rectangle().fill(.regularMaterial)
        LinearGradient(
          colors: [.shoppingAccent.opacity(0.10), .shoppingMint.opacity(0.04), .clear],
          startPoint: .topLeading, endPoint: .bottomTrailing
        )
        Divider().overlay(Color.shoppingAccent.opacity(0.12))
      }
      .ignoresSafeArea(edges: .bottom)
    }
  }
}

private struct ItemDetails: View {
  @EnvironmentObject private var store: AppStore
  @Environment(\.dismiss) private var dismiss
  let item: ShoppingItem
  private var category: GroceryCategory { GroceryCategoryCatalog.category(for: item) }
  var body: some View {
    NavigationStack {
      List {
        if let imageURL = item.imageURL {
          Section {
            AsyncImage(url: imageURL) { image in
              image.resizable().scaledToFit()
            } placeholder: {
              ProgressView()
            }
            .frame(maxWidth: .infinity).frame(height: 180)
            .listRowBackground(Color.clear)
          }
        }
        Section {
          LabeledContent("Added", value: item.addedAt.formatted())
          if let barcode = item.barcode { LabeledContent("Barcode", value: barcode) }
          if let brand = item.brand { LabeledContent("Brand", value: brand) }
          LabeledContent {
            HStack(spacing: 6) {
              Image(systemName: category.symbol)
                .font(.caption.weight(.semibold))
                .frame(width: 16, height: 16)
              Text(category.title)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .layoutPriority(1)
            }
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(category.accent)
          } label: {
            Text("Category")
          }
          if let quantity = item.quantity {
            LabeledContent(
              "Quantity", value: "\(quantity.formatted())\(item.unit.map { " \($0)" } ?? "")")
          }
          if let source = item.productSource { LabeledContent("Source", value: source) }
          if let type = item.productType { LabeledContent("Product Type", value: type) }
          if let specification = item.remoteSpecification, !specification.isEmpty {
            LabeledContent("Provider Details", value: specification)
          }
          if let list = store.lists.first(where: { $0.id == item.sourceListID }) {
            LabeledContent("Shopping List", value: list.name)
          }
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
  @State private var lookupError: LookupFailure?

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
          do {
            guard
              let metadata = try await ProductLookup().find(
                barcode: value, preferences: store.lookupPreferences,
                customBarcodes: store.customBarcodes)
            else {
              lookupError = LookupFailure(
                title: "Product Not Found",
                message: "No product was found for this barcode.")
              code = nil
              isLookingUp = false
              return
            }
            product = ScannedProduct(barcode: value, metadata: metadata)
          } catch {
            lookupError = LookupFailure(
              title: "Product Lookup Failed",
              message: "Check your connection and try again.")
            code = nil
          }
          isLookingUp = false
        }
      }
      .sheet(item: $product) { value in
        ProductConfirmationSheet(product: value) { label, quantity in
          Task {
            await store.addItem(
              label: label, barcode: value.barcode, imageURL: value.metadata?.imageURL,
              brand: value.metadata?.brand, stores: value.metadata?.stores ?? [],
              quantity: quantity, exactLabel: value.metadata?.exactLabel,
              genericLabel: value.metadata?.genericLabel,
              productSource: value.metadata?.source, productType: value.metadata?.productType,
              categoryHints: value.metadata?.categoryHints,
              metadataResolved: true)
            dismiss()
          }
        } onRescan: {
          code = nil
        }
        .presentationDetents([.large])
      }
      .alert(item: $lookupError) { failure in
        Alert(
          title: Text(LocalizedStringKey(failure.title)),
          message: Text(LocalizedStringKey(failure.message)),
          dismissButton: .default(Text("Try Again")) {
            lookupError = nil
            code = nil
          })
      }
    }
  }
}

private struct LookupFailure: Identifiable {
  let id = UUID()
  let title: String
  let message: String
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
  @State private var quantity: Int?

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
          HStack {
            Text("Quantity")
            Spacer()
            Button {
              if let quantity { self.quantity = quantity > 1 ? quantity - 1 : nil }
            } label: {
              Image(systemName: "minus.circle.fill")
            }
            .buttonStyle(.borderless)
            .disabled(quantity == nil)
            Text(quantity.map(String.init) ?? "—").monospacedDigit().frame(minWidth: 28)
            Button {
              quantity = min(99, (quantity ?? 0) + 1)
            } label: {
              Image(systemName: "plus.circle.fill")
            }
            .buttonStyle(.borderless)
            .disabled(quantity == 99)
          }
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
          Button("Add") { onAdd(label, quantity.map(Double.init)) }
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
    let controller = ScannerViewController()
    let session = controller.captureSession
    session.beginConfiguration()
    session.sessionPreset = .high
    defer { session.commitConfiguration() }
    guard let device = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input)
    else { return controller }
    if device.isFocusModeSupported(.continuousAutoFocus) {
      try? device.lockForConfiguration()
      device.focusMode = .continuousAutoFocus
      if device.isExposureModeSupported(.continuousAutoExposure) {
        device.exposureMode = .continuousAutoExposure
      }
      device.unlockForConfiguration()
    }
    session.addInput(input)
    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else { return controller }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(context.coordinator, queue: .main)
    let desiredTypes: [AVMetadataObject.ObjectType] = [
      .ean8, .ean13, .upce, .code128, .code39, .code93, .itf14,
    ]
    output.metadataObjectTypes = desiredTypes.filter(output.availableMetadataObjectTypes.contains)
    let preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspectFill
    controller.previewLayer = preview
    controller.metadataOutput = output
    controller.view.layer.addSublayer(preview)
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

private final class ScannerViewController: UIViewController {
  let captureSession = AVCaptureSession()
  var previewLayer: AVCaptureVideoPreviewLayer?
  var metadataOutput: AVCaptureMetadataOutput?

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    startCapture()
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    stopCapture()
  }

  func startCapture() {
    let session = captureSession
    guard !session.isRunning, !session.inputs.isEmpty else { return }
    DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
  }

  private func stopCapture() {
    let session = captureSession
    guard session.isRunning else { return }
    DispatchQueue.global(qos: .userInitiated).async { session.stopRunning() }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }
}
