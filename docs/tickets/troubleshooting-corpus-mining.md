# Ticket: mine the public SO-101 record into troubleshooting candidates

Status: open · Owner: Guillaume · Created: 2026-09-09

## Why

`data/troubleshooting.yaml` has 3 entries. The public record has far more: about 90
issues on TheRobotStudio/SO-ARM100, about 160 on huggingface/lerobot that mention the
SO-101, plus the Waveshare and Seeed wiki troubleshooting sections. The site's search box
invites builders to paste an error string, and since the search fix (branch
`feat/search-fuzzy-nomatch`) every miss offers a "report it" link. Most of what people
will paste is not written up yet. Closing that gap is a reading job, not a design job,
so it is the right place for an agent fan-out.

## Deliverable

A reviewed set of candidate entries in a **staging file that the build never reads**:

```
data/staging/troubleshooting-candidates.yaml   # candidates, schema below
data/staging/troubleshooting-candidates.md     # the report for review
```

Nothing lands in `data/troubleshooting.yaml` without Guillaume's review. After review,
in-scope entries move across unchanged and the staging file shrinks.

### Candidate schema

The published schema (`data/schema/troubleshooting.json`) plus four review fields.
Validation of the staging file is by eye and by the agent's own checker; the CI schema is
untouched.

```yaml
- id: calibrate-timeout-motor-not-found # stable slug, never reused
  slug: calibrate-motor-not-found # frozen at first publish
  title: "Motor 'shoulder_pan' was not found, Make sure it is connected" # exact string as the user sees it
  aliases: [motor not found during calibrate, calibration cannot find motor]
  symptoms:
    - '`lerobot-calibrate` stops with the error above before any joint moves'
  cause: One-sentence cause, only what the sources support.
  fix: One-sentence fix, only what a maintainer or the reporter confirmed worked.
  related_steps: [F-002] # must exist in data/assemblies/*.yaml
  related_parts: [motor-control-board] # must exist in data/parts.yaml
  source:
    - {
        ref: 'https://github.com/huggingface/lerobot/issues/1234',
        retrieved: '2026-09-10',
        note: 'maintainer reply, comment 3',
      }
  unverified: false # true when no source confirms the fix
  # --- review fields, stripped when the entry is promoted ---
  scope: calibration # assembly | setup-motors | calibration | lerobot-software | sourcing | firmware
  frequency: 7 # distinct threads reporting the same symptom
  confidence: confirmed # confirmed (fix verified by OP or maintainer) | reported (fix proposed, unconfirmed) | open (no fix)
  review_notes: 'Two threads blame the USB hub; one blames baud rate. Both kept as symptoms.'
```

## Scope

- **In:** GitHub issues, discussions and PR threads on the two upstream repos; the
  Waveshare and Seeed wiki pages already in `SOURCES.md`; the Hugging Face forum; this
  repo's own `troubleshooting`-labelled issues (reports from the site).
- **Out:** Discord, Slack, WeChat, anything behind a login. CLAUDE.md rule 3: not
  citable. If a Discord answer is the only source, the entry is `unverified: true`
  with the symptom only, no fix.
- **Scope tags, not scope decisions.** v1 covers assembly issues only. Calibration and
  LeRobot software errors are the bulk of the corpus, so the agent extracts them and
  tags them; whether they enter v1 is a decision Guillaume makes at review (see Open
  decisions). Do not skip them.

## Acceptance

- Every candidate has at least one public URL with a `retrieved` date.
- Every `title` is a string a builder would actually type or paste, verbatim from a
  source where an error message exists.
- Every `cause` and `fix` sentence traces to a specific comment; nothing from general
  knowledge of how servos or serial ports behave. When the sources disagree, both
  causes are listed as symptoms or the entry is `unverified` with a note.
- Every `related_steps` id and `related_parts` id resolves. Unresolvable ones are dropped
  with a note, never invented.
- Duplicates of the existing 3 entries are merged as new aliases or symptoms on those
  ids, reported separately, not re-created.
- The report lists: counts by scope and confidence, the 20 most frequent symptoms, the
  merges into existing entries, discrepancies with anything already in `data/`, and the
  entries that need a human because sources conflict.
- No change to `data/troubleshooting.yaml`, `data/schema/`, or anything the build reads.
  `pnpm validate` still passes.

## Open decisions for Guillaume

1. **Scope.** Do `calibration` and `lerobot-software` entries enter v1? CLAUDE.md says a
   later phase; the corpus and the search box both point the other way. If yes, the
   troubleshooting index copy, the issue form text and the out-of-scope line in CLAUDE.md
   change in the same PR.
2. **Where reviewed entries land.** One growing `troubleshooting.yaml`, or one file per
   scope under `data/troubleshooting/`? Either is a small loader change in
   `scripts/src/load.ts`.
3. **Cadence.** One-off, or a monthly rerun that only reports new threads since the last
   `retrieved` date?

