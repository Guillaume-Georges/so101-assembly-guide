# Traffic report: who is visiting kitsmith.dev

`kitsmith-traffic` reads the origin nginx access log and splits traffic into **you**, **people**,
**search engines**, **bots** and **crawlers/scanners**, with genuine referrers and link shares.
Decision record: [ADR-0003](../adr/0003-traffic-from-origin-logs.md). Code and tests:
[`deploy/stats/`](../../deploy/stats/).

## For agents: getting a report

```sh
ssh kitsmith-stats summary --md            # last 7 days, markdown tables
ssh kitsmith-stats summary --days 14       # JSON (default), the whole retained window
ssh kitsmith-stats visitors --days 2 --md  # one row per human session
ssh kitsmith-stats check                   # health: logs, format, ASN data age, config
ssh kitsmith-stats update-asn              # refresh the IP→network data now
ssh kitsmith-stats                         # no command = summary --md
```

`kitsmith-stats` is a host alias in the owner's `~/.ssh/config` (below). The key behind it can run
only this program: no shell, no files, no port forwarding. Anything else is rejected by the
program's argument parser. There is no shell to inject into. A run takes about a second.

Always quote the report's **notes** lines back to the user. They say when owner detection fell
back to the ISP rule, or when the network data is missing or stale.

### Reading the output

| Class                | Meaning                                      | Rule                                                                                                                |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `own_browser`        | You, in a browser                            | request carries `ks_self=1` (per request, never the whole IP), or comes from an owner ASN/CIDR in the server config |
| `own_automation`     | Your scripts and CI                          | `ks_self=auto`, or an owner IP with a headless/curl user agent                                                      |
| `people_likely`      | A person, with good confidence               | arrived from a real external page, or read 2+ distinct pages with a median gap ≥ 2 s                                |
| `people_unconfirmed` | Maybe a person                               | one page, no referrer, home or mobile ISP. The log can't tell these apart from scanners on residential proxies      |
| `search_engine`      | Googlebot, Bingbot, Google's renderers       | user agent, or Google's crawl ranges                                                                                |
| `ai_crawler`         | GPTBot, ClaudeBot, PerplexityBot, CCBot…     | user agent                                                                                                          |
| `link_preview`       | Discord, Slack, X, WhatsApp… fetching a card | user agent. Each one means someone pasted a link: see `link_shares`                                                 |
| `other_bot`          | Anything else that says it is a bot or tool  | user agent                                                                                                          |
| `crawler`            | Undeclared crawlers, headless renderers      | datacenter network, unless they arrived from a real page (VPN users do)                                             |
| `scanner`            | Exploit probes                               | asked for `wp-`, `.env`, `.php`, `cgi-bin`, `//images/…` and similar                                                |

- `people.referrers` counts likely people by where they came from. `(none)` means a typed URL, an
  app (Discord, Slack and mail apps strip the referrer) or a bookmark. Line `(none)` visits up with
  the `link_shares` times.
- `people.likely_embed_only` counts people who only saw a guide page inside an iframe (the Hugging
  Face Space) and never loaded kitsmith.dev itself.
- `forged_referrers` lists search-engine referrers sent by scanners. They are never counted as
  search traffic. Real search clicks show up in **Google Search Console**, not here.
- Page counts are exact (HTML is never cached at the edge). Asset counts are lower bounds (JS, CSS
  and GLBs are cached by Cloudflare).
- Requests with no page (favicon, icons only) are filed as `crawler`, never as a visit.
- `people.referrers_unconfirmed` lists referrers on one-page hits. A search referrer alone never
  makes a visit likely, since scanners forge them.
- Visitor IPs are masked to /24 (v4) or /48 (v6) unless `--full-ip` is passed.
- History is the 14 days nginx keeps (`/etc/logrotate.d/nginx`, `rotate 14`). Nothing else is
  stored.

## For the owner: tagging your traffic

Open **https://kitsmith.dev/_self** once in each browser and on each phone you use. The page
confirms the tag. It lasts 400 days (the longest browsers allow), then open it again.
`https://kitsmith.dev/_self/off` removes it.

- The cookie is `ks_self=1`, first-party, `HttpOnly`. Nothing on the site reads it and visitors
  never receive it. nginx only writes it into the access log.
- It follows you across networks (VPNs, travel), which the ISP fallback cannot.
- Blocked in third-party iframes by Brave and Safari. Your views of the Hugging Face Space from
  those browsers fall back to the ISP rule.
- Private windows and cleared cookies lose the tag.
- Scripts send it themselves: `deploy/hf-space/shots.mjs` and `docs/readme/shoot.mjs` add
  `ks_self=auto` to their Playwright context, and the deploy smoke check passes `-b ks_self=auto`.
  Do the same in any new script that loads kitsmith.dev.

