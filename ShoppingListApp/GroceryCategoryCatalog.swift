import Foundation

enum GroceryCategory: Int, CaseIterable, Identifiable {
  case fruitsVegetables, bakery, breakfast, dairyEggs, cheese, meatPoultry, fishSeafood
  case deliConvenience, plantBased, pastaRiceGrains, cannedJarred, saucesCondiments
  case bakingSpices, international, snacksSweets, coffeeTea, beverages, alcohol
  case frozenFoods, householdCleaning, paperStorage, bathroomSupplies, personalCare, health, baby,
    pets
  case kitchenHome, seasonal, checkout, other

  var id: Self { self }
  var title: String {
    NSLocalizedString("category.\(key)", value: englishTitle, comment: "Grocery category")
  }

  private var englishTitle: String {
    switch self {
    case .fruitsVegetables: "Fruits & Vegetables"
    case .bakery: "Bakery"
    case .breakfast: "Breakfast"
    case .dairyEggs: "Dairy & Eggs"
    case .cheese: "Cheese"
    case .meatPoultry: "Meat & Poultry"
    case .fishSeafood: "Fish & Seafood"
    case .deliConvenience: "Deli & Convenience"
    case .plantBased: "Plant-Based"
    case .pastaRiceGrains: "Pasta, Rice & Grains"
    case .cannedJarred: "Canned & Jarred"
    case .saucesCondiments: "Sauces & Condiments"
    case .bakingSpices: "Baking & Spices"
    case .international: "International"
    case .snacksSweets: "Snacks & Sweets"
    case .coffeeTea: "Coffee & Tea"
    case .beverages: "Beverages"
    case .alcohol: "Alcohol"
    case .frozenFoods: "Frozen Foods"
    case .householdCleaning: "Household & Cleaning"
    case .paperStorage: "Paper & Storage"
    case .bathroomSupplies: "Bathroom Supplies"
    case .personalCare: "Personal Care"
    case .health: "Health"
    case .baby: "Baby"
    case .pets: "Pets"
    case .kitchenHome: "Kitchen & Home"
    case .seasonal: "Seasonal"
    case .checkout: "Checkout"
    case .other: "Other"
    }
  }

  init?(key: String) {
    guard let category = Self.allCases.first(where: { $0.key == key }) else { return nil }
    self = category
  }

  /// Stable identifier, shared with the Shopping List Server's `category` field.
  var key: String {
    switch self {
    case .fruitsVegetables: "fruitsVegetables"
    case .bakery: "bakery"
    case .breakfast: "breakfast"
    case .dairyEggs: "dairyEggs"
    case .cheese: "cheese"
    case .meatPoultry: "meatPoultry"
    case .fishSeafood: "fishSeafood"
    case .deliConvenience: "deliConvenience"
    case .plantBased: "plantBased"
    case .pastaRiceGrains: "pastaRiceGrains"
    case .cannedJarred: "cannedJarred"
    case .saucesCondiments: "saucesCondiments"
    case .bakingSpices: "bakingSpices"
    case .international: "international"
    case .snacksSweets: "snacksSweets"
    case .coffeeTea: "coffeeTea"
    case .beverages: "beverages"
    case .alcohol: "alcohol"
    case .frozenFoods: "frozenFoods"
    case .householdCleaning: "householdCleaning"
    case .paperStorage: "paperStorage"
    case .bathroomSupplies: "bathroomSupplies"
    case .personalCare: "personalCare"
    case .health: "health"
    case .baby: "baby"
    case .pets: "pets"
    case .kitchenHome: "kitchenHome"
    case .seasonal: "seasonal"
    case .checkout: "checkout"
    case .other: "other"
    }
  }
}

enum GroceryCategoryCatalog {
  private struct Alias {
    let phrase: String
    let category: GroceryCategory
  }

  /// Corrections for provider records that have been manually verified but contain no usable
  /// category or packaging metadata. Keep these narrow: product names alone may be ambiguous.
  private static let barcodeCategoryCorrections: [String: GroceryCategory] = [
    "8002510020006": .cannedJarred
  ]

