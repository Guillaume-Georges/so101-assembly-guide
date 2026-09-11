"""Fixtures are the log shapes that misclassified traffic in the first hand analysis (2026-09-11).

IPs are documentation ranges (RFC 5737 / RFC 3849); no real visitor appears here.
"""

import gzip
import json

import pytest

import kitsmith_traffic as kt

UA_MAC = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/149.0.0.0 Safari/537.36"
)
UA_ANDROID = (
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36"
)
UA_HEADLESS = UA_MAC.replace("Chrome/", "HeadlessChrome/")
HF = "https://kitsmith-so101-assembly-guide.static.hf.space/"

HOME = "192.0.2.10"  # owner ISP (via ASN fallback)
RESIDENTIAL = "198.51.100.20"
DC = "203.0.113.30"
V6_PERSON = "2001:db8:1::5"


def line(ip, sec, path, ref="-", ua=UA_MAC, extra=None, status=200):
    ts = f"10/Sep/2026:12:{sec // 60:02d}:{sec % 60:02d} +0000"
    s = f'{ip} - - [{ts}] "GET {path} HTTP/2.0" {status} 100 "{ref}" "{ua}"'
    if extra is not None:
        s += " " + " ".join(f'"{x}"' for x in extra)
    return s + "\n"


@pytest.fixture
def asn_db(tmp_path):
    rows = [
        ("192.0.2.0", "192.0.2.255", "64500", "LA", "HOME-ISP - Owner Telecom"),
        ("198.51.100.0", "198.51.100.255", "64501", "PL", "SMALL-ISP - Village Net"),
        ("203.0.113.0", "203.0.113.255", "64502", "US", "DIGITALOCEAN-ASN - DigitalOcean, LLC"),
        ("2001:db8::", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", "64503", "FR", "AS3215 - Orange S.A."),
    ]
    p = tmp_path / "asn.tsv.gz"
    with gzip.open(p, "wt") as fh:
        for r in rows:
            fh.write("\t".join(r) + "\n")
    return str(p)


def run(lines, asn_db, **cfg):
    conf = dict(kt.DEFAULTS, asn_db=asn_db, own_asns=[64500], **cfg)
    rows = sorted(kt.parse(lines), key=lambda r: r["t"])
    asn = kt.asn_lookup({r["ip"] for r in rows}, asn_db)
    return kt.analyse(rows, conf, asn)


def test_asn_lookup_v4_and_v6(asn_db):
    got = kt.asn_lookup({HOME, DC, V6_PERSON, "100.64.0.1"}, asn_db)
    assert got[HOME][0] == 64500
    assert got[DC][2].startswith("DIGITALOCEAN")
    assert got[V6_PERSON][0] == 64503
    assert "100.64.0.1" not in got


def test_viewer_json_is_not_a_probe(asn_db):
    """The 3D viewer fetches data/*.json and geometry/placements.json; a `.json` probe rule caught real people."""
    lines = [
        line(RESIDENTIAL, 0, "/so101/embed/follower/001-follower-clean-printed-parts/", ref=HF),
        line(RESIDENTIAL, 1, "/so101/data/follower.json", ref="https://kitsmith.dev/so101/"),
        line(RESIDENTIAL, 1, "/so101/geometry/placements.json", ref="https://kitsmith.dev/so101/"),
        line(RESIDENTIAL, 1, "/so101/geometry/base-so101.glb", ref="https://kitsmith.dev/so101/"),
    ]
    rep = run(lines, asn_db)
    assert rep["classes"]["scanner"]["requests"] == 0
    assert rep["people"]["likely_visitors"] == 1
    assert rep["people"]["likely_embed_only"] == 1
    assert rep["people"]["referrers"] == {"kitsmith-so101-assembly-guide.static.hf.space": 1}


def test_forged_search_referrer_is_a_scanner(asn_db):
    lines = [line("203.0.113.77", s, "//images/images/cache.php", ref="www.google.com") for s in range(3)]
    rep = run(lines, asn_db)
    assert rep["classes"]["scanner"]["ips"] == 1
    assert rep["people"]["referrers"] == {}
    assert any("www.google.com" in k for k in rep["forged_referrers"])


def test_owner_cookie_splits_browser_and_automation(asn_db):
    lines = [
        line(DC, 0, "/so101/", extra=["1", "TH"]),  # owner on a VPN exit: cookie wins over datacenter
        line(DC, 5, "/so101/follower/", extra=["1", "TH"]),
        line(DC, 9, "/so101/", ua="curl/8.7.1", extra=["auto", "TH"]),
    ]
    rep = run(lines, asn_db)
    assert rep["classes"]["own_browser"]["pages"] == 2
    assert rep["classes"]["own_automation"]["pages"] == 1
    assert rep["classes"]["crawler"]["requests"] == 0
    assert rep["window"]["owner_cookie_requests"] == 3


def test_owner_asn_fallback_and_headless(asn_db):
    lines = [line(HOME, 0, "/so101/"), line(HOME, 2, "/so101/", ua=UA_HEADLESS)]
    rep = run(lines, asn_db)
    assert rep["classes"]["own_browser"]["requests"] == 1
    assert rep["classes"]["own_automation"]["requests"] == 1


def test_owner_cidr_fallback(asn_db):
    rep = run([line(V6_PERSON, 0, "/so101/")], asn_db, own_cidrs=["2001:db8:1::/48"])
    assert rep["classes"]["own_browser"]["requests"] == 1


def test_datacenter_is_crawler_unless_it_arrived_from_a_real_page(asn_db):
    crawler = [line(DC, 0, "/"), line(DC, 0, "/so101/")]
    assert run(crawler, asn_db)["classes"]["crawler"]["ips"] == 1
    via_hf = [line(DC, 0, "/so101/follower/011-x/", ref=HF, ua=UA_ANDROID)]
    assert run(via_hf, asn_db)["people"]["likely_visitors"] == 1


def test_human_pace_vs_burst(asn_db):
    reader = [
        line(RESIDENTIAL, s, f"/so101/follower/{s:03d}-step/", ref="https://kitsmith.dev/so101/")
        for s in (0, 6, 20, 31)
    ]
    rep = run(reader, asn_db)
    assert rep["people"]["likely_visitors"] == 1
    burst = [line(V6_PERSON, 0, p) for p in ("/", "/so101/", "/so101/kits/", "/so101/faq/")]
    rep = run(burst, asn_db)
    assert rep["people"]["likely_visitors"] == 0
    assert rep["people"]["unconfirmed_visitors"] == 1


def test_declared_bots_and_link_shares(asn_db):
    lines = [
        line(
            "198.51.100.99", 0, "/so101/", ua="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
        ),
        line("198.51.100.98", 0, "/so101/", ua="Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"),
        line(
            "198.51.100.97",
            0,
            "/so101/",
            ua="Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4)",
        ),
        line("66.249.73.129", 0, "/so101/", ua=UA_ANDROID),  # Google renderer without a bot UA
    ]
    rep = run(lines, asn_db)
    assert rep["classes"]["search_engine"]["ips"] == 2
    assert rep["classes"]["link_preview"]["ips"] == 1
    assert rep["classes"]["ai_crawler"]["ips"] == 1
    assert rep["link_shares"][0]["bot"] == "Discordbot"


def test_parses_legacy_and_kitsmith_format():
    legacy = kt.parse([line(HOME, 0, "/")])
    new = kt.parse([line(HOME, 0, "/", extra=["-", "LA"])])
    assert legacy[0]["self"] is None and legacy[0]["cc"] is None
    assert new[0]["self"] is None and new[0]["cc"] == "LA"


def test_ssh_forced_command_takes_only_known_subcommands(monkeypatch, tmp_path, asn_db, capsys):
    log = tmp_path / "kitsmith.dev.access.log"
    log.write_text(line(HOME, 0, "/so101/"))
    conf = tmp_path / "conf.json"
    conf.write_text(json.dumps({"log_glob": str(log) + "*", "asn_db": asn_db, "asn_max_age_days": 10**6}))
    monkeypatch.setattr(kt, "CONFIG_PATH", str(conf))

    monkeypatch.setenv("SSH_ORIGINAL_COMMAND", "rm -rf /")
    with pytest.raises(SystemExit):
        kt.main(["--ssh"])

    monkeypatch.setenv("SSH_ORIGINAL_COMMAND", "summary --days 36500; cat /etc/passwd")
    with pytest.raises(SystemExit):
        kt.main(["--ssh"])

    monkeypatch.setenv("SSH_ORIGINAL_COMMAND", "kitsmith-traffic summary --days 36500")
    assert kt.main(["--ssh"]) == 0
    assert json.loads(capsys.readouterr().out)["window"]["requests"] == 1


def test_cookie_tags_requests_not_the_ip(asn_db):
    """CI runners and VPN exits are shared: a tagged request must not swallow a visitor on the same IP."""
    lines = [
        line(DC, 0, "/so101/", ua="curl/8.7.1", extra=["auto", "US"]),  # deploy smoke check
        line(DC, 300, "/so101/", ref=HF, ua=UA_ANDROID, extra=["-", "US"]),  # a visitor on the same exit
    ]
    rep = run(lines, asn_db)
    assert rep["classes"]["own_automation"]["requests"] == 1
    assert rep["people"]["likely_visitors"] == 1


def test_search_referrer_alone_is_not_a_person(asn_db):
    rep = run([line(RESIDENTIAL, 0, "/so101/", ref="https://bing.com/")], asn_db)
    assert rep["people"]["likely_visitors"] == 0
    assert rep["people"]["referrers"] == {}
    assert rep["people"]["referrers_unconfirmed"] == {"bing.com": 1}


def test_asset_only_session_is_not_a_visit_in_any_table(asn_db):
    lines = [line(RESIDENTIAL, 0, "/favicon.ico"), line(RESIDENTIAL, 1, "/apple-touch-icon.png")]
    rep = run(lines, asn_db)
    assert rep["visitors"] == []
    assert rep["classes"]["people_unconfirmed"]["requests"] == 0
    assert rep["classes"]["crawler"]["requests"] == 2


def test_stale_asn_data_is_flagged_not_refetched(monkeypatch, tmp_path, asn_db, capsys):
    import os

    os.utime(asn_db, (0, 0))
    log = tmp_path / "kitsmith.dev.access.log"
    log.write_text(line(HOME, 0, "/so101/"))
    conf = tmp_path / "conf.json"
    conf.write_text(json.dumps({"log_glob": str(log) + "*", "asn_db": asn_db}))
    monkeypatch.setattr(kt, "CONFIG_PATH", str(conf))

    def no_network(cfg):
        raise AssertionError("must not download when the file exists")

    monkeypatch.setattr(kt, "refresh_asn_db", no_network)
    assert kt.main(["summary", "--days", "36500"]) == 0
    assert any("days old" in n for n in json.loads(capsys.readouterr().out)["notes"])
