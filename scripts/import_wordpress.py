#!/usr/bin/env python3
"""Generate a static, GitHub Pages-friendly archive from a WordPress WXR export.

Usage:
  python3 scripts/import_wordpress.py /path/to/export.xml
  python3 scripts/import_wordpress.py /path/to/export.xml --media-zip /path/to/uploads.zip

The XML export is read in place and is never copied into the repository. The
Home page's dynamic post query is represented by the generated /writing/ index.
When a media archive is provided, referenced WordPress uploads are copied into
writing/assets/wordpress/ and internal image/document links are localized.
"""

from __future__ import annotations

import argparse
import html
import json
import posixpath
import re
import shutil
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path, PurePosixPath
from typing import Iterable
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "writing"
SITE_URL = "https://hate2n.wordpress.com/"
SITE_HOSTS = {"hate2n.wordpress.com", "www.hate2n.wordpress.com"}
NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "excerpt": "http://wordpress.org/export/1.2/excerpt/",
    "wp": "http://wordpress.org/export/1.2/",
}
MANIFEST_NAME = ".import-manifest.json"

BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def field(item: ET.Element, name: str, default: str = "") -> str:
    return item.findtext(name, default=default, namespaces=NS) or default


def safe_slug(raw_slug: str, post_id: str) -> str:
    slug = unquote(html.unescape(raw_slug or "")).strip()
    slug = slug.replace("/", "-").replace("\\", "-")
    slug = re.sub(r'[\x00-\x1f<>:"|?*]', "-", slug)
    slug = re.sub(r"\s+", "-", slug).strip(" .-")
    return slug or f"post-{post_id or 'untitled'}"


def date_parts(item: ET.Element) -> tuple[str, str, str]:
    raw = field(item, "wp:post_date")
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if match:
        year, month, day = match.groups()
        return f"{year}-{month}-{day}", year, month
    return "", "0000", "00"


def canonical_wp_path(url: str) -> str | None:
    """Return a normalized WordPress path, or None for non-site URLs."""
    value = html.unescape(url or "").strip()
    if not value:
        return None
    parsed = urlsplit(value)
    if parsed.netloc and parsed.netloc.lower() not in SITE_HOSTS:
        return None
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https"}:
        return None
    path = unquote(parsed.path or "/")
    path = "/" + path.lstrip("/")
    path = posixpath.normpath(path)
    if not path.startswith("/"):
        path = "/" + path
    if path != "/" and not PurePosixPath(path).suffix:
        path = path.rstrip("/") + "/"
    return path.casefold()