  /// Categorizing an icon first makes every one of the icon catalog's multilingual aliases
  /// automatically resolve to the same category (for example Apple, Apfel, pomme and maçã).
  private static let iconCategories: [String: GroceryCategory] = [
    "apple": .fruitsVegetables, "avocado": .fruitsVegetables, "banana": .fruitsVegetables,
    "bell_pepper": .fruitsVegetables, "broccoli": .fruitsVegetables, "cabbage": .fruitsVegetables,
    "carrot": .fruitsVegetables, "cauliflower": .fruitsVegetables,
    "chili_pepper": .fruitsVegetables,
    "corn": .fruitsVegetables, "cucumber": .fruitsVegetables, "garlic": .fruitsVegetables,
    "grape": .fruitsVegetables, "green_beans": .fruitsVegetables, "lemon": .fruitsVegetables,
    "lettuce": .fruitsVegetables, "mango": .fruitsVegetables, "mushroom": .fruitsVegetables,
    "onion": .fruitsVegetables, "orange": .fruitsVegetables, "pineapple": .fruitsVegetables,
    "potato": .fruitsVegetables, "spinach": .fruitsVegetables, "strawberry": .fruitsVegetables,
    "tomato": .fruitsVegetables, "watermelon": .fruitsVegetables, "zucchini": .fruitsVegetables,
    "cornbread": .bakery, "pancakes": .breakfast, "waffles": .breakfast, "honey": .breakfast,
    "milk": .dairyEggs, "cream": .dairyEggs, "butter": .dairyEggs, "eggs": .dairyEggs,
    "yogurt": .dairyEggs, "cheddar": .cheese,
    "beef": .meatPoultry, "chicken": .meatPoultry, "pork": .meatPoultry,
    "bacon": .meatPoultry, "sausage": .meatPoultry, "ham": .deliConvenience,
    "salmon": .fishSeafood, "shrimp": .fishSeafood, "tuna": .fishSeafood, "sushi": .international,
    "hamburger": .deliConvenience, "pizza": .deliConvenience,
    "almond_milk": .plantBased, "oat_milk": .plantBased,
    "pasta": .pastaRiceGrains, "rice": .pastaRiceGrains,
    "black_beans": .cannedJarred, "chickpeas": .cannedJarred, "lentils": .cannedJarred,
    "olive_oil": .saucesCondiments, "flour": .bakingSpices, "salt": .bakingSpices,
    "sugar": .bakingSpices, "chocolate_chips": .bakingSpices,
    "peanuts": .snacksSweets, "coffee": .coffeeTea, "tea": .coffeeTea,
    "apple_juice": .beverages, "orange_juice": .beverages, "lemonade": .beverages,
    "smoothie": .beverages, "sparkling_water": .beverages, "still_water": .beverages,
    "club_soda": .beverages, "energy_drink": .beverages, "water_bottle": .beverages,
    "beer": .alcohol, "wine": .alcohol, "french_fries": .frozenFoods,
    "paper_towel_holder": .paperStorage, "blender": .kitchenHome, "bowl": .kitchenHome,
    "can_opener": .kitchenHome, "chef_knife": .kitchenHome, "cutting_board": .kitchenHome,
    "electric_kettle": .kitchenHome, "food_storage_container": .paperStorage,
    "fork": .kitchenHome, "frying_pan": .kitchenHome, "grater": .kitchenHome,
    "mug": .kitchenHome, "pot": .kitchenHome, "spoon": .kitchenHome,
    "toaster": .kitchenHome, "whisk": .kitchenHome,
  ]

