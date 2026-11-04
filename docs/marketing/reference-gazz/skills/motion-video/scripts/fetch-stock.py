#!/usr/bin/env python3
"""Real, free stock media for videos and images — from several sources, with
the licence of every file written down.

  Video  : Mixkit (https://mixkit.co/free-stock-video/, Mixkit Stock Video
           Free License — no attribution needed). Up to 1080p.
  Stills : Openverse (https://openverse.org) — indexes Flickr, Wikimedia,
           rawpixel, StockSnap and more. Default licences cc0 + pdm (public
           domain: no attribution needed). Typical size 1024 px wide.

Usage
  # list Mixkit clips for a topic (slug + id), then download chosen ids
  python3 fetch-stock.py mixkit-search poker
  python3 fetch-stock.py mixkit-get --out media 40508 100391 100450
  # list / download Openverse stills (cc0+pdm by default)
  python3 fetch-stock.py openverse "poker chips" --n 12
  python3 fetch-stock.py openverse "dollar bills" --get 3 --out media
  python3 fetch-stock.py openverse "poker chips" --pick <id>,<id> --out media

Every download appends a line to <out>/LICENSES.txt (source page, author,
licence). Facts learned 2026-10-16 from this sandbox:
  * Mixkit: old ids serve /videos/<id>/<id>-1080.mp4; newer ids (6 digits)
    serve /active_storage/video_items/<id>/<ts>/<id>-video-1080.mp4 — the
    item page lists the 360/720 links, 1080 sits next to them. No 2160.
  * Pexels / Pixabay pages sit behind bot walls (403); Wikimedia (API and
    upload.wikimedia.org) answers 429 to this shared IP. Openverse's API
    works and points at Flickr/rawpixel files that download fine.
  * Stock footage is <= 1080p: in a 4K comp, show clips at <= 960 CSS px
    (native on a DPR-2 render), or full-bleed only behind a heavy darken +
    blur. Never upscale a still past its own pixels (CLAUDE.md asset rule).
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def get(url, ua=UA, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def log(out, line):
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "LICENSES.txt"), "a") as f:
        f.write(line + "\n")


def mixkit_search(term):
    html = get(f"https://mixkit.co/free-stock-video/{urllib.parse.quote(term)}/").decode("utf8", "ignore")
    seen = []
    for slug in re.findall(r'href="/free-stock-video/([a-z0-9-]+-\d+)/"', html):
        if slug not in seen:
            seen.append(slug)
    return seen


def mixkit_urls(item):
    """item = '40508' or a full slug 'game-table-with-poker-cards-and-chips-40508'."""
    vid = re.search(r"(\d+)$", item).group(1)
    slug = item if not item.isdigit() else None
    if slug is None:
        # find the slug through a site search on the id's page redirect
        slug = vid
    page = f"https://mixkit.co/free-stock-video/{slug}/"
    try:
        html = get(page).decode("utf8", "ignore")
    except Exception:
        html = ""
    links = sorted(set(re.findall(r"https://assets\.mixkit\.co/[^\"' ]+?\.mp4", html)))
    cands = []
    for l in links:
        for q in ("1080", "720"):
            cands.append(re.sub(r"-(360|720)\.mp4$", f"-{q}.mp4", l))
    cands += [f"https://assets.mixkit.co/videos/{vid}/{vid}-1080.mp4", f"https://assets.mixkit.co/videos/{vid}/{vid}-720.mp4"]
    out, seen = [], set()
    for c in cands:
        if c not in seen:
            seen.add(c); out.append(c)
    return vid, page, out


def mixkit_get(items, out):
    os.makedirs(out, exist_ok=True)
    for it in items:
        vid, page, cands = mixkit_urls(it)
        dest = os.path.join(out, f"mixkit-{vid}.mp4")
        ok = False
        for u in cands:
            try:
                data = get(u, timeout=180)
                if len(data) < 10000:
                    continue
                open(dest, "wb").write(data)
                q = re.search(r"-(\d+)\.mp4$", u).group(1)
                log(out, f"{os.path.basename(dest)} - Mixkit video {vid} ({q}p) - {page} - {u} - Mixkit Stock Video Free License")
                print("ok", dest, q + "p", len(data) // 1024, "KB")
                ok = True
                break
            except Exception:
                continue
        if not ok:
            print("FAILED", it, "(open the item page and pass the full slug)", file=sys.stderr)


def openverse(q, licenses, n):
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(
        {"q": q, "license": licenses, "page_size": n, "mature": "false"})
    d = json.loads(get(url, ua="gazzfun-media-fetch/1.0"))
    return d.get("results", [])


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s1 = sub.add_parser("mixkit-search"); s1.add_argument("term")
    s2 = sub.add_parser("mixkit-get"); s2.add_argument("items", nargs="+"); s2.add_argument("--out", default="media")
    s3 = sub.add_parser("openverse"); s3.add_argument("query"); s3.add_argument("--license", default="cc0,pdm")
    s3.add_argument("--n", type=int, default=12); s3.add_argument("--get", type=int, default=0)
    s3.add_argument("--pick", default=""); s3.add_argument("--out", default="media")
    a = ap.parse_args()
    if a.cmd == "mixkit-search":
        for slug in mixkit_search(a.term):
            print(slug)
    elif a.cmd == "mixkit-get":
        mixkit_get(a.items, a.out)
    else:
        res = openverse(a.query, a.license, a.n)
        picks = [x for x in a.pick.split(",") if x]
        chosen = [r for r in res if r["id"] in picks] if picks else res[: a.get]
        for r in res:
            print(r["id"], r["license"], r["source"], f'{r.get("width")}x{r.get("height")}', "|", (r.get("title") or "")[:50])
        for r in chosen:
            ext = os.path.splitext(urllib.parse.urlparse(r["url"]).path)[1] or ".jpg"
            dest = os.path.join(a.out, f'ov-{r["source"]}-{r["id"][:8]}{ext}')
            os.makedirs(a.out, exist_ok=True)
            open(dest, "wb").write(get(r["url"]))
            log(a.out, f'{os.path.basename(dest)} - "{r.get("title")}" by {r.get("creator") or "unknown"} via {r["source"]} - {r.get("foreign_landing_url")} - {r["license"].upper()} {r.get("license_version") or ""}')
            print("ok", dest)


if __name__ == "__main__":
    main()
