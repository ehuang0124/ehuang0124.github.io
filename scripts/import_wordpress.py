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
HAND_MAINTAINED = {
    "writing/style.css",
    "writing/archive.js",
    "writing/assets/2n-mark.svg",
    "writing/assets/favicon-32.png",
    "writing/assets/apple-touch-icon.png",
    "writing/assets/icon-512.png",
    "writing/assets/forest-roadside-pickup.png",
}

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
        if (
            isinstance(entry, str)
            and entry.startswith("writing/")
            and entry not in HAND_MAINTAINED
            and ".." not in Path(entry).parts
        ):
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


# The archive is intentionally organized by recurring subjects rather than by
# publication year. These are editorial tags, separate from the legacy
# WordPress categories carried by the export.
ROADTRIP_TITLES = {
    "搭船的人",
    "布朗斯維克燉肉（Brunswick Stew）",
    "學路",
    "909 天美國南方紀實",
    "北京隨筆",
    "地理閱讀筆記",
    "高空彈跳",
    "Teleport｜20200802",
    "穴居人｜2015 夏",
    "Ivy Day",
}
PEOPLE_TITLES = {
    "銅板將軍",
    "午安，垃圾少女組",
    "你好，再見，高中同學會",
    "因為遇見你",
    "Love Is Blind | 20200613",
    "伊恩",
    "鄰・居",
    "都市觀察——我呼喊了，你的名字",
    "327號 診療日記",
    "告別｜2021-06-08",
    "民生小孩 ｜20200721",
}
TAG_LABELS = {"essay": "散文", "roadtrip": "公路", "people": "人物", "poem": "詩"}


def writing_tags(item: ET.Element) -> list[str]:
    title = html.unescape(field(item, "title", "Untitled")).strip()
    categories = {label.casefold() for label in categories_for(item)}
    tags = ["poem"] if "poem" in categories else ["essay"]
    if title in ROADTRIP_TITLES:
        tags.append("roadtrip")
    if title in PEOPLE_TITLES or title.endswith("的人") or "的人——" in title or "同學" in title:
        tags.append("people")
    return tags


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


def html_document(
    title: str,
    site_title: str,
    canonical: str,
    body: str,
    extra_head: str = "",
    asset_prefix: str = "/writing/",
) -> str:
    safe_title = html.escape(title, quote=True)
    safe_site = html.escape(site_title, quote=True)
    document_title = safe_title if title == site_title else f"{safe_title} | {safe_site}"
    extra_head_markup = f"  {extra_head}\n" if extra_head else ""
    safe_canonical = html.escape("https://ehuang0124.github.io" + canonical, quote=True)
    asset_root = f"{asset_prefix}assets/" if asset_prefix else "assets/"
    style_href = f"{asset_prefix}style.css" if asset_prefix else "style.css"
    return f'''<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#F4F0E5">
  <meta property="og:title" content="{safe_title}">
  <link rel="canonical" href="{safe_canonical}">
  <link rel="icon" type="image/svg+xml" href="{asset_root}2n-mark.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="{asset_root}favicon-32.png">
  <link rel="icon" type="image/png" sizes="512x512" href="{asset_root}icon-512.png">
  <link rel="apple-touch-icon" sizes="180x180" href="{asset_root}apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&amp;family=Newsreader:opsz,wght@6..72,400..700&amp;family=Noto+Sans+TC:wght@400;500;600&amp;family=Noto+Serif+TC:wght@400;500;600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{style_href}">
  <title>{document_title}</title>
{extra_head_markup}</head>
<body>
{body}
</body>
</html>
'''


def header(site_title: str, home_label: str = "黃樂恩", asset_prefix: str = "/writing/") -> str:
    asset_root = f"{asset_prefix}assets/" if asset_prefix else "assets/"
    return f'''<header class="site-header">
  <a class="brand" href="/writing/" aria-label="2N — 黃樂恩">
    <img class="brand-mark" src="{asset_root}2n-mark.svg" alt="" width="72" height="72" decoding="async">
    <span class="brand-copy">
      <span class="brand-name">{html.escape(home_label)}</span>
      <span class="brand-subname">Eva Huang <span aria-hidden="true">·</span> 2N</span>
    </span>
  </a>
  <p class="site-tagline"><span>Candid.</span><span>Curious.</span><span>Independent.</span></p>
  <a class="portfolio-link" href="/">作品集 <span aria-hidden="true">↗</span></a>
</header>'''