  // English, German, French, Italian and Portuguese (including common Swiss terms).
  private static let vocabulary: [(GroceryCategory, [String])] = [
    (
      .fruitsVegetables,
      [
        "fruit", "fruits", "vegetable", "vegetables", "produce", "salad", "herbs", "berries",
        "pear", "pears", "peach", "peaches", "apricot", "cherry", "cherries", "plum", "kiwi",
        "lime", "celery", "leek", "radish", "beetroot", "pumpkin", "aubergine", "eggplant",
        "sweet potato", "sprouts", "parsley", "basil", "mint", "ginger", "frucht", "fruchte",
        "obst", "gemuse", "salat", "krauter", "beeren", "birne", "pfirsich", "aprikose", "kirsche",
        "zwetschge", "lauch", "rettich", "rote bete", "kurbis", "aubergine", "susskartoffel",
        "sprossen", "petersilie", "ingwer", "legume", "legumes", "fruit frais", "fruits frais",
        "salade", "herbes", "baies", "poire", "peche", "abricot", "cerise", "prune", "celeri",
        "poireau", "radis", "betterave", "courge", "patate douce", "persil", "menthe", "gingembre",
        "frutta", "verdura", "verdure", "insalata", "erbe", "bacche", "pera", "pesca", "albicocca",
        "ciliegia", "prugna", "sedano", "porro", "ravanello", "barbabietola", "zucca", "melanzana",
        "patata dolce", "prezzemolo", "zenzero", "fruta", "frutas", "vegetal", "vegetais",
        "legume fresco", "salada", "ervas", "bagas", "pera", "pessego", "damasco", "cereja",
        "ameixa", "aipo", "alho poro", "rabanete", "beterraba", "abobora", "batata doce", "salsa",
        "gengibre",
      ]
    ),
    (
      .bakery,
      [
        "bread", "breads", "roll", "rolls", "bun", "baguette", "croissant", "toast bread",
        "sourdough", "pretzel", "pastry", "pastries", "cake", "tortilla", "wraps", "brot", "brote",
        "brotchen", "wegge", "gipfeli", "zopf", "baguette", "sauerteigbrot", "brezel", "geback",
        "kuchen", "pain", "pains", "petit pain", "croissant", "pain de mie", "pain au levain",
        "bretzel", "patisserie", "gateau", "pane", "panini", "rosetta", "cornetto", "pane tostato",
        "lievito madre", "grissini", "pasticceria", "torta", "pao", "paes", "paozinho", "baguete",
        "croissant", "pao de forma", "massa azeda", "pretzel", "pastelaria", "bolo",
      ]
    ),
    (
      .breakfast,
      [
        "breakfast", "cereal", "cereals", "muesli", "granola", "oats", "porridge", "cornflakes",
        "jam", "marmalade", "spread", "breakfast bar", "fruhstuck", "musli", "haferflocken",
        "konfiture", "marmelade", "brotaufstrich", "petit dejeuner", "cereales", "muesli",
        "flocons d avoine", "confiture", "tartinade", "colazione", "cereali", "muesli",
        "fiocchi d avena", "marmellata", "crema spalmabile", "pequeno almoco", "cereais", "aveia",
        "mingau", "geleia", "compota",
      ]
    ),
    (
      .dairyEggs,
      [
        "dairy", "quark", "cottage cheese", "creme fraiche", "sour cream", "buttermilk", "kefir",
        "condensed milk", "lactose free milk", "milchprodukt", "quark", "huttankase", "sauerrahm",
        "buttermilch", "kondensmilch", "laitier", "fromage blanc", "creme fraiche", "creme aigre",
        "babeurre", "lait concentre", "latticini", "ricotta", "panna acida", "latticello",
        "latte condensato", "laticinios", "requeijao", "natas", "leitelho", "leite condensado",
      ]
    ),
    (
      .cheese,
      [
        "cheese", "cheeses", "mozzarella", "parmesan", "gouda", "emmental", "gruyere", "feta",
        "brie", "camembert", "raclette", "fondue cheese", "kase", "hartkase", "weichkase",
        "frischkase", "fromage", "fromages", "formaggio", "formaggi", "queijo", "queijos",
      ]
    ),
    (
      .meatPoultry,
      [
        "meat", "poultry", "veal", "lamb", "turkey", "duck", "minced meat", "ground beef", "steak",
        "cutlet", "roast", "ribs", "meatballs", "fleisch", "geflugel", "kalb", "lamm", "truthahn",
        "pute", "ente", "hackfleisch", "steak", "schnitzel", "braten", "hackballchen", "viande",
        "volaille", "veau", "agneau", "dinde", "canard", "viande hachee", "escalope", "roti",
        "boulette", "carne", "pollame", "vitello", "agnello", "tacchino", "anatra",
        "carne macinata", "bistecca", "cotoletta", "arrosto", "polpetta", "carne bovina", "aves",
        "vitela", "cordeiro", "peru", "pato", "carne picada", "bife", "costeleta", "assado",
        "almondega",
      ]
    ),
    (
      .fishSeafood,
      [
        "fish", "seafood", "cod", "trout", "sardines", "mackerel", "mussels", "oysters", "squid",
        "octopus", "crab", "lobster", "fisch", "meeresfruchte", "kabeljau", "forelle", "sardinen",
        "makrele", "muscheln", "tintenfisch", "krabbe", "hummer", "poisson", "fruits de mer",
        "cabillaud", "truite", "sardine", "maquereau", "moule", "huitre", "calamar", "poulpe",
        "crabe", "homard", "pesce", "frutti di mare", "merluzzo", "trota", "sardina", "sgombro",
        "cozze", "ostriche", "calamaro", "polpo", "granchio", "aragosta", "peixe", "marisco",
        "bacalhau", "truta", "sardinha", "cavala", "mexilhao", "ostra", "lula", "polvo",
        "caranguejo", "lagosta",
      ]
    ),
    (
      .deliConvenience,
      [
        "deli", "ready meal", "ready meals", "sandwich", "sandwiches", "prepared salad", "takeaway",
        "charcuterie", "cold cuts", "salami", "mortadella", "instant meal", "fertiggericht",
        "sandwich", "aufschnitt", "salami", "convenience", "plat prepare", "plats prepares",
        "sandwich", "charcuterie", "repas minute", "piatto pronto", "piatti pronti", "panino",
        "affettati", "salame", "refeicao pronta", "comida pronta", "sanduiche", "frios", "salame",
      ]
    ),
    (
      .plantBased,
      [
        "plant based", "vegan", "vegetarian", "tofu", "tempeh", "seitan", "meat substitute",
        "veggie burger", "soy milk", "coconut milk", "pflanzlich", "vegan", "vegetarisch",
        "fleischersatz", "sojamilch", "kokosmilch", "vegetal", "vegane", "vegetarien",
        "substitut de viande", "lait de soja", "lait de coco", "vegano", "vegetariano",
        "sostituto della carne", "latte di soia", "latte di cocco", "a base de plantas", "vegano",
        "vegetariano", "substituto de carne", "leite de soja", "leite de coco",
      ]
    ),
    (
      .pastaRiceGrains,
      [
        "noodles", "spaghetti", "penne", "couscous", "quinoa", "barley", "polenta", "bulgur",
        "grain", "grains", "nudeln", "spaghetti", "couscous", "quinoa", "gerste", "polenta",
        "bulgur", "getreide", "nouilles", "pates", "couscous", "quinoa", "orge", "polenta",
        "boulgour", "cereale", "cereali", "tagliatelle", "pasta secca", "couscous", "orzo",
        "polenta", "bulgur", "massa", "massas", "macarrao", "cuscuz", "quinoa", "cevada", "polenta",
        "bulgur", "graos",
      ]
    ),
    (
      .cannedJarred,
      [
        "canned", "tin", "tinned", "jarred", "preserves", "pickles", "olives", "capers",
        "tomato puree", "coconut milk can", "dose", "konserve", "eingelegt", "essiggurken",
        "oliven", "kapern", "tomatenpuree", "boite de conserve", "conserve", "cornichons", "olives",
        "capres", "puree de tomate", "scatola", "conserva", "sottaceti", "olive", "capperi",
        "passata", "enlatado", "conserva", "picles", "azeitonas", "alcaparras", "polpa de tomate",
      ]
    ),
    (
      .saucesCondiments,
      [
        "sauce", "sauces", "ketchup", "mustard", "mayonnaise", "vinegar", "salad dressing",
        "soy sauce", "hot sauce", "pesto", "stock cube", "broth", "sosse", "ketchup", "senf",
        "mayonnaise", "essig", "salatsauce", "sojasauce", "bruhwurfel", "bouillon", "sauce",
        "moutarde", "mayonnaise", "vinaigre", "vinaigrette", "sauce soja", "pesto", "bouillon cube",
        "salsa", "ketchup", "senape", "maionese", "aceto", "condimento", "salsa di soia", "dado",
        "molho", "ketchup", "mostarda", "maionese", "vinagre", "tempero", "molho de soja", "caldo",
      ]
    ),
    (
      .bakingSpices,
      [
        "baking", "baking powder", "yeast", "vanilla", "cocoa", "cinnamon", "pepper", "paprika",
        "curry", "spice", "spices", "seasoning", "backen", "backpulver", "hefe", "vanille", "kakao",
        "zimt", "pfeffer", "gewurz", "gewurze", "wurzmittel", "patisserie maison", "levure",
        "vanille", "cacao", "cannelle", "poivre", "epice", "epices", "assaisonnement", "lievito",
        "vaniglia", "cacao", "cannella", "pepe", "spezie", "condimento", "fermento", "baunilha",
        "cacau", "canela", "pimenta", "especiaria", "especiarias", "psyllium", "psyllium husk",
        "psyllium husks", "flea seed husk", "flohsamen", "flohsamenschalen", "plantago husk",
        "teguments de psyllium", "graines de psyllium", "teguments de graines de psyllium",
        "bucce di psillio", "semi di psillio", "casca de psyllium", "cascas de psyllium",
        "sementes de psyllium",
      ]
    ),
    (
      .international,
      [
        "asian", "mexican", "indian", "thai", "japanese", "middle eastern", "hummus", "falafel",
        "taco", "nachos", "ramen", "curry paste", "wasabi", "asiatisch", "mexikanisch", "indisch",
        "thailandisch", "japanisch", "hummus", "falafel", "taco", "ramen", "currypaste",
        "asiatique", "mexicain", "indien", "thai", "japonais", "houmous", "asiatico", "messicano",
        "indiano", "thailandese", "giapponese", "asiatico", "mexicano", "indiano", "tailandes",
        "japones",
      ]
    ),
    (
      .snacksSweets,
      [
        "snack", "snacks", "crisps", "chips", "popcorn", "cracker", "biscuits", "cookies",
        "chocolate", "candy", "sweets", "gum", "ice cream cone", "nusse", "snack", "chips",
        "popcorn", "cracker", "kekse", "schokolade", "sussigkeiten", "kaugummi", "snack", "chips",
        "popcorn", "cracker", "biscuits", "chocolat", "bonbons", "chewing gum", "spuntino",
        "patatine", "popcorn", "cracker", "biscotti", "cioccolato", "caramelle", "gomma", "lanche",
        "batata chips", "pipoca", "biscoitos", "chocolate", "doces", "chiclete",
      ]
    ),
    (
      .coffeeTea,
      [
        "espresso", "coffee beans", "ground coffee", "coffee capsules", "herbal tea", "green tea",
        "black tea", "kaffee", "kaffeebohnen", "kaffeekapseln", "krautertee", "gruner tee",
        "schwarztee", "cafe moulu", "grains de cafe", "capsules de cafe", "tisane", "the vert",
        "the noir", "caffe", "chicchi di caffe", "capsule caffe", "tisana", "te verde", "te nero",
        "cafe moido", "graos de cafe", "capsulas de cafe", "cha de ervas", "cha verde", "cha preto",
      ]
    ),
    (
      .beverages,
      [
        "drink", "drinks", "juice", "soft drink", "mineral water", "syrup", "iced tea",
        "sports drink", "getrank", "getranke", "saft", "softdrink", "mineralwasser", "sirup",
        "eistee", "boisson", "boissons", "jus", "soda", "eau minerale", "sirop", "the glace",
        "bevanda", "bevande", "succo", "bibita", "acqua minerale", "sciroppo", "te freddo",
        "bebida", "bebidas", "suco", "refrigerante", "agua mineral", "xarope", "cha gelado",
      ]
    ),
    (
      .alcohol,
      [
        "alcohol", "spirits", "prosecco", "champagne", "cider", "gin", "vodka", "rum", "whisky",
        "liqueur", "aperitif", "alkohol", "schnaps", "sekt", "champagner", "apfelwein", "likor",
        "alcool", "spiritueux", "cidre", "liqueur", "aperitif", "alcol", "liquori", "spumante",
        "sidro", "aperitivo", "alcool", "destilados", "espumante", "sidra", "licor", "aperitivo",
      ]
    ),
    (
      .frozenFoods,
      [
        "frozen", "frozen food", "ice cream", "sorbet", "frozen vegetables", "frozen pizza",
        "frozen fish", "tiefkuhl", "tiefkuhlkost", "glace", "sorbet", "surgeles",
        "legumes surgeles", "pizza surgelee", "congelato", "surgelati", "verdure surgelate",
        "pizza surgelata", "congelado", "congelados", "sorvete", "legumes congelados",
        "pizza congelada",
      ]
    ),
    (
      .householdCleaning,
      [
        "cleaning", "detergent", "dishwasher", "dish soap", "laundry", "fabric softener", "bleach",
        "surface cleaner", "glass cleaner", "sponges", "rubber gloves", "bin bags", "trash bags",
        "reinigung", "waschmittel", "spulmittel", "geschirrspuler", "weichspuler", "bleiche",
        "allzweckreiniger", "glasreiniger", "schwamm", "kehrichtsack", "nettoyage", "detergent",
        "liquide vaisselle", "lessive", "adoucissant", "eau de javel", "nettoyant", "eponge",
        "sac poubelle", "pulizia", "detersivo", "lavastoviglie", "bucato", "ammorbidente",
        "candeggina", "detergente vetri", "spugna", "sacco spazzatura", "limpeza", "detergente",
        "lava loucas", "sabao em po", "amaciante", "lixivia", "limpa vidros", "esponja",
        "saco do lixo",
      ]
    ),
    (
      .paperStorage,
      [
        "kitchen paper", "kitchen roll", "paper towel", "paper towels", "facial tissues",
        "tissue box", "tissues", "napkin", "napkins", "aluminum foil", "aluminium foil",
        "cling film", "plastic wrap", "food wrap", "baking paper", "parchment paper",
        "freezer bag", "freezer bags", "storage bag", "storage bags", "zip bags", "sandwich bags",
        "kuchenpapier", "kuchenrolle", "haushaltsrolle", "haushaltspapier", "papiertaschentucher",
        "taschentucher", "serviette", "servietten", "alufolie", "aluminiumfolie",
        "frischhaltefolie", "backpapier", "butterbrotpapier", "gefrierbeutel", "zip beutel",
        "aufbewahrungsbeutel", "essuie tout", "papier menage", "mouchoir", "mouchoirs",
        "serviette en papier", "serviettes", "papier aluminium", "film alimentaire",
        "papier cuisson", "papier sulfurise", "sac congelation", "sacs congelation",
        "sac conservation", "carta cucina", "rotolo cucina", "fazzoletto", "fazzoletti",
        "tovagliolo", "tovaglioli",
        "foglio alluminio", "carta alluminio", "pellicola alimentare", "pellicola",
        "carta forno", "sacchetto freezer", "sacchetti freezer", "sacchetti alimenti",
        "papel toalha", "rolo de cozinha", "lenco de papel", "lencos", "guardanapo", "guardanapos",
        "papel aluminio", "pelicula aderente", "pelicula alimentar", "papel vegetal",
        "papel manteiga", "saco de congelacao", "sacos congelacao", "saco para alimentos",
      ]
    ),
    (
      .bathroomSupplies,
      [
        "toilet paper", "toiletpaper", "bathroom tissue", "loo roll", "toilet roll", "wc paper",
        "bathroom supplies", "toilet brush", "toilet cleaner", "toilet block", "toilet wipes",
        "wc papier", "wc rollen", "wc rolle", "klopapier", "toilettenpapier", "toiletten papier",
        "badbedarf", "toilettenburste", "wc reiniger", "toilettenreiniger", "wc stein",
        "papier toilette", "papier wc", "papier hygienique", "rouleau toilette",
        "articles salle de bain", "brosse wc", "nettoyant wc", "bloc wc",
        "carta igienica", "carta wc", "rotolo carta igienica", "articoli bagno",
        "scopino wc", "detergente wc", "tavoletta wc",
        "papel higienico", "papel de banheiro", "rolo de papel higienico", "artigos de banheiro",
        "escova sanitaria", "limpa sanita", "limpa vaso sanitario", "bloco sanitario",
      ]
    ),
    (
      .personalCare,
      [
        "personal care", "shampoo", "conditioner", "shower gel", "soap", "deodorant", "toothpaste",
        "toothbrush", "razor", "shaving foam", "sanitary pads", "tampons", "skin care",
        "body lotion", "pflege", "korperpflege", "duschgel", "seife", "deo", "zahnpasta",
        "zahnburste", "rasierer", "rasierschaum", "binden", "tampons", "hautpflege", "korperlotion",
        "soins personnels", "shampooing", "apres shampoing", "gel douche", "savon", "dentifrice",
        "brosse a dents", "rasoir", "mousse a raser", "serviettes hygieniques", "soin visage",
        "cura personale", "shampoo", "balsamo", "bagnoschiuma", "sapone", "dentifricio",
        "spazzolino", "rasoio", "schiuma da barba", "assorbenti", "cura della pelle",
        "cuidados pessoais", "xampu", "condicionador", "gel de banho", "sabonete", "desodorante",
        "pasta de dentes", "escova de dentes", "barbeador", "espuma de barbear", "absorventes",
        "cuidados da pele",
      ]
    ),
    (
      .health,
      [
        "health", "medicine", "medication", "vitamins", "supplements", "painkiller", "bandage",
        "plaster", "disinfectant", "thermometer", "first aid", "gesundheit", "medikament",
        "vitamine", "nahrungserganzung", "schmerzmittel", "verband", "pflaster",
        "desinfektionsmittel", "sante", "medicament", "vitamines", "complement alimentaire",
        "antidouleur", "pansement", "desinfectant", "salute", "medicina", "farmaco", "vitamine",
        "integratore", "antidolorifico", "cerotto", "disinfettante", "saude", "medicamento",
        "vitaminas", "suplemento", "analgesico", "curativo", "desinfetante",
      ]
    ),
    (
      .baby,
      [
        "baby", "baby food", "formula", "nappies", "diapers", "baby wipes", "baby shampoo",
        "pacifier", "bottle", "windeln", "babynahrung", "milchpulver", "feuchttucher", "schnuller",
        "babyflasche", "bebe", "alimentation bebe", "lait infantile", "couches", "lingettes bebe",
        "tetine", "biberon", "neonato", "pappa", "latte in polvere", "pannolini", "salviette",
        "ciuccio", "biberon", "bebe", "comida de bebe", "formula infantil", "fraldas",
        "lencos umidos", "chupeta", "mamadeira",
      ]
    ),
    (
      .pets,
      [
        "pet", "pets", "dog food", "cat food", "pet food", "dog treats", "cat litter", "bird seed",
        "tierbedarf", "hundefutter", "katzenfutter", "tierfutter", "hundesnacks", "katzenstreu",
        "vogelfutter", "animalerie", "croquettes chien", "croquettes chat", "nourriture animaux",
        "friandises chien", "litiere chat", "graines oiseaux", "animali", "cibo cane", "cibo gatto",
        "cibo animali", "premi cane", "lettiera gatto", "semi uccelli", "animais",
        "comida de cachorro", "comida de gato", "racao", "petiscos", "areia de gato",
        "sementes para passaros",
      ]
    ),
    (
      .kitchenHome,
      [
        "kitchen", "homeware", "light bulb", "battery", "batteries", "candle", "matches", "lighter",
        "cookware", "tableware", "dish", "plate", "glass", "kuche", "haushalt", "gluhbirne",
        "batterie", "batterien", "kerze", "streichholzer", "feuerzeug", "geschirr", "teller",
        "glas", "cuisine", "maison", "ampoule", "pile", "piles", "bougie", "allumettes", "briquet",
        "vaisselle", "assiette", "verre", "cucina", "casa", "lampadina", "batteria", "batterie",
        "candela", "fiammiferi", "accendino", "stoviglie", "piatto", "bicchiere", "cozinha", "casa",
        "lampada", "pilha", "pilhas", "vela", "fosforos", "isqueiro", "louca", "prato", "copo",
      ]
    ),
    (
      .seasonal,
      [
        "seasonal", "christmas", "easter", "halloween", "advent", "barbecue", "bbq", "picnic",
        "gift wrap", "saisonal", "weihnachten", "ostern", "advent", "grill", "picknick",
        "geschenkpapier", "saisonnier", "noel", "paques", "barbecue", "pique nique",
        "papier cadeau", "stagionale", "natale", "pasqua", "grigliata", "picnic", "carta regalo",
        "sazonal", "natal", "pascoa", "churrasco", "piquenique", "papel de presente",
      ]
    ),
    (
      .checkout,
      [
        "checkout", "chewing gum", "mint", "mints", "magazine", "newspaper", "lottery", "gift card",
        "kasse", "kaugummi", "bonbon", "zeitschrift", "zeitung", "lotterie", "geschenkkarte",
        "caisse", "chewing gum", "pastilles", "magazine", "journal", "loterie", "carte cadeau",
        "cassa", "gomma da masticare", "mentine", "rivista", "giornale", "lotteria", "buono regalo",
        "caixa", "chiclete", "pastilha", "revista", "jornal", "loteria", "cartao presente",
      ]
    ),
  ]

