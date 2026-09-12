# Ticket: troubleshooting run — mine, ground, falsify, PR (`/troubleshooting-run`)

Status: built 2026-09-12 on branch `feat/troubleshooting-run`, backlog run not yet done · Owner: Guillaume · Follows
`troubleshooting-corpus-mining.md` (decision 3, cadence) · Reviewed by a Fable consult 2026-09-12;
its changes are folded in and marked "(consult)". Revised the same day from a GitHub Actions cron
to a terminal-launched skill: Guillaume triggers it, the session orchestrates, the run ends in a PR.

## Why

`data/troubleshooting.yaml` has 5 entries. `data/staging/troubleshooting-candidates.yaml` has 110,
of which 30 are in v1 scope and 11 have a confirmed fix. Nothing moves without a review, and the
review is a reading job nobody has time for. The public record keeps growing. This ticket turns the
one-off mining run into a repeatable job whose output is a PR a human can approve by reading quotes
beside sentences, with every judgment a script can make made by a script.

The rules that bind it, all already in force:

- No invented facts (CLAUDE.md 1). A cause or fix not stated in a cited public comment does not exist.
- `confirmed` needs the thread's reporter, an upstream maintainer, or upstream code by commit SHA;
  a vendor wiki is a source, not a confirmation (commit 8914330).
- Discord, Slack, WeChat and anything behind a login are not citable (CLAUDE.md 3).
- `data/staging/` is never read by the build; entries move to `troubleshooting.yaml` only after
  review (commit c74e064).
- Slug frozen at first publish; changing one is a URL break (commit 86a2a8f).
- `unverified: true` renders flagged, noindex, out of the sitemap.
- v1 scope: assembly, setup-motors, calibration. lerobot-software is tagged and parked (commit 0a6f9db).
- main is PR-only with three required checks; the repo admin merges (bypass on the ruleset). Stage
  named paths only, never `git add -A`. No Claude attribution in commits or PRs.

## Shape

A repo skill, `.claude/skills/troubleshooting-run/SKILL.md`, invoked as `/troubleshooting-run` from
a session started in this repo. The session is the orchestrator (run it on Fable). It runs the
deterministic scripts itself and dispatches two Opus subagents, propose and falsify. Everything
else is a script with fixtures. The run ends with a branch pushed and a PR opened under Guillaume's
own `gh` login; the PR is the review surface, and an in-terminal gate lets him drop entries first.

```
fetch (script) → mine (Opus agent) → check (script) → falsify (Opus agent) → promote (script) → gate (you) → PR (gh)
```

Why not GitHub Actions (first draft): a cron needs an App token to make the ruleset's checks run
on a bot PR, a secret for the API key, and a runner with no human to answer the gate. In a
terminal all three are free: the session already has the model, `gh` is already logged in, and the
human is present. The cost is that nothing runs unless Guillaume types the command; weekly is a
calendar reminder, not a cron.

### 1. Fetch — `scripts/src/corpus/fetch.ts`

- Sources in v1: issues in `huggingface/lerobot` matching so101 | so-101 | "so 101", all issues in
  `TheRobotStudio/SO-ARM100`, and this repo's `troubleshooting`-labelled issues. The HF forum is
  cut from v1: none of the 30 in-scope candidates cites it (consult). Wikis stay a quarterly manual
  pass; five in-scope candidates cite them as sources, which is allowed.
- Delta by `updated_at > watermark − 7 days`, deduped by comment id (consult: GitHub search is
  eventually consistent and `updated_at` moves on non-content events; overlap turns loss into
  absorbed duplicates). Auth: the session's `gh auth token`.
- Per-thread JSON (issue body, every comment with permalink, `id`, `author`, `author_association`,
  `created_at`, `updated_at`, issue author login) to a run dir outside the tree
  (`$CLAUDE_SCRATCHPAD/corpus/<run-date>/` or `.claude/investigations/corpus/`, gitignored).
