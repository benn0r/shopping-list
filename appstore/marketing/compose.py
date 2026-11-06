"""Composes the App Store header and search-results artwork.

Backgrounds in source/ were generated with OpenAI gpt-image-2 (prompts in ../README.md); the icon,
text and the phone with a real app screenshot are drawn here so they stay crisp and show the real
app. Run with a Python that has Pillow:  python compose.py [languages…]
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
FONT = "/System/Library/Fonts/SFNS.ttf"
ICON = ROOT / "ShoppingListApp/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
SCREENSHOTS = ROOT / "screenshots/appstore"  # scripts/screenshots.sh

# language: (header title, header line, search title, search lines)
TEXT = {
    "en": (
        "Tell your AI.\nIt's on the list.",
        "Your AI assistant adds items via MCP.\nScan barcodes, shop by aisle.",
        "Tell your AI.\nIt's on the list.",
        "Works with AI assistants via MCP.\nScan barcodes, shop by aisle.",
    ),
    "de": (
        "Sag es deiner KI.\nSchon auf der Liste.",
        "Dein KI-Assistent setzt Artikel per MCP auf die Liste.\nBarcodes scannen, nach Regal einkaufen.",
        "Sag es deiner KI.\nSchon auf der Liste.",
        "Funktioniert mit KI-Assistenten per MCP.\nBarcodes scannen, nach Regal einkaufen.",
    ),
    "fr": (
        "Dites-le à votre IA.\nC'est sur la liste.",
        "Votre assistant IA ajoute des articles via MCP.\nScannez les codes-barres, faites vos courses par rayon.",
        "Dites-le à votre IA.\nC'est sur la liste.",
        "Compatible avec les assistants IA via MCP.\nScannez, puis faites vos courses par rayon.",
    ),
    "it": (
        "Dillo alla tua IA.\nÈ già in lista.",
        "Il tuo assistente IA aggiunge articoli tramite MCP.\nScansiona i codici, fai la spesa per corsia.",
        "Dillo alla tua IA.\nÈ già in lista.",
        "Funziona con gli assistenti IA tramite MCP.\nScansiona i codici, spesa per corsia.",
    ),
    "es": (
        "Díselo a tu IA.\nYa está en la lista.",
        "Tu asistente de IA añade artículos mediante MCP.\nEscanea códigos, compra por pasillo.",
        "Díselo a tu IA.\nYa está en la lista.",
        "Funciona con asistentes de IA mediante MCP.\nEscanea códigos, compra por pasillo.",
    ),
    "pt": (
        "Diga à sua IA.\nJá está na lista.",
        "O seu assistente de IA adiciona artigos via MCP.\nLeia códigos de barras, compre por corredor.",
        "Diga à sua IA.\nJá está na lista.",
        "Funciona com assistentes de IA via MCP.\nLeia códigos, compre por corredor.",
    ),
    "pt-BR": (
        "Fale para sua IA.\nJá está na lista.",
        "Seu assistente de IA adiciona itens via MCP.\nEscaneie códigos de barras, compre por corredor.",
        "Fale para sua IA.\nJá está na lista.",
        "Funciona com assistentes de IA via MCP.\nEscaneie códigos, compre por corredor.",
    ),
    "nl": (
        "Zeg het je AI.\nHet staat op de lijst.",
        "Je AI-assistent zet artikelen op je lijst via MCP.\nScan barcodes, winkel per gangpad.",
        "Zeg het je AI.\nHet staat op de lijst.",
        "Werkt met AI-assistenten via MCP.\nScan barcodes, winkel per gangpad.",
    ),
    "da": (
        "Sig det til din AI.\nDet er på listen.",
        "Din AI-assistent tilføjer varer via MCP.\nScan stregkoder, handl efter reol.",
        "Sig det til din AI.\nDet er på listen.",
        "Virker med AI-assistenter via MCP.\nScan stregkoder, handl efter reol.",
    ),
    "sv": (
        "Säg det till din AI.\nDet står på listan.",
        "Din AI-assistent lägger till varor via MCP.\nSkanna streckkoder, handla per gång.",
        "Säg det till din AI.\nDet står på listan.",
        "Fungerar med AI-assistenter via MCP.\nSkanna streckkoder, handla per gång.",
    ),
    "nb": (
        "Si det til AI-en din.\nDet står på listen.",
        "AI-assistenten din legger til varer via MCP.\nSkann strekkoder, handle etter hylle.",
        "Si det til AI-en din.\nDet står på listen.",
        "Fungerer med AI-assistenter via MCP.\nSkann strekkoder, handle etter hylle.",
    ),
    "fi": (
        "Kerro tekoälylle.\nSe on listalla.",
        "Tekoälyavustajasi lisää tuotteita MCP:n kautta.\nSkannaa viivakoodit, osta hylly kerrallaan.",
        "Kerro tekoälylle.\nSe on listalla.",
        "Toimii tekoälyavustajien kanssa MCP:llä.\nSkannaa koodit, osta hylly kerrallaan.",
    ),
    "pl": (
        "Powiedz swojej AI.\nJuż jest na liście.",
        "Twój asystent AI dodaje produkty przez MCP.\nSkanuj kody, rób zakupy według alejek.",
        "Powiedz swojej AI.\nJuż jest na liście.",
        "Działa z asystentami AI przez MCP.\nSkanuj kody, kupuj według alejek.",
    ),
    "ja": (
        "AIに伝えるだけ。\nもうリストに。",
        "AIアシスタントがMCPで品目を追加。\nバーコードをスキャンして、売り場順に買い物。",
        "AIに伝えるだけ。\nもうリストに。",
        "MCPでAIアシスタントと連携。\nバーコードをスキャン、売り場順に買い物。",
    ),
}
# Dark teal text on the light flat-lay backgrounds.
INK = (5, 66, 60, 255)
SOFT = (40, 92, 86, 255)

JAPANESE = {
    weight: next(Path("/System/Library/Fonts").glob(f"*W{w}.ttc"))
    for weight, w in (("Bold", 6), ("Medium", 3))
}
language = "en"


def font(size: int, weight: str = "Bold") -> ImageFont.FreeTypeFont:
    if language == "ja":
        return ImageFont.truetype(str(JAPANESE[weight]), size)
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def fitted(content: str, size: int, max_width: int, weight: str = "Bold") -> ImageFont.FreeTypeFont:
    """The largest font up to `size` whose widest line fits in `max_width`."""
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    while size > 10:
        f = font(size, weight)
        if probe.multiline_textbbox((0, 0), content, font=f)[2] <= max_width:
            return f
        size -= 2
    return font(size, weight)


def rounded(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *image.size), radius, fill=255)
    out = image.convert("RGBA")
    out.putalpha(mask)
    return out


def shadow(canvas: Image.Image, box, radius: int, blur: int, alpha: int) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius, fill=(4, 60, 52, alpha))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def app_icon(size: int) -> Image.Image:
    """The icon with a thin light rim."""
    radius = round(size * 0.225)
    icon = rounded(Image.open(ICON).resize((size, size), Image.LANCZOS), radius)
    rim = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    ImageDraw.Draw(rim).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius, outline=(255, 255, 255, 110), width=max(2, size // 75)
    )
    icon.alpha_composite(rim)
    return icon


def text(canvas: Image.Image, xy, content: str, f, fill, spacing: int = 0, align: str = "left") -> None:
    ImageDraw.Draw(canvas).multiline_text(xy, content, font=f, fill=fill, spacing=spacing, align=align)


def centered(canvas: Image.Image, center_x: int, y: int, content: str, f, fill, spacing: int = 0) -> int:
    """Draws text centred on `center_x` and returns its bottom edge."""
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    left, top, right, bottom = probe.multiline_textbbox((0, 0), content, font=f, spacing=spacing, align="center")
    text(canvas, (center_x - (right - left) // 2 - left, y), content, f, fill, spacing, "center")
    return y + bottom


def phone(screenshot: Image.Image, height: int) -> Image.Image:
    """A simple black-bezel phone around a real screenshot."""
    shot = screenshot.resize((round(screenshot.width * height / screenshot.height), height), Image.LANCZOS)
    bezel = round(height * 0.022)
    radius = round(height * 0.085)
    body = Image.new("RGBA", (shot.width + 2 * bezel, shot.height + 2 * bezel), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle((0, 0, *body.size), radius, fill=(18, 18, 22, 255))
    body.alpha_composite(rounded(shot, radius - bezel), (bezel, bezel))
    return body


def header(out: Path) -> None:
    """Icon, headline and line centred in the empty middle of the flat lay."""
    title, line, _, _ = TEXT[language]
    canvas = Image.open(HERE / "source/header-bg.png").convert("RGBA").crop((0, 1, 3840, 1647))
    cx = canvas.width // 2
    icon_size = 260
    y = 330
    shadow(canvas, (cx - icon_size // 2, y + 24, cx + icon_size // 2, y + icon_size + 24), 58, 36, 70)
    canvas.alpha_composite(app_icon(icon_size), (cx - icon_size // 2, y))
    bottom = centered(canvas, cx, y + icon_size + 70, title, fitted(title, 150, 1700), INK, spacing=12)
    centered(canvas, cx, bottom + 50, line, fitted(line, 64, 1750, "Medium"), SOFT, spacing=14)
    canvas.convert("RGB").save(out / "header-3840x1646.png", optimize=True)


def search_results(out: Path) -> None:
    """The phone on the left, text on the right (mirrored from Off-hours)."""
    _, _, title, lines = TEXT[language]
    folder = {"en": "", "pt": "pt-PT"}.get(language, language)
    shot = SCREENSHOTS / folder / "1-list.png"
    canvas = Image.open(HERE / "source/search-bg.png").convert("RGBA")
    device = phone(Image.open(shot), 1060)
    dx, dy = 230, (canvas.height - device.height) // 2 + 10
    shadow(canvas, (dx + 20, dy + 40, dx + device.width - 20, dy + device.height + 10), 90, 46, 90)
    canvas.alpha_composite(device, (dx, dy))
    # No icon here: App Store search shows the app's icon next to this image. Title and lines
    # sit above the tote bag in the bottom right (from about y 720).
    x = dx + device.width + 150
    width = canvas.width - x - 110
    title_font = fitted(title, 100, width)
    text(canvas, (x, 300), title, title_font, INK, spacing=8)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bottom = 300 + probe.multiline_textbbox((0, 0), title, font=title_font, spacing=8)[3]
    text(canvas, (x, bottom + 50), lines, fitted(lines, 48, width, "Medium"), SOFT, spacing=14)
    canvas.convert("RGB").save(out / "search-results-1920x1280.png", optimize=True)


if __name__ == "__main__":
    for name in sys.argv[1:] or TEXT:
        language = name
        # App Store Connect calls Portugal's Portuguese pt-PT; the app's localization is pt.
        out = HERE if name == "en" else HERE / {"pt": "pt-PT"}.get(name, name)
        out.mkdir(exist_ok=True)
        header(out)
        search_results(out)
        print(out)