  private static let aliases: [Alias] = vocabulary.flatMap { category, phrases in
    phrases.map { Alias(phrase: normalize($0), category: category) }
  }.sorted { $0.phrase.count > $1.phrase.count }

  static func category(for label: String) -> GroceryCategory {
    let normalized = normalize(label)
    guard !normalized.isEmpty else { return .other }
    let padded = " \(normalized) "
    if let category = aliases.first(where: { padded.contains(" \($0.phrase) ") })?.category {
      return category
    }
    // Retail labels frequently omit spaces in compounds (Toiletpaper, Kitchenroll, WC-Papier).
    // Only compact multi-word aliases to avoid substring false positives such as rice/licorice.
    let compact = normalized.replacingOccurrences(of: " ", with: "")
    if let category = aliases.first(where: {
      $0.phrase.contains(" ")
        && compact.contains($0.phrase.replacingOccurrences(of: " ", with: ""))
    })?.category {
      return category
    }
    if let category = fuzzyCategory(for: normalized) {
      return category
    }
    if let icon = GroceryIconCatalog.imageName(for: label), let category = iconCategories[icon] {
      return category
    }
    return .other
  }

  static func category(for item: ShoppingItem) -> GroceryCategory {
    if let barcode = item.barcode?.filter(\.isNumber),
      let corrected = barcodeCategoryCorrections[barcode]
    {
      return corrected
    }
    if let hints = item.categoryHints, !hints.isEmpty {
      let normalizedHints = hints.map(normalize).filter {
        !ignoredProviderTags.contains($0)
      }
      let metadata = normalizedHints.joined(separator: " ")
      switch item.productType?.lowercased() {
      case "beauty": return .personalCare
      case "petfood", "pet-food": return .pets
      default: break
      }
      let isNonAlcoholic = metadata.contains("non alcoholic") || metadata.contains("alcohol free")
      if isNonAlcoholic { return .beverages }
      for rule in providerRules where containsAny(metadata, rule.terms) {
        return rule.category
      }
      for hint in normalizedHints.reversed() {
        let metadataCategory = category(for: hint)
        if metadataCategory != .other { return metadataCategory }
      }
    }
    if let key = item.providerCategory, let provided = GroceryCategory(key: key),
      provided != .other
    {
      return provided
    }
    return category(for: item.label)
  }

