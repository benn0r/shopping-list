# App Store listing

Artwork for the Shopping List App Store record, made the same way as Off-hours.

| Asset | File |
| --- | --- |
| Header (3840×1646) | `marketing/header-3840x1646.png` |
| Search results (1920×1280) | `marketing/search-results-1920x1280.png` |

| iPhone screenshots (1206×2622, "iPhone with Dynamic Island") | `../screenshots/appstore/<language>/` |
| Mac screenshots (2880×1800) | `../screenshots/appstore-mac/<language>/` |

The Mac listing has its own texts in `<language>/mac/` (description, promotional text) and
`mac/review-notes.txt`; the other texts are shared with the iPhone. The Mac screenshots come from
`scripts/mac-screenshots.sh [all]` and need an unlocked screen (a locked screen captures blank
windows). Upload with `scripts/appstore.py listing|screenshots|attach-build --mac …`.

The screenshots show fictional, translated data (`-demo`, Debug builds only) and are taken on a
dedicated "Shopping List Screenshots" simulator: `npm run screenshots` (all languages) or
`LANGUAGE=de LOCALE=de_CH bash scripts/screenshots.sh`.

`marketing/compose.py` draws the icon, the text and a phone with the language's list screenshot
(`../screenshots/appstore/<language>/1-list.png`) onto the backgrounds in `marketing/source/`, for
all 14 App Store languages. It needs Pillow: `python compose.py [languages…]`.

The backgrounds were generated with OpenAI gpt-image-2 (medium quality). They are a bright daylight
flat lay, deliberately unlike Off-hours' dusk landscapes:

- `source/header-bg.png` (3840×1648): a soft 3D clay-style top-down flat lay on a light
  mint-to-cream surface (#E6F5EF → #FBF8F1). Groceries frame only the edges (apples, avocado,
  lemon, cherry tomatoes, carrots, broccoli, sourdough, croissant, milk bottle, eggs, cheese,
  pasta, coffee, a teal tote bag and a toy shopping cart); the centre stays empty for the icon
  and dark teal text. No text, logos or people.
- `source/search-bg.png` (1920×1280): the same style with a looser frame (tomatoes, lemon, herbs
  and eggs along the top; apple, carrots, croissant and cheese along the bottom; a teal tote bag
  in the bottom-right corner), leaving the left free for the phone and the centre-right for text.