- **Comment bodies are not committed.** The licence on other people's issue comments is unclear
  (CLAUDE.md 3). What is committed: `data/staging/corpus-state.json` = per-source watermark + index
  `{comment_id, url, updated_at, retrieved, body_sha256}` over normalised bodies + the decision ledger
  (stage 6). Short attributed quotes live in the entries themselves.
- Also re-fetch every comment cited by a **live** entry, every run (hundreds, cheap). Drift is
  reported, never acted on (stage 6).

### 2. Mine — Opus subagent, tool-restricted

- Dispatched by the orchestrator with `model: opus`, the prompt at
  `scripts/corpus/prompts/mine.md` plus the run paths. Allowed: Read on the run dir and `data/`,
  Write on the staging file only. No Bash, no web. The prompt file's sha is recorded in the ledger.
- Input: delta digest, `data/troubleshooting.yaml`, the staging file, the three nearest existing
  entries per new thread by trigram similarity on title (computed by script), the schema.
- Output: candidates in the staging YAML with review fields and **no `slug`** (consult: agents
  never emit the frozen identifier; `promote.ts` derives it from the title). The candidate `id` is
  a staging key the miner writes once and never changes; it becomes the published id. Every candidate carries
  `evidence` records (below). The miner writes quotes and glosses; the quote is the fact, the
  sentence is a gloss over it.
- Merge-vs-new is proposed by the miner against the nearest-three list and confirmed by the
  falsifier; it is never re-decided for an input the ledger has already judged.

### 3. Check — `scripts/src/corpus/check.ts`, the grounding contract

Evidence record, one per claim:

```yaml
- role: cause | fix | confirmation
  url: https://github.com/<owner>/<repo>/issues/<n>#issuecomment-<id> # or blob/<40-hex>/path#L<a>-L<b>
  comment_id: 123
  author: login
  author_association: OWNER | MEMBER | COLLABORATOR | CONTRIBUTOR | NONE
  created_at: 2026-01-01T00:00:00Z
  body_sha256: <normalised body>
  quote: '5 to 60 words, verbatim'
```

Rules the script enforces on every candidate the miner marks `confirmed` (consult, all of these):

1. Quote is a normalised substring (whitespace, smart quotes) of exactly one comment or blob at
   the URL; 5 to 60 words. The floor kills trivially true one-word quotes; the ceiling bounds the
   licence exposure.
2. **Token coverage:** every number, unit, identifier (`M2x6`, `ID 6`, `7.4V`, `/dev/ttyACM0`, a
   part or step id) and directional word in the published cause and each fix item appears in the
   union of that sentence's quotes. This is the check that implements "no invented facts";
   paraphrase laundering is the real vector.
3. Every fix item has a `confirmation` evidence whose author is the thread's reporter or has
   `author_association` in the per-repo allow-list; whose `comment_id` differs from the fix quote's
   unless the author is a maintainer; whose `created_at` is later than the fix quote's; and whose
   thread is the same. This kills opening-post self-confirmation and confirmation of a different
   suggestion in the thread.
4. Confirmation and fix quotes share at least one content token (weak; the falsifier does the rest).
5. Code evidence requires `#L<a>-L<b>` and the quote is a substring of the raw blob at that sha.
6. The comment's `updated_at` equals the snapshot's; edited after retrieval demotes.
7. `author_association` is evaluated per repo: a lerobot MEMBER confirms setup/calibration
   behaviour, not printed-part fit; declare the allow-list per source in a small config.
8. No source URL on discord, slack, wechat or login-gated domains; every source has `retrieved`.
9. `related_steps` and `related_parts` resolve (reuse `resolve.ts`).
10. `title` appears verbatim in a cited thread (title, body or comment). Symptom-phrased titles are
    allowed by the schema and two of the five live entries use them, but the run does not promote
    them on its own: they are listed at the gate as "needs a title decision", and Guillaume can
    settle the title there or leave the candidate in staging.
