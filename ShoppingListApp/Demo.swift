#if DEBUG
  import Foundation

  /// Fictional data for App Store screenshots: launch with `-demo`, and optionally
  /// `-demo-screen list|scanner|product|item|shopping|settings|welcome`. Nothing is saved or
  /// synced while it is active. The texts follow the app's language (`-AppleLanguages`).
  enum Demo {
    static var isActive: Bool { ProcessInfo.processInfo.arguments.contains("-demo") }
    static var screen: String { CloudConfiguration.launchValue("demo-screen") ?? "list" }

    /// The app localization in use, such as "de", "pt" or "pt-BR".
    private static var language: String {
      Bundle.main.preferredLocalizations.first ?? "en"
    }

    private static func text(_ values: [String: String]) -> String {
      values[language] ?? values["en"]!
    }

    private struct Item {
      let icon: String
      let category: String
      let names: [String: String]
    }

    // swift-format-ignore
    private static let items: [Item] = [
      Item(icon: "apple", category: "fruitsVegetables", names: [
        "en": "Apples", "de": "Äpfel", "fr": "Pommes", "it": "Mele", "es": "Manzanas",
        "pt": "Maçãs", "pt-BR": "Maçãs", "nl": "Appels", "da": "Æbler", "sv": "Äpplen",
        "nb": "Epler", "fi": "Omenat", "pl": "Jabłka", "ja": "りんご"]),
      Item(icon: "tomato", category: "fruitsVegetables", names: [
        "en": "Cherry Tomatoes", "de": "Cherrytomaten", "fr": "Tomates cerises",
        "it": "Pomodorini", "es": "Tomates cherry", "pt": "Tomate cereja",
        "pt-BR": "Tomate-cereja", "nl": "Cherrytomaten", "da": "Cherrytomater",
        "sv": "Körsbärstomater", "nb": "Cherrytomater", "fi": "Kirsikkatomaatit",
        "pl": "Pomidorki koktajlowe", "ja": "ミニトマト"]),
      Item(icon: "avocado", category: "fruitsVegetables", names: [
        "en": "Avocados", "de": "Avocados", "fr": "Avocats", "it": "Avocado",
        "es": "Aguacates", "pt": "Abacates", "pt-BR": "Abacates", "nl": "Avocado's",
        "da": "Avocadoer", "sv": "Avokador", "nb": "Avokadoer", "fi": "Avokadot",
        "pl": "Awokado", "ja": "アボカド"]),
      Item(icon: "banana", category: "fruitsVegetables", names: [
        "en": "Bananas", "de": "Bananen", "fr": "Bananes", "it": "Banane", "es": "Plátanos",
        "pt": "Bananas", "pt-BR": "Bananas", "nl": "Bananen", "da": "Bananer",
        "sv": "Bananer", "nb": "Bananer", "fi": "Banaanit", "pl": "Banany", "ja": "バナナ"]),
      Item(icon: "cornbread", category: "bakery", names: [
        "en": "Sourdough Bread", "de": "Sauerteigbrot", "fr": "Pain au levain",
        "it": "Pane a lievito madre", "es": "Pan de masa madre", "pt": "Pão de fermentação natural",
        "pt-BR": "Pão de fermentação natural", "nl": "Zuurdesembrood", "da": "Surdejsbrød",
        "sv": "Surdegsbröd", "nb": "Surdeigsbrød", "fi": "Hapanjuurileipä",
        "pl": "Chleb na zakwasie", "ja": "サワードウブレッド"]),
      Item(icon: "milk", category: "dairyEggs", names: [
        "en": "Whole Milk", "de": "Vollmilch", "fr": "Lait entier", "it": "Latte intero",
        "es": "Leche entera", "pt": "Leite gordo", "pt-BR": "Leite integral",
        "nl": "Volle melk", "da": "Sødmælk", "sv": "Standardmjölk", "nb": "Helmelk",
        "fi": "Täysmaito", "pl": "Mleko pełne", "ja": "牛乳"]),
      Item(icon: "eggs", category: "dairyEggs", names: [
        "en": "Free-Range Eggs", "de": "Freilandeier", "fr": "Œufs plein air",
        "it": "Uova da allevamento all'aperto", "es": "Huevos camperos",
        "pt": "Ovos de galinhas criadas ao ar livre", "pt-BR": "Ovos caipiras",
        "nl": "Scharreleieren", "da": "Frilandsæg", "sv": "Frigående ägg",
        "nb": "Frittgående egg", "fi": "Vapaan kanan munat", "pl": "Jajka z wolnego wybiegu",
        "ja": "平飼い卵"]),
      Item(icon: "cheddar", category: "cheese", names: [
        "en": "Cheddar", "de": "Cheddar", "fr": "Cheddar", "it": "Cheddar", "es": "Queso cheddar",
        "pt": "Queijo cheddar", "pt-BR": "Queijo cheddar", "nl": "Cheddar", "da": "Cheddar",
        "sv": "Cheddar", "nb": "Cheddar", "fi": "Cheddar", "pl": "Ser cheddar",
        "ja": "チェダーチーズ"]),
      Item(icon: "pasta", category: "pastaRiceGrains", names: [
        "en": "Spaghetti", "de": "Spaghetti", "fr": "Spaghettis", "it": "Spaghetti",
        "es": "Espaguetis", "pt": "Esparguete", "pt-BR": "Espaguete", "nl": "Spaghetti",
        "da": "Spaghetti", "sv": "Spaghetti", "nb": "Spagetti", "fi": "Spagetti",
        "pl": "Spaghetti", "ja": "スパゲッティ"]),
      Item(icon: "coffee", category: "coffeeTea", names: [
        "en": "Coffee Beans", "de": "Kaffeebohnen", "fr": "Café en grains",
        "it": "Caffè in grani", "es": "Café en grano", "pt": "Café em grão",
        "pt-BR": "Café em grãos", "nl": "Koffiebonen", "da": "Kaffebønner",
        "sv": "Kaffebönor", "nb": "Kaffebønner", "fi": "Kahvipavut", "pl": "Kawa ziarnista",
        "ja": "コーヒー豆"]),
      Item(icon: "chocolate_chips", category: "snacksSweets", names: [
        "en": "Dark Chocolate", "de": "Dunkle Schokolade", "fr": "Chocolat noir",
        "it": "Cioccolato fondente", "es": "Chocolate negro", "pt": "Chocolate negro",
        "pt-BR": "Chocolate amargo", "nl": "Pure chocolade", "da": "Mørk chokolade",
        "sv": "Mörk choklad", "nb": "Mørk sjokolade", "fi": "Tumma suklaa",
        "pl": "Gorzka czekolada", "ja": "ダークチョコレート"]),
      Item(icon: "sparkling_water", category: "beverages", names: [
        "en": "Sparkling Water", "de": "Mineralwasser", "fr": "Eau gazeuse",
        "it": "Acqua frizzante", "es": "Agua con gas", "pt": "Água com gás",
        "pt-BR": "Água com gás", "nl": "Bruisend water", "da": "Danskvand",
        "sv": "Kolsyrat vatten", "nb": "Farris", "fi": "Kivennäisvesi", "pl": "Woda gazowana",
        "ja": "炭酸水"]),
    ]

    static let storeName = [
      "en": "Green Market", "de": "Grüner Markt", "fr": "Marché Vert", "it": "Mercato Verde",
      "es": "Mercado Verde", "pt": "Mercado Verde", "pt-BR": "Mercado Verde",
      "nl": "Groene Markt", "da": "Grønt Marked", "sv": "Gröna Torget", "nb": "Grønt Marked",
      "fi": "Vihreä tori", "pl": "Zielony Targ", "ja": "グリーンマーケット",
    ]

    static var storeTitle: String { text(storeName) }

    // swift-format-ignore
    private static let householdName = [
      "en": "Household", "de": "Haushalt", "fr": "Maison", "it": "Casa", "es": "Hogar",
      "pt": "Casa", "pt-BR": "Casa", "nl": "Huishouden", "da": "Husholdning", "sv": "Hushåll",
      "nb": "Husholdning", "fi": "Kotitalous", "pl": "Dom", "ja": "日用品",
    ]
    // swift-format-ignore
    private static let pharmacyName = [
      "en": "Pharmacy", "de": "Apotheke", "fr": "Pharmacie", "it": "Farmacia", "es": "Farmacia",
      "pt": "Farmácia", "pt-BR": "Farmácia", "nl": "Apotheek", "da": "Apotek", "sv": "Apotek",
      "nb": "Apotek", "fi": "Apteekki", "pl": "Apteka", "ja": "薬局",
    ]

    static var productLabel: String {
      text([
        "en": "Raspberry Oat Yogurt", "de": "Himbeer-Hafer-Joghurt",
        "fr": "Yaourt framboise avoine",
        "it": "Yogurt lampone e avena", "es": "Yogur de frambuesa y avena",
        "pt": "Iogurte de framboesa e aveia", "pt-BR": "Iogurte de framboesa e aveia",
        "nl": "Framboos-haveryoghurt", "da": "Hindbær-havreyoghurt",
        "sv": "Hallon- och havreyoghurt",
        "nb": "Bringebær- og havreyoghurt", "fi": "Vadelma-kaurajogurtti",
        "pl": "Jogurt malinowo-owsiany", "ja": "ラズベリーオーツヨーグルト",
      ])
    }

    /// Replaces the store's state with the demo data.
    @MainActor static func seed(_ store: AppStore) {
      let groceries = ShoppingListDefinition(
        name: String(localized: "Groceries"),
        syncTarget: SyncTarget(provider: .cloud, remoteListID: "demo", remoteListName: "Groceries"))
      let shop = StoreDefinition(name: storeTitle)
      let listItems = items.map { item in
        var value = ShoppingItem(label: text(item.names), sourceListID: groceries.id)
        value.iconName = item.icon
        value.providerCategory = item.category
        return value
      }
      store.lists = [groceries]
      #if os(macOS)
        // More lists for the Mac sidebar: one on this Mac, one linked to Bring.
        let household = ShoppingListDefinition(name: text(householdName))
        let pharmacy = ShoppingListDefinition(
          name: text(pharmacyName),
          syncTarget: SyncTarget(provider: .bring, remoteListID: "demo-2", remoteListName: "Pharmacy"))
        store.lists += [household, pharmacy]
        store.providerConfigurations[.bring] = ProviderConfiguration(
          enabled: true, username: "alex@example.com", secret: "demo-password")
      #endif
      store.activeListID = groceries.id
      store.stores = [shop]
      store.viewMode = .tiles
      store.showCategoryLabels = true
      if screen == "welcome" {
        // A first launch: not signed in, so the welcome screen offers Continue with Apple.
        store.cloudAccount = nil
        store.providerConfigurations[.cloud] = ProviderConfiguration()
        store.storageMode = nil
      } else {
        store.cloudAccount = CloudAccount(userID: "demo", appleUserID: "demo", name: "Alex")
        store.providerConfigurations[.cloud] = ProviderConfiguration(
          enabled: true, serverURL: "https://demo.invalid", secret: "demo")
        store.storageMode = .online
      }
      if screen == "shopping" {
        // Mid-trip: the first three items are already in the basket.
        store.items = [groceries.id: Array(listItems.dropFirst(3))]
        var session = ShoppingSession(
          store: shop, listIDs: [groceries.id], listNames: [groceries.name])
        session.purchasedItems = listItems.prefix(3).map { PurchasedItem(item: $0) }
        store.sessions = [session]
      } else {
        store.items = [groceries.id: listItems]
        #if os(macOS)
          for (list, count) in zip(store.lists.dropFirst(), [5, 2]) {
            store.items[list.id] = (1...count).map {
              ShoppingItem(label: "\(list.name) \($0)", sourceListID: list.id)
            }
          }
        #endif
        store.sessions = []
      }
    }
  }
#endif
