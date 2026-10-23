# ehuang0124.github.io
Eva's GitHub Pages site.

## Writing archive

The static WordPress archive lives under [`writing/`](writing/). The source WXR export is intentionally not stored in this repository.

The index is a Chinese-language, magazine-style page: the masthead reads 寫字的人, section labels, tag names (散文／公路／人物／詩), result counts, and pagination are all in Traditional Chinese. Its tag filters, pagination, and shared article styling live in `writing/style.css` and `writing/archive.js`.

Hand-maintained assets in `writing/assets/` survive a regeneration:

- `2n-mark.svg` — the 2N ring-and-pencil mark taken from the style tile; used in the header and as the favicon.
- `favicon-32.png`, `apple-touch-icon.png`, `icon-512.png` — raster favicons rendered from the same mark.
- `forest-roadside-pickup.png` — the featured roadside photograph.

Cards in the archive show the first illustration found inside a piece (`原文附圖`). An image that fails to load is removed at runtime so the card keeps its text-only layout.

To regenerate the HTML from a WordPress export:

```sh
python3 scripts/import_wordpress.py /path/to/wordpress-export.xml
```

To copy referenced WordPress uploads into the site instead of leaving their original URLs in place, also provide a ZIP of the media library:

```sh
python3 scripts/import_wordpress.py /path/to/wordpress-export.xml --media-zip /path/to/uploads.zip
```