11. Normalised title equal to a live title, alias or slug, or to an earlier candidate in the file,
    demotes with `duplicate_of`; near-duplicates go to the falsifier.
12. `scope` in v1 maps to `stage`; anything else is parked, not failed.

Any failure demotes `confidence` to `reported` (which forces `unverified: true`) with the reason in
`review_notes`. Nothing is dropped silently.

Fixtures (vitest): the 5 live entries as positives, plus hand-written negatives: proposed-not-
confirmed, confirmation attached to the wrong suggestion, a laundered voltage, opening-post
self-confirmation, an edited comment, a Discord URL, a duplicate title. The fixture set doubles as
the prompt eval: a prompt edit is measured against it, not felt.

### 4. Falsify — second Opus subagent, fresh context

Not a second opinion; a different job (consult). Input: only the candidates that passed stage 3,
each with its **whole** thread including comments the miner did not cite, plus the nearest-three
existing entries. It never sees the miner's reasoning and never edits candidates. Per candidate it
answers a fixed checklist:

- Does the confirmation quote say the fix _worked_, not that it was proposed?
- Did the reporter change one thing, or several at once?
- Is the thread about the SO-101 (or identical on it), not the SO-100 only?
- Is the confirmer who the record says they are?
- Same issue as one of the nearest three → merge into that id?
- Does the cause contradict anything in `data/` → a `discrepancies.md` item?

Each "no" must carry a **counter-quote** with a comment id, substring-checked by the same script,
or the statement "read N comments, ids [...], no disconfirming comment". Rejections are grounded
the same way promotions are. Verdict keep / demote / reject / merge with one line each, written to
`review_notes`. Any doubt demotes.

Threads cited by live entries that gained new comments also pass through here with one question:
does this retract the fix?

### 5. Promote — `scripts/src/corpus/promote.ts`

- Eligible: `confirmed`, all checks pass, verdict keep, scope in v1, no open `troubleshooting` PR.
- `id` and `slug` assigned by script from the title (schema pattern, ≤60 chars); collision →
  suffix with the issue number; a retired-slug list is refused. The gate and the PR body print every
  new slug in bold with the frozen warning.
- Review fields stripped. **Evidence is kept**, not stripped: each `source` item gains optional
  `comment_id`, `quote`, `body_sha256`, `archived` (consult: the PR body is not queryable; `data/` is
  the product). This is an additive change to `data/schema/common.json` `sourceRef`; no renderer
  change is required, and a later renderer can show the quote.
- Archive-on-cite: `web.archive.org/save/<permalink>` for each cited URL at promotion; the
  archive URL goes in `archived`. Sha proves what was checked, the archive proves what it said,
  live re-fetch detects drift.
- Cap: 5 promotions per run, a constant, overridable with `--cap` for the backlog.
- Then `pnpm validate --flags`, `pnpm format`, `pnpm build-data`. A failure stops the run; no PR.

### 6. Gate, PR and ledger

- **Gate (in the terminal).** The orchestrator shows the promotion table: title, slug, stage, the
  cause and each fix item with its quote and confirmation quote, the falsifier's line; then the
  demoted, needs-title and drift lists. Guillaume deselects entries or approves. Deselected entries
  stay in staging with a `review_notes` line. This is the only step that needs a human before the PR.
- **Branch and PR.** Branch `data/troubleshooting-run-<yyyy-mm-dd>` from `origin/main`, two commits
  with named paths: staging + ledger, then promotions. Rich body per the global commit rules.
  `gh pr create` under Guillaume's login, label `troubleshooting`. One open run PR at a time: if one
  is open, the run updates staging only and says so. No PR when nothing changed. Guillaume merges
  after the three checks pass; the existing deploy publishes.
- **PR body**, per promoted entry: title, **slug**, stage, cause with quote + link + author role, each
  fix item with its quote and its confirmation quote, the falsifier's line. Then: merges applied,
  demoted and needs-human with reasons, needs-a-title list, drift on live entries (cited comment
  edited or deleted, retraction question), run stats (threads fetched/new/updated, model ids, prompt
  shas).