## Cost and shape

About 250 threads to read. Inventory and classification are cheap and mechanical
(Sonnet); extraction needs judgment about what a source actually confirms (Opus);
verification is adversarial and per entry (Opus). Orchestration on Fable. Expect roughly
15 to 25 agent runs and a few dollars of API spend; the deliverable is reviewed by hand
afterwards, so the cost of an agent error is bounded to review time.

---

## Prompt for the orchestrating agent

Paste the block below into a fresh session started from the repo root
(`claude` in `~/Developer/so101-assembly-guide`), or hand it to a `fable` agent from an
existing session. The `ultracode` keyword is deliberate: it authorises the fan-out.

```text
ultracode

You are orchestrating a corpus-mining job for the SO-101 assembly guide. Read
CLAUDE.md and docs/tickets/troubleshooting-corpus-mining.md first; the ticket is the
spec and its Acceptance section is your definition of done. Work on a new branch
`data/troubleshooting-candidates` from origin/main. Never push main, never `git add -A`.

Non-negotiables that bind every sub-agent (repeat them verbatim in every sub-agent prompt):
1. No invented facts. A cause or fix that is not stated in a cited public comment does
   not exist. When unsure, write `unverified: true` and say what is missing.
2. Every entry cites a public URL with a `retrieved` date. Discord, Slack, WeChat and
   anything behind a login are not citable, even when linked from an issue.
3. Titles are verbatim error strings or the exact phrase a builder would search.
4. Never modify data/troubleshooting.yaml, data/schema/, or anything the build reads.
   Output goes to data/staging/ only.
5. Before reading code or data, run the tier-1 git query on the thing you are about to
   touch (`git log --oneline -S"<identifier>"`) and, for anything that looks like a
   design decision, the tier-2 trailer grep
   (`git log <path> --grep='^Constraint:' --grep='^Directive:' --grep='^Rejected:'`).
   Quote any trailer you find verbatim in your report.

Inputs available without any login:
- `gh api` works in this checkout. Issue counts as of 2026-09-09: ~90 on
  TheRobotStudio/SO-ARM100, ~160 on huggingface/lerobot matching "so101". Use
  `gh api -X GET search/issues -f q=...` for inventory and
  `gh api repos/<owner>/<repo>/issues/<n>/comments --paginate` for threads.
  Also read discussions on both repos and this repo's issues labelled `troubleshooting`.
- upstream/lerobot/docs/source/so101.mdx (pinned snapshot) and the Waveshare and Seeed
  wiki URLs listed in SOURCES.md, cited exactly as SOURCES.md shows.
- data/assemblies/follower.yaml and leader.yaml for step ids (F-xxx, L-xxx),
  data/parts.yaml for part ids, data/servos.yaml for joint names and gear ratios,
  data/troubleshooting.yaml for the three entries that already exist.

Run it as a workflow with these phases; keep the total under 25 agent runs:

Phase 1, inventory (one Sonnet agent per source: SO-ARM100 issues, lerobot issues,
lerobot discussions, wikis + forum + this repo). Each returns JSON: for every thread,
url, title, created date, state, comment count, a one-line symptom, a scope tag from the
ticket's enum, and whether a fix was confirmed by the reporter or a maintainer. No prose.

Phase 2, clustering (one Opus agent). Merge the inventories, group threads that describe
the same symptom, name each cluster by the most verbatim error string in it, record
frequency, and flag clusters that overlap the three existing entries. Output the cluster
list with the thread URLs per cluster. Drop clusters with no assembly, setup, calibration
or software relevance (feature requests, sourcing chatter, off-topic) and list what you
dropped.

Phase 3, extraction (Opus, one agent per batch of about 8 clusters, in parallel). For
each cluster read every thread in full and write one candidate entry in the ticket's
schema. Fill related_steps and related_parts only with ids that exist in data/. Quote
the comment that supports each cause and fix in review_notes with its URL and comment
position. Set confidence and unverified per the ticket. Return YAML only.

Phase 4, verification (Opus, one agent per batch, adversarial, in parallel; a different
agent than the one that extracted the batch). For each entry, re-open the cited URLs and
check: the title string appears in a source; each cause and fix sentence is supported by
the quoted comment; ids resolve; no Discord-only source; scope tag is right. Return a
verdict per entry: keep, fix (with the corrected fields), or reject (with the reason).
Apply the verdicts.

Phase 5, assembly (you). Write data/staging/troubleshooting-candidates.yaml sorted by
frequency descending, and data/staging/troubleshooting-candidates.md with the report the
ticket's Acceptance section lists. Run `pnpm validate` to prove the build is untouched.
Commit with /commit-rich on the branch, one commit, no attribution lines. Open no PR;
end with the Clarity & Coherence report, the flag list (`unverified`, `approximation`)
with what would clear each, and the ticket's three open decisions restated with your
recommendation and the evidence from the corpus for each.
```