The ISP fallback (`own_asns`, `own_cidrs`) lives in `/etc/kitsmith-traffic.json` on the server,
never in this repo. Keep it narrow: a VPN exit is shared with strangers, so add one only for the
days you used it and remove it once the cookie covers you.

## Server layout

| Path                                               | Owner          | What                                                                                               |
| -------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `/usr/local/bin/kitsmith-traffic`                  | root 0755      | `deploy/stats/kitsmith_traffic.py`, copied as is                                                   |
| `/etc/kitsmith-traffic.json`                       | root 0644      | owner fallback and paths (keys: `own_asns`, `own_cidrs`, `log_glob`, `asn_db`, `asn_max_age_days`) |
| `/var/lib/kitsmith-traffic/ip2asn-combined.tsv.gz` | kitsmith-stats | iptoasn data (PDDL), ~9 MB, downloaded when missing; past 30 days the notes ask for `update-asn`   |
| `/home/kitsmith-stats/.ssh/authorized_keys`        | root 0644      | the one key, with the forced command                                                               |
| `/etc/nginx/sites-available/kitsmith.dev`          | root           | defines `log_format kitsmith_v2` and `/_self`                                                      |

`kitsmith-stats` is a system user in group `adm` (to read `/var/log/nginx/*`). Its key is locked
to the forced command, so the group grants nothing a session can use. It has no password and no
sudo.

## One-time setup (root, on the droplet)

The host and root access are in the owner's private infra notes. Every nginx step follows the
box's rule: back up, `nginx -t`, **reload, never restart** (the droplet also serves another site).

```sh
# 0. From the repo checkout
scp deploy/stats/kitsmith_traffic.py root@$DROPLET:/usr/local/bin/kitsmith-traffic
scp deploy/nginx/kitsmith.dev.conf  root@$DROPLET:/etc/nginx/sites-available/kitsmith.dev.new

# 1. On the droplet
chmod 0755 /usr/local/bin/kitsmith-traffic
useradd --system --create-home --shell /bin/sh --groups adm kitsmith-stats
install -d -o kitsmith-stats -g kitsmith-stats -m 0755 /var/lib/kitsmith-traffic
printf '%s\n' '{"own_asns": [<owner ASN>], "own_cidrs": []}' > /etc/kitsmith-traffic.json

install -d -o root -g root -m 0755 /home/kitsmith-stats/.ssh
printf 'restrict,command="/usr/local/bin/kitsmith-traffic --ssh" %s\n' '<public key>' \
  > /home/kitsmith-stats/.ssh/authorized_keys
chmod 0644 /home/kitsmith-stats/.ssh/authorized_keys

# 2. nginx: new log format and /_self
cp -a /etc/nginx /root/nginx-backup-$(date +%F)
cp /etc/nginx/sites-available/kitsmith.dev /etc/nginx/sites-available/kitsmith.dev.prev
mv /etc/nginx/sites-available/kitsmith.dev.new /etc/nginx/sites-available/kitsmith.dev
nginx -t && systemctl reload nginx
# on failure: mv kitsmith.dev.prev back, nginx -t, reload

# 3. Prime the network data and check
sudo -u kitsmith-stats /usr/local/bin/kitsmith-traffic update-asn
sudo -u kitsmith-stats /usr/local/bin/kitsmith-traffic check
```

The authorized_keys file and its directory are root-owned so the account cannot change its own
key. `restrict` turns off the pty and all forwarding. `command=` means whatever the client asks
for, only `kitsmith-traffic --ssh` runs. It reads the requested subcommand from
`SSH_ORIGINAL_COMMAND` and splits it without a shell.

### On the owner's Mac

```sh
ssh-keygen -t ed25519 -f ~/.ssh/kitsmith_stats -C kitsmith-stats -N ''
cat >> ~/.ssh/config <<'EOF'
Host kitsmith-stats
  HostName <droplet>
  User kitsmith-stats
  IdentityFile ~/.ssh/kitsmith_stats
  IdentitiesOnly yes
EOF
ssh kitsmith-stats check
```

The key has no passphrase so agents can use it unattended. It can do nothing but read this
report. Revoke it by emptying the server's `authorized_keys`.

## Updating

- **Classifier change:** edit `deploy/stats/kitsmith_traffic.py`, add a fixture to
  `test_kitsmith_traffic.py` for the log shape that was misclassified, and merge. CI runs ruff and
  pytest. Then `scp` the file over `/usr/local/bin/kitsmith-traffic` (root). The site deploy does
  not touch it.
- **A new hosting provider shows up as people:** add its network name to `DATACENTER_ASN_NAME`,
  with a test. Names come from iptoasn and differ from whois (Scaleway is `Online SAS`, HostRoyale
  is `HR-CUSTOMER`).
- **Log format change:** keep the combined prefix. The parser accepts old and new lines, so
  rotated files stay readable. Rename the format (`kitsmith_v3`) rather than redefine it.