- **Ledger** in `corpus-state.json`: `index` keyed by comment (`url`, `updated_at`, `body_sha256`)
  and `ledger` keyed by thread (`content_sha256`, `decision: promoted:<id> | new:<id> | merged:<id>
| ignored:<reason>`, `prompt_sha`, `model`, `run`). A thread whose `updated_at` has not moved is
  not re-fetched or re-judged; prompt changes affect new inputs only. `--refetch` on fetch forces a
  full re-read for a deliberate re-verify, which lands as its own PR, never as silent flips.
- **Held candidates are reconsidered.** Fetch always re-reads every thread an in-scope staged
  candidate cites, so a comment that arrives next week confirming a held or demoted fix makes the
  candidate eligible again on that run.
- Drift on a **live** entry (cited comment edited or deleted) is reported at the gate and in the PR
  body. The run never sets `unverified` on a published, indexed URL; that is a human decision.

## Backlog run, once

Before the first routine run: `/troubleshooting-run --backlog`, the same stages on the existing
staging file.

1. `fetch` for every thread the 30 in-scope candidates cite (the 78 software candidates untouched).
2. One `mine` run in "annotate" mode: add `evidence` to the 30 candidates, no new candidates.
3. `check`, then one `falsify` run.
4. Fix prompts against the fixture set until `check` passes with zero false promotions on the five
   live entries and zero on the negatives.
5. Gate, then the PR. Expect roughly the 8 confirmed candidates that cite only GitHub to survive;
   the 3 that also lean on a wiki will need their confirmation to come from a comment. Split into
   two PRs if the review is long.

## Build order

1. Evidence schema (additive `sourceRef` fields; staging schema with review fields + evidence).
2. `check.ts` with the fixture set. This is the product; everything else feeds it.
3. `fetch.ts` for the two GitHub repos and this repo; `corpus-state.json` with ledger.
4. `mine.md` and `falsify.md` prompts under `scripts/corpus/prompts/`.
5. `promote.ts` (ids, slugs, archive, validate) and `open-pr.ts` (or `gh` calls from the skill).
6. The skill file, which refuses to run until steps 1 to 5 exist.
7. Backlog run; then routine runs.

Built 2026-09-12: `scripts/src/corpus/{types,text,github,state,check-lib,check,fetch,promote-lib,
promote,hold}.ts`, `scripts/corpus/config.json`, `scripts/corpus/prompts/{mine,falsify}.md`,
`data/schema/troubleshooting-staging.json`, evidence fields on `sourceRef` in `common.json`,
`data/staging/corpus-state.json`, `scripts/test/corpus.test.ts` (synthetic threads, 38 tests), the
skill. Fetch smoke-tested against GitHub in backlog mode (62 threads, ~90 s).

Cut from v1 (consult): HF forum, unattended symptom-title promotion, PR splitting logic, any cap
logic beyond a constant. Deferred: ticket decision 2 (one file vs per-scope files) stays "one file";
a renderer for quotes on the problem page; a lerobot-software stage if that phase is ever opened.
Deferred with the terminal shape: a cron. If it is ever wanted, the scripts are the same and only
stage 6 changes (App token, no gate).

## Cost

A routine delta is a handful of threads: two Opus subagents, cents to a dollar on API pricing;
on a Max plan it is session usage. The backlog is one larger run. A Sonnet miner with an Opus
falsifier is the cost lever if the delta grows; not needed at this volume.

## Decisions taken 2026-09-12

1. No cadence reminder; Guillaume runs it when he wants. Cap 5 per run.
2. Evidence stays data-only in v1; no renderer change.
3. The three wiki-leaning confirmed candidates wait for a confirming comment; every run re-reads
   their threads, so nothing is needed to pick it up.
4. Run dir: `.claude/investigations/corpus/<date>/`, gitignored, survives for debugging.
