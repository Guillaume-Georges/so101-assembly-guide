#!/usr/bin/env python3
"""kitsmith-traffic: who is visiting kitsmith.dev, from the origin nginx logs.

Splits traffic into the owner (browser / automation), people, search engines, declared bots and
undeclared crawlers or exploit scanners, and reports genuine referrers. Stdlib only; installed on
the droplet as /usr/local/bin/kitsmith-traffic and reached by agents through an SSH forced command.
Operator guide: docs/ops/traffic-report.md. Decision record: docs/adr/0003-traffic-from-origin-logs.md.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import glob
import gzip
import ipaddress
import json
import os
import re
import shlex
import socket
import statistics
import sys
import tempfile
import urllib.request

CONFIG_PATH = os.environ.get("KITSMITH_TRAFFIC_CONFIG", "/etc/kitsmith-traffic.json")
DEFAULTS = {
    "log_glob": "/var/log/nginx/kitsmith.dev.access.log*",
    "asn_db": "/var/lib/kitsmith-traffic/ip2asn-combined.tsv.gz",
    "asn_url": "https://iptoasn.com/data/ip2asn-combined.tsv.gz",
    "asn_max_age_days": 30,
    # Owner fallback for requests without the ks_self cookie (other devices, third-party iframes).
    # Kept in the server-side config, never in the repo: it says where the owner lives.
    "own_asns": [],
    "own_cidrs": [],
    "site_hosts": ["kitsmith.dev", "www.kitsmith.dev"],
}

# combined format, optionally followed by the kitsmith fields: "$cookie_ks_self" "$http_cf_ipcountry"
LINE = re.compile(
    r'(?P<ip>\S+) \S+ \S+ \[(?P<time>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+)[^"]*" '
    r'(?P<status>\d{3}) (?P<bytes>\d+) "(?P<ref>[^"]*)" "(?P<ua>[^"]*)"'
    r'(?: "(?P<self>[^"]*)" "(?P<cc>[^"]*)")?'
)

ASSET = re.compile(r"\.(js|mjs|css|glb|bin|png|jpe?g|svg|ico|webp|avif|woff2?|webmanifest|xml|txt|json|map)$", re.I)
AUTOMATION_UA = re.compile(r"HeadlessChrome|curl/|python-|Playwright|Wget", re.I)
PROBE = re.compile(
    r"wp-|\.env|\.php|cgi-bin|/\.git|//images|phpinfo|\.aws|xmlrpc|/admin|\.sql$|\.bak$|actuator"
    r"|server-status|\.DS_Store|/config\.|/vendor/|/api/|/open/visitors|/\.well-known/(?!security\.txt)",
    re.I,
)
# Geometry and data JSON are fetched by the 3D viewer on every real visit: never probes.
VIEWER_DATA = re.compile(r"^/[a-z0-9-]+/(geometry|data)/")

BOT_KINDS = [
    (
        "search_engine",
        r"Googlebot|Google-InspectionTool|GoogleOther|bingbot|BingPreview|DuckDuckBot|YandexBot|Baiduspider|Applebot|Qwantbot|SeznamBot",
    ),
    (
        "ai_crawler",
        r"GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Bytespider|Amazonbot|meta-externalagent|Google-Extended|cohere-ai|Diffbot|YouBot|MistralAI",
    ),
    (
        "link_preview",
        r"Discordbot|Slackbot|Twitterbot|facebookexternalhit|LinkedInBot|WhatsApp|TelegramBot|redditbot|Mastodon|Bluesky|Iframely|Embedly|SkypeUriPreview|vkShare|Pinterest",
    ),
    (
        "other_bot",
        r"bot\b|bot/|crawl|spider|slurp|scan|curl|wget|python|go-http|okhttp|axios|node-fetch|java/|libwww|zgrab|masscan|censys|nuclei|nikto|dataprovider|monitor|uptime|headless|lighthouse|measurement|expanse|researchscan|^-$|^$",
    ),
]
BOT_KINDS = [(k, re.compile(p, re.I)) for k, p in BOT_KINDS]

# Google's crawl/render ranges; the rest of AS15169 includes consumer VPN exits (people).
GOOGLE_CRAWL = [ipaddress.ip_network(n) for n in ("66.249.64.0/19", "66.102.0.0/20", "2001:4860:4801::/48")]
DATACENTER_ASN_NAME = re.compile(
    r"amazon|google-cloud|microsoft|ovh|hetzner|digitalocean|linode|akamai|tencent|alibaba|aliyun"
    r"|scaleway|contabo|leaseweb|choopa|vultr|constant company|oracle|datacamp|cdn77|cloudflare"
    r"|hostinger|hostroyale|quickpacket|reliablesite|logicweb|web2objects|glesys|mevspace|estnoc"
    r"|owl limited|siamdata|h4y|psychz|zenlayer|huawei|ucloud|[-\s]idc\b|internet-measurement|censys"
    r"|shodan|onyphe|stark|pfcloud|colocrossing|colocation|clouvider|worldstream|frantech|aeza|timeweb|selectel"
    r"|hostkey|ipxo|kaspersky|m247|internetbolaget|surfsafe|ionos|netcup|dataprovider|iway|level3|level 3"
    r"|lumen|gtt-backbone|oculus|sundance|facebook|apple-engineering|g-core|gcore|tzulo|heymman"
    r"|vpsdedicated|fairyhosting|hostgnome|limestone|cnserver|unmanaged|dedicated|hosting|servers?\b"
    r"|online sas|cdnext|hr-customer|iweb|\bghost\b|kl-ext|trunknetworks|blnwx|driftnet"
    r"|datacenter|data center|vps|cloud",
    re.I,
)
SEARCH_REFERRER = re.compile(r"google\.|bing\.|yahoo\.|duckduckgo\.|yandex\.|baidu\.|ecosia\.|qwant\.")
SESSION_GAP = dt.timedelta(minutes=30)


# ---------------------------------------------------------------- config and input


def load_config() -> dict:
    cfg = dict(DEFAULTS)
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as fh:
            cfg.update(json.load(fh))
    return cfg


def log_files(pattern: str) -> list[str]:
    """Oldest first: access.log.N.gz ... access.log.1, access.log."""

    def rank(path: str) -> int:
        m = re.search(r"\.log\.(\d+)", path)
        return int(m.group(1)) if m else 0

    return sorted(glob.glob(pattern), key=rank, reverse=True)


def read_lines(files: list[str]):
    for path in files:
        opener = gzip.open if path.endswith(".gz") else open
        with opener(path, "rt", errors="replace") as fh:
            yield from fh


def parse(lines, since: dt.datetime | None = None) -> list[dict]:
    rows = []
    for line in lines:
        m = LINE.match(line)
        if not m:
            continue
        r = m.groupdict()
        r["t"] = dt.datetime.strptime(r["time"], "%d/%b/%Y:%H:%M:%S %z")
        if since and r["t"] < since:
            continue
        r["self"] = r["self"] if r["self"] not in (None, "", "-") else None
        r["cc"] = r["cc"] if r["cc"] not in (None, "", "-", "XX") else None
        r["is_page"] = r["method"] in ("GET", "HEAD") and not ASSET.search(r["path"].split("?")[0])
        rows.append(r)
    return rows


# ---------------------------------------------------------------- ASN lookup (iptoasn, PDDL)


def _ip_int(ip: str) -> tuple[int, int]:
    """(family, integer) so v4 and v6 never compare equal."""
    if ":" in ip:
        return 6, int.from_bytes(socket.inet_pton(socket.AF_INET6, ip), "big")
    return 4, int.from_bytes(socket.inet_aton(ip), "big")


def asn_lookup(ips: set[str], db_path: str) -> dict[str, tuple[int, str, str]]:
    """Map each IP to (asn, country, name) by one streaming pass over the sorted iptoasn TSV."""
    out: dict[str, tuple[int, str, str]] = {}
    if not os.path.exists(db_path):
        return out
    queries = {4: [], 6: []}
    for ip in ips:
        try:
            fam, n = _ip_int(ip)
        except OSError:
            continue
        queries[fam].append((n, ip))
    for q in queries.values():
        q.sort()
    pos = {4: 0, 6: 0}
    with gzip.open(db_path, "rt", errors="replace") as fh:
        for line in fh:
            start, end, asn, cc, name = (line.rstrip("\n").split("\t") + ["", "", "", "", ""])[:5]
            fam = 6 if ":" in start else 4
            q, i = queries[fam], pos[fam]
            if i >= len(q):
                if all(pos[f] >= len(queries[f]) for f in (4, 6)):
                    break
                continue
            e = _ip_int(end)[1]
            while i < len(q) and q[i][0] <= e:
                n, ip = q[i]
                if n >= _ip_int(start)[1] and asn != "0":
                    out[ip] = (int(asn), cc, name)
                i += 1
            pos[fam] = i
    return out


def refresh_asn_db(cfg: dict) -> str:
    path = cfg["asn_db"]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".part")
    with os.fdopen(fd, "wb") as fh, urllib.request.urlopen(cfg["asn_url"], timeout=60) as resp:
        while chunk := resp.read(1 << 16):
            fh.write(chunk)
    os.replace(tmp, path)
    return path


def asn_age_days(path: str) -> float | None:
    if not os.path.exists(path):
        return None
    return (dt.datetime.now().timestamp() - os.path.getmtime(path)) / 86400


# ---------------------------------------------------------------- classification


def bot_kind(ua: str) -> str | None:
    for kind, rx in BOT_KINDS:
        if rx.search(ua):
            return kind
    return None


def in_nets(ip: str, nets) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in n for n in nets)


def ref_host(ref: str) -> str | None:
    m = re.match(r"https?://([^/:]+)", ref)
    return m.group(1).lower() if m else None


def genuine_referrer(ref: str, site_hosts) -> str | None:
    """External referrer host, or None. Scheme-less or IP-literal referrers are forged."""
    if ref in ("", "-"):
        return None
    host = ref_host(ref)
    if host is None or re.fullmatch(r"[\d.]+|\[?[0-9a-f:]+\]?", host) or host in ("localhost",):
        return None
    if host in site_hosts:
        return None
    return host


def arrived_from_real_page(rr: list[dict], site_hosts) -> bool:
    for r in rr:
        host = genuine_referrer(r["ref"], site_hosts)
        if host and not SEARCH_REFERRER.search(host):
            return True
    return False


def classify(rows: list[dict], cfg: dict, asn: dict) -> dict[str, str]:
    """IP -> class, for requests WITHOUT the owner cookie (cookie requests are tagged per request).

    The cookie must never promote an IP: CI runners, VPN exits and mobile CGNAT are shared, and a
    visitor behind the same address would vanish into the owner's traffic.
    """
    own_asns = set(cfg["own_asns"])
    own_nets = [ipaddress.ip_network(c) for c in cfg["own_cidrs"]]
    by_ip: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        by_ip[r["ip"]].append(r)
    out = {}
    for ip, rr in by_ip.items():
        a = asn.get(ip)
        if ip.startswith("127.") or ip == "::1" or (a and a[0] in own_asns) or in_nets(ip, own_nets):
            out[ip] = "own"
        elif any(PROBE.search(r["path"]) and not VIEWER_DATA.match(r["path"]) for r in rr):
            out[ip] = "scanner"
        else:
            ua = collections.Counter(r["ua"] for r in rr).most_common(1)[0][0]
            kind = bot_kind(ua)
            if kind:
                out[ip] = kind
            elif in_nets(ip, GOOGLE_CRAWL):
                out[ip] = "search_engine"
            elif a and DATACENTER_ASN_NAME.search(a[2]) and not arrived_from_real_page(rr, cfg["site_hosts"]):
                # A datacenter IP counts as a person only when it came from a real page (VPN users do).
                # A search-engine referrer from a datacenter is the forged-referrer pattern, not a click.
                out[ip] = "crawler"
            else:
                out[ip] = "person?"
    return out


def sessions(rr: list[dict]) -> list[list[dict]]:
    out, cur = [], []
    for r in sorted(rr, key=lambda r: r["t"]):
        if cur and r["t"] - cur[-1]["t"] > SESSION_GAP:
            out.append(cur)
            cur = []
        cur.append(r)
    if cur:
        out.append(cur)
    return out


def is_embed(path: str) -> bool:
    return bool(re.match(r"^/[a-z0-9-]+/embed/", path))


def session_tier(sess: list[dict], site_hosts) -> str:
    """likely: arrived from a real external page, or read 2+ pages at a human pace.

    A search-engine referrer alone is not enough: scanners forge them, from residential proxies too.
    Real search clicks are counted by Search Console; here they need the pacing test like anyone else.
    """
    pages = [r for r in sess if r["is_page"]]
    if arrived_from_real_page(sess, site_hosts):
        return "likely"
    distinct = {r["path"] for r in pages}
    if len(distinct) >= 2:
        gaps = [(b["t"] - a["t"]).total_seconds() for a, b in zip(pages, pages[1:], strict=False)]
        if statistics.median(gaps) >= 2:
            return "likely"
    return "unconfirmed"


def request_class(r: dict, ip_class: str) -> str:
    if ip_class == "own":
        if r["self"] == "auto" or AUTOMATION_UA.search(r["ua"]):
            return "own_automation"
        return "own_browser"
    return ip_class


# ---------------------------------------------------------------- reports

CLASS_ORDER = [
    "own_browser",
    "own_automation",
    "people_likely",
    "people_unconfirmed",
    "search_engine",
    "ai_crawler",
    "link_preview",
    "other_bot",
    "crawler",
    "scanner",
]


def analyse(rows: list[dict], cfg: dict, asn: dict) -> dict:
    for r in rows:
        if r["self"]:
            r["cls"] = request_class(r, "own")
    untagged = [r for r in rows if not r["self"]]
    ip_class = classify(untagged, cfg, asn)
    by_ip: dict[str, list[dict]] = collections.defaultdict(list)
    for r in untagged:
        by_ip[r["ip"]].append(r)

    visitors = []
    for ip, rr in by_ip.items():
        if ip_class[ip] != "person?":
            continue
        for sess in sessions(rr):
            pages = [r["path"] for r in sess if r["is_page"]]
            if not pages:
                for r in sess:
                    r["cls"] = "crawler"  # favicon/asset fetches with no page are not a visit
                continue
            tier = session_tier(sess, cfg["site_hosts"])
            for r in sess:
                r["cls"] = "people_" + tier
            refs = [genuine_referrer(r["ref"], cfg["site_hosts"]) for r in sess]
            a = asn.get(ip, (0, "", ""))
            visitors.append(
                {
                    "start": sess[0]["t"].isoformat(),
                    "minutes": round((sess[-1]["t"] - sess[0]["t"]).total_seconds() / 60, 1),
                    "tier": tier,
                    "ip": ip,
                    "network": a[2],
                    "asn": a[0],
                    "country": next((r["cc"] for r in sess if r["cc"]), a[1] or None),
                    "device": device(sess[0]["ua"]),
                    "referrer": next((x for x in refs if x), None),
                    "pages": len(pages),
                    "embed_only": bool(pages) and all(is_embed(p) for p in pages),
                    "paths": pages[:12],
                }
            )
    for r in rows:
        if "cls" not in r:
            r["cls"] = request_class(r, ip_class[r["ip"]])

    totals = {c: {"ips": set(), "pages": 0, "requests": 0} for c in CLASS_ORDER}
    daily: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for r in rows:
        t = totals[r["cls"]]
        t["ips"].add(r["ip"])
        t["requests"] += 1
        if r["is_page"]:
            t["pages"] += 1
            daily[r["t"].strftime("%Y-%m-%d")][r["cls"]] += 1
    for t in totals.values():
        t["ips"] = len(t["ips"])

    people = [v for v in visitors if v["tier"] == "likely"]
    refs = collections.Counter(v["referrer"] or "(none)" for v in people)
    refs_unconfirmed = collections.Counter(v["referrer"] for v in visitors if v["tier"] != "likely" and v["referrer"])
    forged = collections.Counter()
    for r in rows:
        h = ref_host(r["ref"]) if r["ref"] not in ("", "-") else None
        if r["cls"] in ("scanner", "crawler", "other_bot") and h and SEARCH_REFERRER.search(h):
            forged[h] += 1
        elif r["ref"] not in ("", "-") and h is None:
            forged["(no scheme) " + r["ref"][:40]] += 1
    shares = [
        {"time": r["t"].isoformat(), "bot": bot_name(r["ua"]), "path": r["path"]}
        for r in rows
        if r["cls"] == "link_preview" and r["is_page"]
    ]
    top_pages = collections.Counter(
        r["path"] for r in rows if r["cls"] in ("people_likely", "people_unconfirmed") and r["is_page"]
    )

    return {
        "window": {
            "from": rows[0]["t"].isoformat() if rows else None,
            "to": rows[-1]["t"].isoformat() if rows else None,
            "requests": len(rows),
            "owner_cookie_requests": sum(1 for r in rows if r["self"]),
        },
        "classes": totals,
        "daily_pages": {d: dict(c) for d, c in sorted(daily.items())},
        "people": {
            "likely_visitors": len(people),
            "likely_embed_only": sum(1 for v in people if v["embed_only"]),
            "unconfirmed_visitors": sum(1 for v in visitors if v["tier"] == "unconfirmed"),
            "referrers": dict(refs.most_common()),
            "referrers_unconfirmed": dict(refs_unconfirmed.most_common()),
            "top_pages": dict(top_pages.most_common(10)),
        },
        "forged_referrers": dict(forged.most_common(10)),
        "link_shares": shares,
        "visitors": sorted(visitors, key=lambda v: v["start"]),
    }


def device(ua: str) -> str:
    for label, rx in (
        ("iPhone", "iPhone"),
        ("iPad", "iPad"),
        ("Android", "Android"),
        ("Mac", "Macintosh"),
        ("Windows", "Windows"),
        ("Linux", "Linux"),
    ):
        if rx in ua:
            return label
    return "other"


def bot_name(ua: str) -> str:
    m = re.search(r"([A-Za-z-]*(?:bot|Bot|hit|Expanding)[A-Za-z-]*)", ua)
    return m.group(1) if m else ua[:40]


def mask_ip(ip: str) -> str:
    try:
        net = ipaddress.ip_network(ip + ("/48" if ":" in ip else "/24"), strict=False)
    except ValueError:
        return ip
    return str(net)


# ---------------------------------------------------------------- rendering

LABELS = {
    "own_browser": "You, browser",
    "own_automation": "You, automation",
    "people_likely": "People (likely)",
    "people_unconfirmed": "People (unconfirmed)",
    "search_engine": "Search engines",
    "ai_crawler": "AI crawlers",
    "link_preview": "Link previews",
    "other_bot": "Other declared bots",
    "crawler": "Undeclared crawlers",
    "scanner": "Exploit scanners",
}


def md_summary(rep: dict, notes: list[str]) -> str:
    w, p = rep["window"], rep["people"]
    out = [
        f"# kitsmith.dev traffic {w['from'][:16]} → {w['to'][:16]} UTC",
        "",
        f"**People:** {p['likely_visitors']} likely visits ({p['likely_embed_only']} saw only an embed), "
        f"{p['unconfirmed_visitors']} unconfirmed single-page hits.",
        "",
        "| Class | IPs | Pages | Requests |",
        "|---|--:|--:|--:|",
    ]
    for c in CLASS_ORDER:
        t = rep["classes"][c]
        out.append(f"| {LABELS[c]} | {t['ips']} | {t['pages']} | {t['requests']} |")
    cols = ["own_browser", "own_automation", "people_likely", "people_unconfirmed", "search_engine"]
    out += [
        "",
        "| Day | " + " | ".join(LABELS[c] for c in cols) + " | Bots + crawlers |",
        "|---" * (len(cols) + 2) + "|",
    ]
    for d, c in rep["daily_pages"].items():
        rest = sum(v for k, v in c.items() if k not in cols)
        out.append(f"| {d} | " + " | ".join(str(c.get(k, 0)) for k in cols) + f" | {rest} |")
    out += [
        "",
        "**Referrers (likely people):** " + (", ".join(f"{k} {v}" for k, v in p["referrers"].items()) or "none"),
    ]
    if p["referrers_unconfirmed"]:
        out.append(
            "**Referrers on unconfirmed hits** (one page; search ones may be forged, Search Console is the authority): "
            + ", ".join(f"{k} {v}" for k, v in p["referrers_unconfirmed"].items())
        )
    if rep["forged_referrers"]:
        out.append(
            "**Forged referrers ignored:** " + ", ".join(f"{k} ×{v}" for k, v in rep["forged_referrers"].items())
        )
    if rep["link_shares"]:
        out.append(
            "**Link shares seen:** "
            + ", ".join(f"{s['bot']} {s['time'][5:16]} {s['path']}" for s in rep["link_shares"][:12])
        )
    if p["top_pages"]:
        out.append("**Top pages (people):** " + ", ".join(f"{k} {v}" for k, v in p["top_pages"].items()))
    out += [f"- {n}" for n in notes]
    return "\n".join(out) + "\n"


def md_visitors(visitors: list[dict]) -> str:
    out = [
        "| Start (UTC) | Tier | Network | CC | Device | Referrer | Pages | Paths |",
        "|---|---|---|---|---|---|--:|---|",
    ]
    for v in visitors:
        out.append(
            f"| {v['start'][:16]} | {v['tier']} | {v['network'][:28]} | {v['country'] or ''} | {v['device']} | "
            f"{v['referrer'] or ''} | {v['pages']} | {' → '.join(v['paths'][:5])} |"
        )
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------- CLI


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="kitsmith-traffic", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, helptext in (
        ("summary", "traffic by class, per day, referrers, link shares"),
        ("visitors", "sessions from people (likely and unconfirmed)"),
    ):
        p = sub.add_parser(name, help=helptext)
        p.add_argument("--days", type=float, default=7, help="look back this many days (default 7)")
        p.add_argument("--md", action="store_true", help="markdown instead of JSON")
        p.add_argument("--full-ip", action="store_true", help="unmasked IPs in visitor rows")
    sub.add_parser("check", help="health: log files, format fields, ASN data age, config")
    sub.add_parser("update-asn", help="download a fresh iptoasn database")
    return ap


def notes_for(cfg: dict, rep: dict) -> list[str]:
    notes = []
    age = asn_age_days(cfg["asn_db"])
    if age is None:
        notes.append("No ASN data: datacenter detection and the owner-ASN fallback are off. Run update-asn.")
    elif age > cfg["asn_max_age_days"]:
        notes.append(f"ASN data is {age:.0f} days old; run update-asn.")
    if rep["window"]["requests"] and not rep["window"]["owner_cookie_requests"]:
        notes.append(
            "No request carried the owner cookie in this window; owner detection relied on the ASN/CIDR fallback."
        )
    return notes


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    if argv[:1] == ["--ssh"]:
        # SSH forced command: the client's command line arrives here, never through a shell.
        argv = shlex.split(os.environ.get("SSH_ORIGINAL_COMMAND", "") or "summary --md")
        if argv[:1] == ["kitsmith-traffic"]:
            argv = argv[1:]
    args = build_parser().parse_args(argv)
    cfg = load_config()

    if args.cmd == "update-asn":
        print(json.dumps({"updated": refresh_asn_db(cfg)}))
        return 0

    files = log_files(cfg["log_glob"])
    if args.cmd == "check":
        sample = parse(read_lines(files[-1:])) if files else []
        print(
            json.dumps(
                {
                    "config": CONFIG_PATH if os.path.exists(CONFIG_PATH) else None,
                    "log_files": files,
                    "readable": all(os.access(f, os.R_OK) for f in files),
                    "current_log_has_kitsmith_fields": any(r["cc"] is not None or r["self"] for r in sample),
                    "asn_db_age_days": asn_age_days(cfg["asn_db"]),
                    "own_asns": cfg["own_asns"],
                    "own_cidrs": cfg["own_cidrs"],
                },
                indent=2,
            )
        )
        return 0

    since = dt.datetime.now(dt.UTC) - dt.timedelta(days=args.days)
    rows = parse(read_lines(files), since)
    rows.sort(key=lambda r: r["t"])
    if asn_age_days(cfg["asn_db"]) is None:
        # Download only when missing. A stale file is flagged in the notes instead: if the box can't
        # reach iptoasn, retrying on every run would stall each report for the whole timeout.
        try:
            refresh_asn_db(cfg)
        except OSError:
            pass  # reported in notes; the report still runs without it
    asn = asn_lookup({r["ip"] for r in rows}, cfg["asn_db"])
    rep = analyse(rows, cfg, asn)
    if not args.full_ip:
        for v in rep["visitors"]:
            v["ip"] = mask_ip(v["ip"])
    notes = notes_for(cfg, rep)

    if args.cmd == "visitors":
        if args.md:
            sys.stdout.write(md_visitors(rep["visitors"]))
        else:
            print(json.dumps(rep["visitors"], indent=2))
    elif args.md:
        sys.stdout.write(md_summary(rep, notes))
    else:
        rep = {k: v for k, v in rep.items() if k != "visitors"}
        rep["notes"] = notes
        print(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
