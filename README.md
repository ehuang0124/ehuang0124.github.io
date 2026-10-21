# ehuang0124.github.io
Eva's GitHub Pages site.

## Writing archive

The static WordPress archive lives under [`writing/`](writing/). The source WXR export is intentionally not stored in this repository.

To regenerate the HTML from a WordPress export:

```sh
python3 scripts/import_wordpress.py /path/to/wordpress-export.xml
```

To copy referenced WordPress uploads into the site instead of leaving their original URLs in place, also provide a ZIP of the media library:

```sh
python3 scripts/import_wordpress.py /path/to/wordpress-export.xml --media-zip /path/to/uploads.zip
```