def media_rel_from_url(url: str) -> str | None:
    value = html.unescape(url or "").strip()
    if not value:
        return None
    path = unquote(urlsplit(value).path).replace("\\", "/")
    marker = "/wp-content/uploads/"
    pos = path.casefold().find(marker)
    if pos < 0:
        return None
    rel = path[pos + len(marker):].lstrip("/")
    parts = [part for part in PurePosixPath(rel).parts if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        return None
    return "/".join(parts)


def safe_relative_path(value: str) -> Path | None:
    parts = PurePosixPath(value.replace("\\", "/")).parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        return None
    return Path(*parts)


def page_path_from_route(route: str) -> Path:
    return Path(route.lstrip("/")) / "index.html"


def make_routes(items: list[ET.Element]) -> tuple[dict[str, str], dict[str, str], list[tuple[ET.Element, str]], list[tuple[ET.Element, str]]]:
    """Create output routes and old-URL / ID maps before rewriting body links."""
    url_routes: dict[str, str] = {}
    id_routes: dict[str, str] = {}
    posts: list[tuple[ET.Element, str]] = []
    pages: list[tuple[ET.Element, str]] = []
    occupied: set[str] = set()

    ordered = sorted(items, key=lambda item: (field(item, "wp:post_date"), int(field(item, "wp:post_id", "0") or 0)))
    for item in ordered:
        post_type = field(item, "wp:post_type")
        post_id = field(item, "wp:post_id", "0")
        slug = safe_slug(field(item, "wp:post_name"), post_id)
        date, year, month = date_parts(item)

        if post_type == "page" and (slug.casefold() == "home" or canonical_wp_path(field(item, "link")) == "/"):
            route = "/writing/"
        elif post_type == "post":
            route = f"/writing/{year}/{month}/{slug}/"
        elif post_type == "page":
            route = f"/writing/pages/{slug}/"
        else:
            continue

        candidate_key = route.casefold()
        if route != "/writing/" and candidate_key in occupied:
            route = route.rstrip("/") + f"-{post_id}/"
            candidate_key = route.casefold()
        occupied.add(candidate_key)

        if post_id:
            id_routes[post_id] = route
        old_path = canonical_wp_path(field(item, "link"))
        if old_path is not None:
            url_routes[old_path] = route

        if post_type == "post":
            posts.append((item, route))
        else:
            pages.append((item, route))

    # The static archive is the replacement for the WordPress Home page's
    # dynamic query loop. The source page has no authored text of its own.
    url_routes["/"] = "/writing/"
    return url_routes, id_routes, posts, pages


def decode_wp_shortlink(url: str) -> str | None:
    parsed = urlsplit(html.unescape(url or ""))
    if parsed.netloc.lower() != "wp.me":
        return None
    match = re.fullmatch(r"/p[^/]+-([0-9A-Za-z]+)/*", parsed.path)
    if not match:
        return None
    value = 0
    for char in match.group(1):
        value = value * 62 + BASE62.index(char)
    return str(value)


def local_asset_url(url: str, local_media: dict[str, str]) -> str | None:
    rel = media_rel_from_url(url)
    if not rel:
        return None
    return local_media.get(rel.casefold())


def rewrite_one_url(raw_url: str, attr: str, url_routes: dict[str, str], id_routes: dict[str, str], local_media: dict[str, str]) -> str:
    value = html.unescape(raw_url.strip())
    if not value or value.startswith(("#", "data:", "mailto:", "tel:", "javascript:")):
        return raw_url

    local_asset = local_asset_url(value, local_media)
    if local_asset:
        return local_asset

    absolute = urljoin(SITE_URL, value)
    parsed = urlsplit(absolute)
    hostname = parsed.netloc.lower()

    if attr in {"href", "src", "poster"}:
        if hostname in SITE_HOSTS:
            if media_rel_from_url(absolute):
                # Keep an absolute WordPress media URL until a media archive is
                # supplied; a root-relative source URL would point at GitHub.
                return absolute
            query = parse_qs(parsed.query)
            for key in ("p", "page_id"):
                if query.get(key) and query[key][0] in id_routes:
                    return id_routes[query[key][0]] + (f"#{parsed.fragment}" if parsed.fragment else "")
            route_key = canonical_wp_path(absolute)
            if route_key and route_key in url_routes:
                return url_routes[route_key] + (f"#{parsed.fragment}" if parsed.fragment else "")
        short_id = decode_wp_shortlink(value)
        if short_id and short_id in id_routes:
            return id_routes[short_id] + (f"#{parsed.fragment}" if parsed.fragment else "")
    return raw_url


ATTR_RE = re.compile(r"(?P<prefix>\s(?P<name>src|href|poster|srcset)\s*=\s*)(?P<quote>[\"'])(?P<value>.*?)(?P=quote)", re.IGNORECASE | re.DOTALL)


def rewrite_srcset(value: str, url_routes: dict[str, str], id_routes: dict[str, str], local_media: dict[str, str]) -> str:
    changed = False
    pieces: list[str] = []
    for piece in value.split(","):
        stripped = piece.strip()
        if not stripped:
            pieces.append(piece)
            continue
        tokens = stripped.split()
        updated = rewrite_one_url(tokens[0], "src", url_routes, id_routes, local_media)
        if updated != tokens[0]:
            changed = True
            tokens[0] = updated
        pieces.append(" ".join(tokens))
    return ", ".join(pieces) if changed else value


def rewrite_html_urls(content: str, url_routes: dict[str, str], id_routes: dict[str, str], local_media: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group("name").lower()
        value = match.group("value")
        if name == "srcset":
            updated = rewrite_srcset(value, url_routes, id_routes, local_media)
        else:
            updated = rewrite_one_url(value, name, url_routes, id_routes, local_media)
        if updated == value:
            return match.group(0)
        quote_char = match.group("quote")
        return f"{match.group('prefix')}{quote_char}{html.escape(updated, quote=True)}{quote_char}"
    return ATTR_RE.sub(replace, content)


def extract_media_urls(content: str) -> set[str]:
    found: set[str] = set()
    for match in ATTR_RE.finditer(content or ""):
        name = match.group("name").lower()
        value = match.group("value")
        candidates = [value]
        if name == "srcset":
            candidates = [part.strip().split()[0] for part in value.split(",") if part.strip()]
        for candidate in candidates:
            rel = media_rel_from_url(candidate)
            if rel:
                found.add(rel)
    return found


def zip_extract_safely(zip_path: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            name = member.filename.replace("\\", "/")
            if member.is_dir():
                continue
            rel = safe_relative_path(name)
            if rel is None:
                continue
            destination = target / rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, destination.open("wb") as sink:
                shutil.copyfileobj(source, sink)


def media_candidates(media_root: Path) -> tuple[dict[str, list[Path]], dict[str, list[Path]]]:
    by_upload_rel: dict[str, list[Path]] = defaultdict(list)
    by_basename: dict[str, list[Path]] = defaultdict(list)
    for path in media_root.rglob("*"):
        if not path.is_file():
            continue
        by_basename[path.name.casefold()].append(path)
        parts = [part.casefold() for part in path.parts]
        upload_index = next((idx for idx, part in enumerate(parts) if part == "uploads"), None)
        if upload_index is not None and upload_index + 1 < len(path.parts):
            rel = "/".join(path.parts[upload_index + 1:])
            by_upload_rel[rel.casefold()].append(path)
    return by_upload_rel, by_basename


def previous_generated_paths(output_dir: Path) -> list[str]:
    manifest = output_dir / MANIFEST_NAME
    if not manifest.exists():
        return []
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    result: list[str] = []
    for entry in data.get("generated_files", []):
        if isinstance(entry, str) and entry.startswith("writing/") and ".." not in Path(entry).parts:
            result.append(entry)
    return result


def clean_previous(output_dir: Path) -> None:
    for relative in previous_generated_paths(output_dir):
        path = ROOT / relative
        if path.is_file():
            path.unlink()
    # Remove empty directories left by prior generated pages/assets only.
    for directory in sorted(output_dir.rglob("*"), key=lambda path: len(path.parts), reverse=True):
        if directory.is_dir():
            try:
                directory.rmdir()
            except OSError:
                pass


def build_local_media(
    needed_rels: set[str],
    media_root: Path | None,
    output_dir: Path,
) -> tuple[dict[str, str], list[str], list[str]]:
    if media_root is None:
        return {}, [], sorted(needed_rels)

    by_upload_rel, by_basename = media_candidates(media_root)
    mapping: dict[str, str] = {}
    copied: list[str] = []
    missing: list[str] = []

    for source_rel in sorted(needed_rels, key=str.casefold):
        safe_rel = safe_relative_path(source_rel)
        if safe_rel is None:
            continue
        key = "/".join(safe_rel.parts).casefold()
        matches = by_upload_rel.get(key, [])
        if not matches:
            # Some exports contain a media zip whose top-level folder is
            # different; match a full uploads suffix before falling back to a
            # unique filename.
            matches = [path for rel, paths in by_upload_rel.items() if rel.endswith("/" + key) or key.endswith("/" + rel) for path in paths]
        if not matches:
            matches = by_basename.get(safe_rel.name.casefold(), [])
        if len(matches) != 1:
            missing.append(source_rel)
            continue

        destination = output_dir / "assets" / "wordpress" / safe_rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(matches[0], destination)
        route = "/writing/assets/wordpress/" + "/".join(quote(part, safe="-._~") for part in safe_rel.parts)
        mapping[key] = route
        copied.append(destination.relative_to(ROOT).as_posix())

    return mapping, copied, missing


def categories_for(item: ET.Element) -> list[str]:
    values: list[str] = []
    for node in item.findall("category"):
        if node.attrib.get("domain") not in {"category", "post_tag"}:
            continue
        label = html.unescape((node.text or "").strip())
        if label and label not in values:
            values.append(label)
    return values


def item_thumbnail(item: ET.Element, attachment_urls: dict[str, str], local_media: dict[str, str]) -> str | None:
    thumb_id = ""
    for meta in item.findall("wp:postmeta", NS):
        if field(meta, "wp:meta_key") == "_thumbnail_id":
            thumb_id = field(meta, "wp:meta_value")
            break
    original = attachment_urls.get(thumb_id)
    if not original:
        return None
    local = local_asset_url(original, local_media)
    return local or original


def html_document(title: str, site_title: str, canonical: str, body: str, extra_head: str = "") -> str:
    safe_title = html.escape(title, quote=True)
    safe_site = html.escape(site_title, quote=True)
    document_title = safe_title if title == site_title else f"{safe_title} | {safe_site}"
    extra_head_markup = f"  {extra_head}\n" if extra_head else ""
    safe_canonical = html.escape("https://ehuang0124.github.io" + canonical, quote=True)
    return f'''<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#ffffff">
  <meta property="og:title" content="{safe_title}">
  <link rel="canonical" href="{safe_canonical}">
  <link rel="stylesheet" href="/writing/style.css">
  <title>{document_title}</title>
{extra_head_markup}</head>
<body>
{body}
</body>
</html>
'''


def header(site_title: str, home_label: str = "Eva Huang") -> str:
    return f'''<header class="site-header">
  <a class="brand" href="/writing/">{html.escape(site_title)}</a>
  <a class="portfolio-link" href="/">{html.escape(home_label)} <span aria-hidden="true">↗</span></a>
</header>'''


def render_categories(labels: Iterable[str]) -> str:
    values = list(labels)
    if not values:
        return ""
    tags = "".join(f'<span class="tag">{html.escape(label)}</span>' for label in values)
    return f'<div class="category-list" aria-label="Categories">{tags}</div>'


def expand_reusable_blocks(content: str, reusable_blocks: dict[str, str], depth: int = 0) -> str:
    if depth >= 6:
        return content

    block_ref = re.compile(r'<!--\s*wp:block\s+(\{.*?\})\s*/-->')
    social_link = re.compile(r'<!--\s*wp:social-link\s+(\{.*?\})\s*/-->')

    def replace_reference(match: re.Match[str]) -> str:
        try:
            attrs = json.loads(match.group(1))
        except json.JSONDecodeError:
            return match.group(0)
        block = reusable_blocks.get(str(attrs.get("ref", "")))
        return expand_reusable_blocks(block, reusable_blocks, depth + 1) if block is not None else match.group(0)

    def replace_social_link(match: re.Match[str]) -> str:
        try:
            attrs = json.loads(match.group(1))
        except json.JSONDecodeError:
            return match.group(0)
        service = str(attrs.get("service", "")).lower()
        url = str(attrs.get("url", ""))
        if not url:
            return ""
        labels = {"twitter": "Twitter", "medium": "Medium", "instagram": "Instagram", "linkedin": "LinkedIn", "facebook": "Facebook"}
        glyphs = {"twitter": "t", "medium": "M", "instagram": "◎", "linkedin": "in", "facebook": "f"}
        label = labels.get(service, service.title() or "Link")
        glyph = glyphs.get(service, "↗")
        return (
            f'<li class="wp-social-link wp-social-link-{html.escape(service, quote=True)}">'
            f'<a href="{html.escape(url, quote=True)}" aria-label="{html.escape(label, quote=True)}" '
            f'target="_blank" rel="noreferrer noopener"><span aria-hidden="true">{html.escape(glyph)}</span></a></li>'
        )

    expanded = block_ref.sub(replace_reference, content)
    return social_link.sub(replace_social_link, expanded)


def render_archive(site_title: str, posts: list[tuple[ET.Element, str]], pages: list[tuple[ET.Element, str]], attachment_urls: dict[str, str], local_media: dict[str, str]) -> str:
    ordered_posts = sorted(posts, key=lambda pair: (field(pair[0], "wp:post_date"), int(field(pair[0], "wp:post_id", "0") or 0)), reverse=True)
    grouped: dict[str, list[tuple[ET.Element, str]]] = defaultdict(list)
    for item, route in ordered_posts:
        date, year, _ = date_parts(item)
        grouped[year].append((item, route))

    groups: list[str] = []
    for year in sorted(grouped, reverse=True):
        cards: list[str] = []
        for item, route in grouped[year]:
            title = html.unescape(field(item, "title", "Untitled"))
            date, _, _ = date_parts(item)
            image = item_thumbnail(item, attachment_urls, local_media)
            media_markup = f'    <img class="post-image" src="{html.escape(image, quote=True)}" alt="" loading="lazy" decoding="async">\n' if image else ""
            tags = render_categories(categories_for(item))
            tags_markup = f"      {tags}\n" if tags else ""
            cards.append(f'''<article class="post-card">
  <a class="post-card-link" href="{html.escape(route, quote=True)}">
{media_markup}    <div class="post-card-copy">
      <time class="post-date" datetime="{html.escape(date, quote=True)}">{html.escape(date)}</time>
      <h3>{html.escape(title)}</h3>
{tags_markup}    </div>
  </a>
</article>''')
        groups.append(f'''<section class="year-section" aria-labelledby="year-{year}">
  <div class="year-heading"><h2 id="year-{year}">{html.escape(year)}</h2><span aria-hidden="true"></span></div>
  <div class="post-grid">{''.join(cards)}</div>
</section>''')

    page_links: list[str] = []
    for item, route in sorted(pages, key=lambda pair: field(pair[0], "title").casefold()):
        if route == "/writing/":
            continue
        title = html.unescape(field(item, "title", "Untitled"))
        page_links.append(f'<a class="page-link" href="{html.escape(route, quote=True)}">{html.escape(title)}<span aria-hidden="true">↗</span></a>')
    pages_section = ""
    if page_links:
        pages_section = f'''<section class="pages-section" aria-label="Pages">
  <div class="year-heading"><h2>Pages</h2><span aria-hidden="true"></span></div>
  <div class="page-links">{''.join(page_links)}</div>
</section>'''

    body = f'''<a class="skip-link" href="#main">Skip to main content</a>
<div class="shell">
  {header(site_title)}
  <main id="main" class="archive-main">
    <div class="archive-kicker" aria-hidden="true"><span></span></div>
    <h1 class="archive-title">{html.escape(site_title)}</h1>
    {''.join(groups)}
    {pages_section}
  </main>
  <footer class="site-footer"><a href="/">Eva Huang</a></footer>
</div>'''
    return html_document(site_title, site_title, "/writing/", body)


def render_post(site_title: str, item: ET.Element, route: str, content: str, reusable_blocks: dict[str, str], url_routes: dict[str, str], id_routes: dict[str, str], local_media: dict[str, str]) -> str:
    title = html.unescape(field(item, "title", "Untitled"))
    date, _, _ = date_parts(item)
    expanded = expand_reusable_blocks(content, reusable_blocks)
    rewritten = rewrite_html_urls(expanded, url_routes, id_routes, local_media)
    tags = render_categories(categories_for(item))
    body = f'''<a class="skip-link" href="#article-content">Skip to article</a>
<div class="shell">
  {header(site_title)}
  <main class="article-main" id="main">
    <a class="back-link" href="/writing/" aria-label="Writing index"><span aria-hidden="true">←</span></a>
    <article>
      <header class="article-head">
        <time class="post-date" datetime="{html.escape(date, quote=True)}">{html.escape(date)}</time>
        <h1>{html.escape(title)}</h1>
        {tags}
      </header>
      <div class="entry-content" id="article-content">{rewritten}</div>
    </article>
  </main>
  <footer class="site-footer"><a href="/writing/">{html.escape(site_title)}</a></footer>
</div>'''
    return html_document(title, site_title, route, body)


def render_page(site_title: str, item: ET.Element, route: str, content: str, reusable_blocks: dict[str, str], url_routes: dict[str, str], id_routes: dict[str, str], local_media: dict[str, str]) -> str:
    title = html.unescape(field(item, "title", "Untitled"))
    date, _, _ = date_parts(item)
    expanded = expand_reusable_blocks(content, reusable_blocks)
    rewritten = rewrite_html_urls(expanded, url_routes, id_routes, local_media)
    body = f'''<a class="skip-link" href="#page-content">Skip to page</a>
<div class="shell">
  {header(site_title)}
  <main class="article-main" id="main">
    <a class="back-link" href="/writing/" aria-label="Writing index"><span aria-hidden="true">←</span></a>
    <article>
      <header class="article-head">
        <time class="post-date" datetime="{html.escape(date, quote=True)}">{html.escape(date)}</time>
        <h1>{html.escape(title)}</h1>
      </header>
      <div class="entry-content" id="page-content">{rewritten}</div>
    </article>
  </main>
  <footer class="site-footer"><a href="/writing/">{html.escape(site_title)}</a></footer>
</div>'''
    return html_document(title, site_title, route, body)


def read_export(path: Path) -> tuple[str, list[ET.Element], list[ET.Element], dict[str, str]]:
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError) as exc:
        raise ValueError(f"Could not read WordPress WXR XML: {exc}") from exc
    channel = root.find("./channel")
    if channel is None:
        raise ValueError("This does not look like a WordPress WXR export (missing channel).")
    site_title = html.unescape(channel.findtext("title", default="Eva Huang | 黃樂恩 | 2N"))
    items = channel.findall("item")
    published = [item for item in items if field(item, "wp:status") == "publish"]
    posts = [item for item in published if field(item, "wp:post_type") == "post"]
    pages = [item for item in published if field(item, "wp:post_type") == "page"]
    reusable_blocks = {
        field(item, "wp:post_id"): field(item, "content:encoded")
        for item in items
        if field(item, "wp:post_type") == "wp_block" and field(item, "wp:status") == "publish"
    }
    return site_title, posts + pages, [item for item in items if field(item, "wp:post_type") == "attachment"], reusable_blocks


def write_generated(output_dir: Path, relative_path: str, content: str, generated_files: list[str]) -> None:
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Refusing to write outside the output directory: {relative_path}")
    target = output_dir / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    generated_files.append((Path("writing") / relative).as_posix())


def build(args: argparse.Namespace) -> int:
    export_path = args.xml.expanduser().resolve()
    if not export_path.is_file():
        raise ValueError(f"WordPress export file not found: {export_path}")

    site_title, published, attachments, reusable_blocks = read_export(export_path)
    output_dir = DEFAULT_OUTPUT
    output_dir.mkdir(parents=True, exist_ok=True)
    clean_previous(output_dir)

    url_routes, id_routes, posts, pages = make_routes(published)
    attachment_urls = {field(item, "wp:post_id"): field(item, "wp:attachment_url") for item in attachments if field(item, "wp:attachment_url")}

    needed_media: set[str] = set()
    for item in published:
        content = field(item, "content:encoded")
        needed_media.update(extract_media_urls(content))
        thumb = ""
        for meta in item.findall("wp:postmeta", NS):
            if field(meta, "wp:meta_key") == "_thumbnail_id":
                thumb = field(meta, "wp:meta_value")
                break
        if thumb in attachment_urls:
            rel = media_rel_from_url(attachment_urls[thumb])
            if rel:
                needed_media.add(rel)

    temp_context = tempfile.TemporaryDirectory(prefix="wordpress-media-") if args.media_zip else None
    try:
        media_root: Path | None
        if args.media_zip:
            zip_path = args.media_zip.expanduser().resolve()
            if not zip_path.is_file():
                raise ValueError(f"Media ZIP not found: {zip_path}")
            media_root = Path(temp_context.name) / "extracted"
            zip_extract_safely(zip_path, media_root)
        elif args.media_dir:
            media_root = args.media_dir.expanduser().resolve()
            if not media_root.is_dir():
                raise ValueError(f"Media directory not found: {media_root}")
        else:
            media_root = None

        local_media, copied_assets, missing_media = build_local_media(needed_media, media_root, output_dir)
        generated_files: list[str] = []

        archive_html = render_archive(site_title, posts, pages, attachment_urls, local_media)
        write_generated(output_dir, "index.html", archive_html, generated_files)

        for item, route in posts:
            content = field(item, "content:encoded")
            page_html = render_post(site_title, item, route, content, reusable_blocks, url_routes, id_routes, local_media)
            write_generated(output_dir, page_path_from_route(route).as_posix().removeprefix("writing/"), page_html, generated_files)

        home_represented = False
        for item, route in pages:
            if route == "/writing/":
                home_represented = True
                continue
            content = field(item, "content:encoded")
            page_html = render_page(site_title, item, route, content, reusable_blocks, url_routes, id_routes, local_media)
            write_generated(output_dir, page_path_from_route(route).as_posix().removeprefix("writing/"), page_html, generated_files)

        generated_files.extend(copied_assets)
        manifest = {
            "generated_files": sorted(set(generated_files)),
            "posts": len(posts),
            "pages": len(pages),
            "home_represented_by_archive": home_represented,
            "localized_media": len(copied_assets),
            "missing_referenced_media": sorted(missing_media),
        }
        (output_dir / MANIFEST_NAME).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        print(f"Generated {len(posts)} posts and {len(pages) - int(home_represented)} standalone pages in {output_dir}.")
        if home_represented:
            print("The source Home page's dynamic post query is represented by /writing/.")
        if media_root is None:
            print(f"No media archive provided: {len(needed_media)} referenced WordPress uploads remain linked to WordPress.com.")
        else:
            print(f"Localized {len(copied_assets)} referenced media files; {len(missing_media)} referenced files were not found in the supplied media archive.")
        return 0
    finally:
        if temp_context is not None:
            temp_context.cleanup()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate static HTML from a WordPress WXR export.")
    parser.add_argument("xml", type=Path, help="WordPress WXR XML export")
    media = parser.add_mutually_exclusive_group()
    media.add_argument("--media-zip", type=Path, help="ZIP containing the WordPress uploads directory")
    media.add_argument("--media-dir", type=Path, help="Extracted WordPress uploads directory")
    return parser.parse_args()


if __name__ == "__main__":
    try:
        raise SystemExit(build(parse_args()))
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(2)
