---
name: troubleshooting-run
description: Run the SO-101 troubleshooting pipeline end to end from this terminal — fetch new public threads, have an Opus subagent draft grounded candidates, check every quote with code, have a second Opus subagent falsify, promote what survives, gate with Guillaume, and open the PR. Use when Guillaume says "run the troubleshooting pipeline", "mine new issues", "/troubleshooting-run", or on the weekly reminder. Spec: docs/tickets/troubleshooting-weekly-pipeline.md. Args: --backlog (annotate the existing staged candidates instead of fetching a delta), --cap N (promotions per run, default 5), --reverify (re-grade ledgered inputs into a separate drift PR), --dry-run (stop at the gate, no branch, no PR).
user-invocable: true
---

# /troubleshooting-run — mine, ground, falsify, PR

You are the orchestrator. Run this on Fable; dispatch the two agent stages to Opus. You run the
scripts yourself. The spec is `docs/tickets/troubleshooting-weekly-pipeline.md`; read its "Shape"
section once per session before the first run. The rules below are the ones that bind every stage;
repeat the **Non-negotiables** block verbatim in every subagent prompt.

## Non-negotiables (paste verbatim into every subagent prompt)

```text
1. No invented facts. A cause or fix not stated in a cited public comment does not exist. When
   unsure, leave confidence at `reported` and say what is missing in review_notes.
2. Every claim carries evidence: { role, url, comment_id, author, author_association, created_at,
   body_sha256, quote }. The quote is 5–60 words copied verbatim from that one comment. The
   sentence you write is a gloss over the quote and may contain no number, unit, identifier or
   direction that the quotes do not contain.
3. `confirmed` needs a confirmation quote from the thread's reporter or an upstream maintainer,
   later in the thread than the fix quote, or upstream code by commit SHA with line numbers.
   A vendor wiki is a source, not a confirmation.
4. Discord, Slack, WeChat and anything behind a login are not citable, even when linked from an issue.
5. Never write `id` or `slug`. Never touch data/troubleshooting.yaml, data/schema/, or anything the
   build reads. Your only output file is the one named in your prompt.
6. Titles are the verbatim error string from a cited thread, or the exact phrase a builder would
   search; say which in `title_kind`.
```

## Preflight (stop on any failure, say why)

1. `git status --porcelain` is empty and the branch is `main` at `origin/main` (`git fetch` first).
   Otherwise stop: the run starts from a clean trunk.
2. The pipeline exists: `scripts/src/corpus/{fetch,check,promote,hold}.ts`,
   `scripts/corpus/prompts/{mine,falsify}.md`, `scripts/corpus/config.json` and
   `data/staging/corpus-state.json`. If any is missing, stop and point at the ticket's build order.
   Do not improvise the missing stage. `pnpm --filter @so101/scripts test` must pass.
3. `gh auth status` succeeds. `gh pr list --label troubleshooting --state open` is empty; if a run PR
   is open, this run may update staging only and must say so at the end.
4. Parse args: `--backlog`, `--cap N` (default 5), `--reverify`, `--dry-run`.
5. Run dir: `.claude/investigations/corpus/<yyyy-mm-dd>/` (gitignored; `mkdir -p` it). Record start
   time, model ids (`scripts/corpus/config.json` → `models`) and `shasum -a 256` of both prompt files
   into `run.json` there.

## Stage 1 — fetch (script)

```
pnpm --filter @so101/scripts corpus:fetch --out <run-dir> [--backlog]
```

Reads the watermark from `data/staging/corpus-state.json`, writes per-thread JSON to the run dir,
re-fetches every thread cited by a live entry (drift) and by an in-scope staged candidate (a held
candidate is reconsidered whenever its thread gains a comment), and prints threads fetched / new /
updated / unchanged and drift. If the last line is `NOTHING_NEW`, stop here and report "nothing
new"; no branch, no PR. `--backlog` skips the delta and fetches only the cited threads.

## Stage 2 — mine (Opus subagent)

Dispatch one `general-purpose` agent, `model: opus`. Prompt = the Non-negotiables block + the
full text of `scripts/corpus/prompts/mine.md` + these absolute paths: the run dir,
`data/troubleshooting.yaml`, `data/staging/troubleshooting-candidates.yaml`,
`data/schema/troubleshooting-staging.json`, `data/assemblies/`, `data/parts.yaml`, and today's
date. Tell it: Read only under those paths; Write only the staging file and
`<run-dir>/mine-decisions.json`; no Bash, no web. In `--backlog` mode add: "annotate mode: add
`evidence` to every candidate whose `scope` is assembly, setup-motors or calibration; create no
candidate; touch no other field". Wait for it; do not start stage 3 until it returns. Then
`git status --porcelain` and confirm the staging file is the only tracked change; revert anything
else and say so.

