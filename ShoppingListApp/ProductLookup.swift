import Foundation

struct ProductMetadata: Sendable {
  var label: String
  var brand: String?
  var imageURL: URL?
  var stores: [String]
  var source: String = "Open Food Facts"
}

struct ProductLookup: Sendable {
  private struct Response: Decodable {
    struct Product: Decodable {
      var productName: String?
      var genericName: String?
      var brands: String?
      var imageFrontURL: URL?
      var storesTags: [String]?

      enum CodingKeys: String, CodingKey {
        case productName = "product_name"
        case genericName = "generic_name"
        case brands
        case imageFrontURL = "image_front_url"
        case storesTags = "stores_tags"
      }
    }
    var status: Int
    var product: Product?
  }

  func find(barcode: String) async throws -> ProductMetadata? {
    guard
      var components = URLComponents(
        string: "https://world.openfoodfacts.org/api/v2/product/\(barcode)"),
      let language = Locale.current.language.languageCode?.identifier
    else { return nil }
    components.queryItems = [
      URLQueryItem(
        name: "fields",
        value: "product_name,generic_name,brands,image_front_url,stores_tags"),
      URLQueryItem(name: "lc", value: language),
    ]
    guard let url = components.url else { return nil }
    var request = URLRequest(url: url)
    request.setValue("ShoppingList/2.0 (iOS)", forHTTPHeaderField: "User-Agent")
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
    let value = try JSONDecoder().decode(Response.self, from: data)
    guard value.status == 1, let product = value.product else { return nil }
    let label = [product.productName, product.genericName]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .first(where: { !$0.isEmpty })
    guard let label else { return nil }
    return ProductMetadata(
      label: label, brand: product.brands, imageURL: product.imageFrontURL,
      stores: product.storesTags ?? [])
  }
}