def render_categories(labels: Iterable[str]) -> str:
    values = list(labels)
    if not values:
        return ""
    tags = "".join(
        f'<span class="tag tag--{html.escape(label, quote=True)}">{html.escape(TAG_LABELS.get(label, label))}</span>'
        for label in values
    )
    return f'<div class="category-list" aria-label="文章題材">{tags}</div>'


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


def _prose_fragments(fragment: str) -> list[str]:
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.IGNORECASE)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    fragment = html.unescape(fragment).replace("\xa0", " ")
    values: list[str] = []
    for value in re.split(r"\n\s*\n+", fragment):
        value = re.sub(r"[ \t\r\f\v]+", " ", value).strip()
        if value:
            values.append(value)
    return values


def _is_editorial_note(value: str) -> bool:
    value = re.sub(r"\s+", " ", value).strip()
    return (
        not value
        or value.startswith(("#", "刊登於", "獲選", "收錄於"))
        or value.startswith(("2022台中", "《2024北美洲文苑文學獎》"))
        or value in {"微電影合作邀約", "link"}
    )


def first_prose_block(content: str) -> str:
    # Extract existing article copy rather than creating a new editorial blurb.
    source = re.sub(r"<!--.*?-->", "", content or "", flags=re.DOTALL)
    candidates: list[str] = []
    block_pattern = re.compile(r"<(p|pre)\b[^>]*>(.*?)</\1\s*>", re.IGNORECASE | re.DOTALL)
    for match in block_pattern.finditer(source):
        candidates.extend(_prose_fragments(match.group(2)))
    if not candidates:
        # A small number of imported poems are plain text in the post body.
        candidates.extend(_prose_fragments(source))
    for candidate in candidates:
        if not _is_editorial_note(candidate):
            return candidate
    return ""


def teaser_from_content(content: str) -> str:
    text = re.sub(r"\s+", " ", first_prose_block(content)).strip()
    if not text:
        return "一篇收在書寫檔案裡的文章。"
    if len(text) <= 168:
        return text
    sentences = re.split(r"(?<=[。！？!?])\s*", text)
    selected = ""
    for sentence in sentences:
        if not sentence:
            continue
        if selected and len(selected) + len(sentence) > 150:
            break
        selected += sentence
        if len(selected) >= 70:
            break
    if not selected:
        selected = text[:150]
    if len(selected) < len(text):
        selected = selected.rstrip(" ,，。；;") + "…"
    return selected

FIRST_IMAGE_RE = re.compile(r"<img[^>]*>", re.IGNORECASE)


def first_content_image(content: str, url_routes: dict[str, str], id_routes: dict[str, str], local_media: dict[str, str]) -> str | None:
    """Return the first usable illustration inside a piece, localized when possible."""
    for tag in FIRST_IMAGE_RE.findall(content):
        src = re.search(r'src="([^"]+)"', tag, re.IGNORECASE)
        if not src:
            continue
        url = html.unescape(src.group(1)).strip()
        if not url or url.startswith("data:"):
            continue
        localized = local_asset_url(url, local_media)
        if localized:
            return localized
        if SITE_HOSTS & {urlsplit(url).netloc}:
            return url
        continue
    return None