  private static func containsAny(_ value: String, _ terms: [String]) -> Bool {
    terms.contains(where: value.contains)
  }

  private static let ignoredProviderTags: Set<String> = [
    "en foods", "foods", "en groceries", "groceries",
    "en foods and beverages", "foods and beverages",
    "en beverages and beverages preparations", "beverages and beverages preparations",
    "en plant based foods", "plant based foods",
    "en plant based foods and beverages", "plant based foods and beverages",
    "en fruits and vegetables based foods", "fruits and vegetables based foods",
    "en vegetable based foods and beverages", "vegetable based foods and beverages",
    "en vegetables based foods", "vegetables based foods",
  ]

  /// Ordered from specific families to broad families. Open Food Facts category tags include
  /// parent nodes, so a specific match must win over generic parents such as beverages.
  private static let providerRules: [(category: GroceryCategory, terms: [String])] = [
    (.baby, ["baby food", "infant food", "infant formula", "follow on milk"]),
    (.coffeeTea, ["coffee", "coffees", "tea", "teas", "herbal tea", "infusion"]),
    (
      .alcohol,
      ["alcoholic beverage", "beer", "beers", "wine", "wines", "spirit", "liqueur", "cider"]
    ),
    (.beverages, ["juice", "soft drink", "soda", "water", "lemonade", "limonade", "nectar"]),
    (.frozenFoods, ["frozen food", "frozen foods", "frozen meal", "ice cream", "sorbet"]),
    (.cheese, ["cheese", "cheeses", "fromage", "formaggio", "queijo"]),
    (.fishSeafood, ["fish", "fishes", "seafood", "crustacean", "mollusc", "shellfish"]),
    (
      .meatPoultry,
      ["meat", "meats", "poultry", "beef", "pork", "veal", "lamb", "chicken", "turkey"]
    ),
    (
      .dairyEggs,
      [
        "dairy", "milk product", "fermented milk", "yogurt", "yoghurt", "egg", "eggs", "butter",
        "cream",
      ]
    ),
    (
      .bakery,
      ["bread", "breads", "bakery", "pastry", "pastries", "viennoiserie", "rolls", "baguette"]
    ),
    (
      .breakfast,
      [
        "breakfast", "cereal", "cereals", "muesli", "granola", "porridge", "oat flakes", "jam",
        "marmalade",
      ]
    ),
    (.cannedJarred, ["canned", "preserved food", "pickled", "in brine", "in oil", "jarred"]),
    (
      .saucesCondiments,
      ["sauce", "condiment", "dressing", "mustard", "mayonnaise", "ketchup", "vinegar", "pesto"]
    ),
    (
      .fruitsVegetables,
      ["fruit", "fruits", "vegetable", "vegetables", "legume", "mushroom", "fresh herb", "salad"]
    ),
    (
      .pastaRiceGrains,
      ["pasta", "noodle", "rice", "grain", "grains", "couscous", "quinoa", "bulgur", "polenta"]
    ),
    (
      .bakingSpices,
      [
        "baking", "cooking helper", "spice", "spices", "seasoning", "flour", "yeast", "psyllium",
        "sugar", "salt",
      ]
    ),
    (
      .snacksSweets,
      [
        "snack", "snacks", "sweet", "sweets", "confectionery", "chocolate", "candy", "biscuit",
        "cookie", "chips", "crisps",
      ]
    ),
    (
      .deliConvenience,
      ["prepared meal", "ready meal", "sandwich", "pizza", "deli", "charcuterie", "instant meal"]
    ),
    (
      .plantBased,
      [
        "meat analogue", "meat substitute", "plant based milk", "vegan cheese", "tofu", "tempeh",
        "seitan",
      ]
    ),
    (.beverages, ["beverage", "beverages", "drink", "drinks"]),
  ]