## Stage 3 — check (script)

```
pnpm --filter @so101/scripts corpus:check --run <run-dir>
```

Validates the staging file against `troubleshooting-staging.json` (exit 1 on a shape error: send
the errors back to the miner once, then stop), then applies the grounding contract (ticket §3).
Demotes with reasons into `review_notes`; never drops. Prints the pass list, the demoted list with
reasons, symptom-titled passes, duplicates and parked candidates; writes
`<run-dir>/check-report.json`.

## Stage 4 — falsify (Opus subagent, fresh context)

Skip this stage when the pass list is empty. Otherwise dispatch a second `general-purpose` agent,
`model: opus`, never the same agent as stage 2. Prompt = the Non-negotiables block + the full text
of `scripts/corpus/prompts/falsify.md` + the pass list from `check-report.json` (ids) + the
absolute paths of the run dir, the staging file, `data/troubleshooting.yaml`,
`data/discrepancies.md`, `data/servos.yaml`, `data/parts.yaml` + the `drift` list from
`fetch-report.json`. Tell it: Read only; Write only `<run-dir>/verdicts.yaml`; it never edits
candidates. Each verdict is keep / demote / reject /
merge:<id> with one line and, for anything but keep, a counter-quote with a comment id or the
sentence "read N comments, ids [...], no disconfirming comment". Then:

```
pnpm --filter @so101/scripts corpus:check --run <run-dir> --apply-verdicts
```

which substring-checks the counter-quotes, writes verdicts into `review_notes`, and demotes.

## Stage 5 — promote (script)

```
pnpm --filter @so101/scripts corpus:promote --run <run-dir> --cap <N> [--allow-symptom-titles a,b]
```

Assigns slugs, strips review fields, keeps evidence on `source` items, archives each cited
permalink on the Wayback Machine (slow: up to a minute per URL; `--no-archive` for a dry run),
appends to `data/troubleshooting.yaml`, removes the promoted candidates from staging, writes the
ledger into `corpus-state.json`, validates, and writes `<run-dir>/pr-body.md` and `promoted.json`.
On a validation failure it restores every file and exits 1: stop and report the output verbatim.
Then run `pnpm format` and `pnpm build-data`.

## Stage 6 — gate (Guillaume)

Show `<run-dir>/pr-body.md` in the terminal (it has one block per promoted entry: title, slug,
stage, cause and fix items each beside their quotes, the falsifier's line; then demoted,
needs-title, merges, drift, run stats). Ask with AskUserQuestion (multi-select) which promoted
entries to keep; default all. For a symptom-titled candidate the human wants published, they
settle the title in staging first and you re-run promote with `--allow-symptom-titles <id>`. For
deselected entries run:

```
pnpm --filter @so101/scripts corpus:hold --run <run-dir> --ids a,b
```

which returns them to staging with a held note and rewrites the PR body. With `--dry-run`, stop
here: leave the working tree as is, print `git status`, and say the run made no branch.

## Stage 7 — branch, commits, PR

1. `git switch -c data/troubleshooting-run-<yyyy-mm-dd>` (`--reverify` runs use
   `data/troubleshooting-reverify-<date>`).
2. Two commits, **named paths only**:
   - `data/staging/troubleshooting-candidates.yaml data/staging/corpus-state.json` —
     `data(staging): troubleshooting run <date>: <n> new, <m> updated, ledger`
   - `data/troubleshooting.yaml` (+ `data/discrepancies.md` if the falsifier raised one) —
     `data: promote <k> troubleshooting entries from run <date>` with a rich body: `## Why`,
     `## Decisions` (one line per entry: slug ← thread), `## Changed`, and trailers
     `Constraint:`/`Directive:` only when a new one applies. No attribution lines.
     Skip the second commit when nothing was promoted.
3. `git push -u origin <branch>`, then `gh pr create --label troubleshooting --body-file
<run-dir>/pr-body.md --title "data: troubleshooting run <date> (<k> promoted, <n> staged)"`.
   Create the `troubleshooting` label first if `gh label list` does not show it.
4. Never push main. Never `git add -A`.

## Report

End with: PR URL; promoted (slug list); demoted with one reason each; needs-title; drift on live
entries; run stats; then the standard C&C report and flag list. Update the memory entry
`troubleshooting-search-and-corpus` with the PR number and anything left at the gate; delete lines
that the PR closes.

## What this skill never does

Promote a symptom-titled candidate without the gate; set `unverified` on a live entry; edit a
frozen slug; cite a Discord paraphrase; open a second run PR while one is open; run without the
scripts present.