def render_archive(site_title: str, posts: list[tuple[ET.Element, str]], pages: list[tuple[ET.Element, str]], attachment_urls: dict[str, str], local_media: dict[str, str]) -> str:
    ordered_posts = sorted(
        posts,
        key=lambda pair: (field(pair[0], "wp:post_date"), int(field(pair[0], "wp:post_id", "0") or 0)),
        reverse=True,
    )

    entries: list[dict[str, object]] = []
    for item, route in ordered_posts:
        date, _, _ = date_parts(item)
        entries.append({
            "title": html.unescape(field(item, "title", "Untitled")),
            "date": date,
            "path": route,
            "tags": writing_tags(item),
            "excerpt": teaser_from_content(field(item, "content:encoded")),
            "image": first_content_image(
                field(item, "content:encoded"), url_routes, id_routes, local_media
            ),
        })

    featured_pair = next(
        (
            pair for pair in ordered_posts
            if safe_slug(field(pair[0], "wp:post_name"), field(pair[0], "wp:post_id", "0")).casefold() == "brunswick-stew"
        ),
        None,
    )
    if featured_pair is None and len(ordered_posts) > 1:
        featured_pair = ordered_posts[1]

    featured: dict[str, str] = {}
    if featured_pair is not None:
        featured_item, featured_route = featured_pair
        featured = {
            "title": html.unescape(field(featured_item, "title", "Untitled")),
            "date": date_parts(featured_item)[0],
            "path": featured_route,
            "excerpt": teaser_from_content(field(featured_item, "content:encoded")),
        }

    def card_markup(entry: dict[str, object], index: int) -> str:
        tags_markup = "".join(
            f'<span class="tag tag--small tag--{html.escape(str(tag), quote=True)}">{html.escape(TAG_LABELS.get(str(tag), str(tag)))}</span>'
            for tag in entry["tags"]  # type: ignore[union-attr]
        )
        image = entry.get("image")
        figure = ""
        if image:
            figure = f'''<figure class="story-card-figure">
      <img class="story-card-image" src="{html.escape(str(image), quote=True)}" alt="" loading="lazy" decoding="async">
      <figcaption class="story-card-figure-caption">原文附圖</figcaption>
    </figure>'''
        card_class = "story-card story-card--has-image" if image else "story-card"
        return f'''<article class="{card_class}">
  <a class="story-card-link" href="{html.escape(str(entry["path"]), quote=True)}">
    <div class="story-card-topline">
      <span class="story-card-number">{index:02d}</span>
      <time datetime="{html.escape(str(entry["date"]), quote=True)}">{html.escape(str(entry["date"]))}</time>
    </div>
    {figure}
    <h3 class="story-card-title">{html.escape(str(entry["title"]))}</h3>
    <p class="story-excerpt"><span class="quote-mark" aria-hidden="true">“</span>{html.escape(str(entry["excerpt"]))}</p>
    <div class="story-card-bottom">
      <span class="story-tags">{tags_markup}</span>
      <span class="story-card-arrow" aria-hidden="true">↗</span>
    </div>
  </a>
</article>'''

    data_json = json.dumps(entries, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page_count = max(1, (len(entries) + 19) // 20)
    pagination_links = ""
    for page in range(1, page_count + 1):
        current_class = " is-current" if page == 1 else ""
        current_attr = ' aria-current="page"' if page == 1 else ""
        pagination_links += f'<button class="pagination-link{current_class}" type="button" data-page="{page}"{current_attr}>{page:02d}</button>'

    page_links: list[str] = []
    for item, route in sorted(pages, key=lambda pair: field(pair[0], "title").casefold()):
        if route == "/writing/":
            continue
        title = html.unescape(field(item, "title", "Untitled"))
        page_links.append(
            f'<a class="page-link" href="{html.escape(route, quote=True)}">{html.escape(title)}<span aria-hidden="true">↗</span></a>'
        )
    pages_section = ""
    if page_links:
        pages_section = f'''<section class="pages-section" aria-label="Pages">
  <p class="section-label"><span>03 /</span> 頁面</p>
  <div class="page-links">{"".join(page_links)}</div>
</section>'''

    feature_markup = ""
    if featured:
        feature_markup = f'''<a class="feature-story" href="{html.escape(featured["path"], quote=True)}" aria-label="{html.escape(featured["title"], quote=True)}">
        <img class="feature-image" src="assets/forest-roadside-pickup.png" alt="公路邊的樹林與一輛紅色小貨卡" decoding="async">
        <span class="feature-caption">公路速寫</span>
        <span class="feature-copy">
          <span class="feature-kicker">精選 <span aria-hidden="true">·</span> 公路散文 <span aria-hidden="true">/</span> {html.escape(featured["date"])}</span>
          <span class="feature-title">{html.escape(featured["title"])}</span>
          <span class="feature-excerpt">{html.escape(featured["excerpt"])}</span>
          <span class="feature-arrow" aria-hidden="true">↗</span>
        </span>
      </a>'''

    initial_cards = "".join(card_markup(entry, index) for index, entry in enumerate(entries[:20], start=1))
    body = f'''<a class="skip-link" href="#main">跳至主要內容</a>
<div class="shell">
  {header(site_title, asset_prefix="")}
  <main id="main" class="archive-main">
    <section class="archive-intro" aria-labelledby="archive-intro-title">
      <div class="intro-copy">
        <p class="section-label"><span>01 /</span> 散文與詩</p>
        <h1 id="archive-intro-title">寫字的人</h1>
        <p class="archive-dek">散文、詩，還有一些長在公路邊上的筆記。寫移動中遇見的人，也寫人身上那條走不完的路。</p>
        <p class="archive-note">這裡不照時間排，而照感覺排。順著一個念頭往下讀，你會走到同一題材的另一端——因此每一篇都留著幾句原本的句子，讓文章自己替你選路。</p>
      </div>
      {feature_markup}
    </section>

    <section class="archive-browser" id="archive" aria-labelledby="archive-title">
      <div class="browser-heading">
        <div class="browser-heading-copy">
          <p class="section-label"><span>02 /</span> 依題材閱讀</p>
          <h2 id="archive-title">順著題材讀。</h2>
        </div>
        <p class="browser-heading-note">標籤不是分類，是同一條線上的幾個結。文章附圖者，圖也一併留在版面上。</p>
      </div>
      <div class="tag-nav" id="tag-nav" aria-label="依題材篩選" role="toolbar">
        <button class="tag-filter is-active" type="button" data-tag="all" aria-pressed="true">全部文章</button>
        <button class="tag-filter" type="button" data-tag="essay" aria-pressed="false">散文</button>
        <button class="tag-filter" type="button" data-tag="roadtrip" aria-pressed="false">公路</button>
        <button class="tag-filter" type="button" data-tag="people" aria-pressed="false">人物</button>
        <button class="tag-filter" type="button" data-tag="poem" aria-pressed="false">詩</button>
      </div>
      <div class="results-toolbar" aria-live="polite">
        <p><span id="results-count">{len(entries)} 篇</span> <span aria-hidden="true">/</span> <span id="results-range">第 1–{min(20, len(entries))} 篇，共 {len(entries)} 篇</span></p>
        <p id="page-label">第 1 頁，共 {page_count} 頁</p>
      </div>
      <div class="story-grid" id="story-grid" tabindex="-1">
{initial_cards}
      </div>
      <p class="empty-state" id="empty-state" hidden>這個題材下暫時沒有文章。</p>
      <nav class="pagination" id="pagination" aria-label="文章分頁">
        <button class="pagination-link" type="button" data-page="0" disabled>上一頁</button>
        {pagination_links}
        <button class="pagination-link" type="button" data-page="2">下一頁</button>
      </nav>
      <noscript><p class="archive-note">請開啟 JavaScript 以篩選題材與翻頁；上方已列出最近二十篇。</p></noscript>
    </section>
    {pages_section}
  </main>
  <footer class="site-footer"><span>2N <span aria-hidden="true">/</span> 黃樂恩</span><a href="/">作品集 <span aria-hidden="true">↗</span></a></footer>
</div>
<script id="writing-data" type="application/json">{data_json}</script>
<script src="archive.js" defer></script>'''
    return html_document(site_title, site_title, "/writing/", body, asset_prefix="")


def render_post(site_title: str, item: ET.Element, route: str, content: str, reusable_blocks: dict[str, str], url_routes: dict[str, str], id_routes: dict[str, str], local_media: dict[str, str]) -> str:
    title = html.unescape(field(item, "title", "Untitled"))
    date, _, _ = date_parts(item)
    expanded = expand_reusable_blocks(content, reusable_blocks)
    rewritten = rewrite_html_urls(expanded, url_routes, id_routes, local_media)
    tags = render_categories(writing_tags(item))
    body = f'''<a class="skip-link" href="#article-content">跳至文章內容</a>
<div class="shell">
  {header(site_title)}
  <main class="article-main" id="main">
    <a class="back-link" href="/writing/" aria-label="返回文章列表"><span aria-hidden="true">←</span></a>
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
    body = f'''<a class="skip-link" href="#page-content">跳至頁面內容</a>
<div class="shell">
  {header(site_title)}
  <main class="article-main" id="main">
    <a class="back-link" href="/writing/" aria-label="返回文章列表"><span aria-hidden="true">←</span></a>
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