  private static func fuzzyCategory(for normalized: String) -> GroceryCategory? {
    let words = normalized.split(separator: " ").map(String.init)
    for alias in aliases where alias.phrase.count >= 6 {
      let aliasWords = alias.phrase.split(separator: " ").map(String.init)
      guard aliasWords.count <= words.count else { continue }
      for start in 0...(words.count - aliasWords.count) {
        let candidate = words[start..<(start + aliasWords.count)].joined(separator: " ")
        let limit = typoLimit(for: max(candidate.count, alias.phrase.count))
        guard abs(candidate.count - alias.phrase.count) <= limit else { continue }
        if editDistance(candidate, alias.phrase, stoppingAfter: limit) <= limit {
          return alias.category
        }
      }
    }
    return nil
  }

  private static func typoLimit(for length: Int) -> Int {
    if length >= 9 { return 2 }
    if length >= 6 { return 1 }
    return 0
  }

  /// A bounded Levenshtein distance keeps fuzzy lookup inexpensive during list rendering.
  private static func editDistance(_ lhs: String, _ rhs: String, stoppingAfter limit: Int) -> Int {
    let left = Array(lhs)
    let right = Array(rhs)
    var previous = Array(0...right.count)
    for (leftIndex, leftCharacter) in left.enumerated() {
      var current = [leftIndex + 1] + Array(repeating: 0, count: right.count)
      var rowMinimum = current[0]
      for (rightIndex, rightCharacter) in right.enumerated() {
        current[rightIndex + 1] = min(
          current[rightIndex] + 1,
          previous[rightIndex + 1] + 1,
          previous[rightIndex] + (leftCharacter == rightCharacter ? 0 : 1)
        )
        rowMinimum = min(rowMinimum, current[rightIndex + 1])
      }
      if rowMinimum > limit { return limit + 1 }
      previous = current
    }
    return previous[right.count]
  }

  private static func normalize(_ value: String) -> String {
    let folded = value.folding(
      options: [.diacriticInsensitive, .caseInsensitive], locale: .current
    )
    .lowercased()
    let characters = folded.unicodeScalars.map { scalar -> Character in
      let value = scalar.value
      return (value >= 97 && value <= 122) || (value >= 48 && value <= 57)
        ? Character(String(scalar)) : " "
    }
    return String(characters).split(whereSeparator: { $0 == " " }).joined(separator: " ")
  }
}
