# ADR-0003 — Traffic reporting from the origin access log

Status: accepted (2026-09-11). Amends the **Analytics** line of ADR-0002:
visitors stay cookieless and unscripted; the owner may tag their own browsers.

## Context

Cloudflare Web Analytics counts visits but cannot tell the owner's visits
from anyone else's, and its zone traffic numbers are mostly bots. The
questions that matter in launch weeks ("is anyone other than us reading
this, and where from?") need three things it cannot give: the owner split
out, declared and undeclared bots split out, and genuine referrers told
apart from forged ones. A hand analysis of the first four days
(2026-09-07 → 11) found that 96% of origin page loads were crawlers,
scanners or the owner, and that every `google.com`/`bing.com` referrer was
forged by a scanner.

The nginx access log on the origin already records every HTML request
(Cloudflare returns `DYNAMIC` for HTML, so none is served from the edge),
with the real client IP (`real_ip_header CF-Connecting-IP`).

## Decision

- **Classify the access log we already keep.** `deploy/stats/kitsmith_traffic.py`
  (stdlib Python, installed as `/usr/local/bin/kitsmith-traffic`) splits
  requests into owner (browser / automation), people (likely /
  unconfirmed), search engines, AI crawlers, link previews, other declared
  bots, undeclared crawlers and exploit scanners. Rules and their
  failure-case fixtures live in `deploy/stats/`.
- **Offline network lookup.** IP → network uses the iptoasn database
  (PDDL, public domain) stored on the server. It is downloaded when
  missing, and `update-asn` refreshes it on demand. The report flags it
  once it is older than 30 days. No visitor IP is sent to a third party.
- **The owner tags themselves.** Opening `/_self` sets a first-party cookie,
  `ks_self=1`, on that browser only. nginx writes it to the access log.
  Automation sends `ks_self=auto`. The cookie tags requests, never an IP:
  CI runners, VPN exits and mobile CGNAT are shared with strangers.
  Nothing on the site reads the cookie and visitors never get it. The owner's ISP in the server-side config
  (`/etc/kitsmith-traffic.json`, not in the repo) is the fallback.
- **The log format gains two fields** (`$cookie_ks_self`,
  `$http_cf_ipcountry`), defined for this vhost only.
- **Agents read the report over SSH with a forced command.** A dedicated
  `kitsmith-stats` user whose key can only run the report. No shell, no
  root, no raw log access.
- **Nothing is stored beyond nginx's own rotation** (14 days). No rollup,
  no database.

## Consequences

- A report takes about a second: `ssh kitsmith-stats summary --md`.
  Operator guide: `docs/ops/traffic-report.md`.
- "Is it growing" can only be answered over 14 days unless someone keeps
  the reports.
- People who reach the site through a VPN or a datacenter IP count as
  people only when they arrive from a real page (e.g. the Hugging Face
  Space). Otherwise they are filed as crawlers. At launch-week volumes that
  undercount is small next to the bot noise it removes.
- One-page visits without a referrer stay **unconfirmed**. From the log
  alone they cannot be told apart from scanners on residential proxies.

## Considered & rejected

- **A first-party JS beacon** (a request fired from the page after real
  interaction). It is the only thing that would separate a person from a
  headless renderer, which is exactly the unconfirmed bucket. Rejected for
  now: it adds a script to every visitor's page, which is new analytics on
  every visitor, not reading a log we already keep. Revisit with its own
  ADR if the unconfirmed bucket ever matters.
- **Cloudflare Web Analytics alone.** It can't split the owner or the bots.
  It stays on as an independent human-visit count.
- **Cloudflare GraphQL analytics API.** Needs a new API token with analytics
  read, has the same owner and bot blindness, and adds a secret to manage.
- **GoAccess.** A good log viewer, but it has no owner split, no forged
  referrer rule and no datacenter classification. The classification is
  the product, not the charts.
- **Live whois lookups (Team Cymru) per run.** Sends every visitor IP to a
  third party and puts the network in the hot path.
- **Daily rollups kept past rotation.** Deferred until there is a question
  that needs more than 14 days.
