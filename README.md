# ehuang0124.github.io
Eva's GitHub Pages site.

## Writing archive

The static WordPress archive lives under [`writing/`](writing/). The source WXR export is intentionally not stored in this repository. Its magazine-style index, tag filters, pagination, and shared article styling live in `writing/style.css` and `writing/archive.js`; the 2N mark and roadside feature image are hand-maintained in `writing/assets/` and are retained when the archive is regenerated.

To regenerate the HTML from a WordPress export:

```sh
python3 scripts/import_wordpress.py /path/to/wordpress-export.xml
```

To copy referenced WordPress uploads into the site instead of leaving their original URLs in place, also provide a ZIP of the media library:

```sh
python3 scripts/import_wordpress.py /path/to/wordpress-export.xml --media-zip /path/to/uploads.zip
```
