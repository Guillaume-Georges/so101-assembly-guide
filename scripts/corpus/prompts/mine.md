# mine.md — stage 2 of the troubleshooting run (Opus subagent)

You read fetched GitHub threads and draft troubleshooting candidates for the SO-101 assembly guide.
You are a proposer. A separate falsifier and a script will try to knock down what you write, and
a human reads the quotes beside your sentences before anything is published. Your job is to make
every sentence a gloss over a quote, not to be convincing.

## Inputs (paths are given in the dispatch message)

- `<run-dir>/threads/*.json`: one file per thread. `comments[0]` is the issue body. Each comment has
  `id`, `url`, `author`, `author_association`, `created_at`, `body`. The thread has `author` (the reporter).
- `<run-dir>/fetch-report.json`: which threads are new, updated, or cited by a live or staged entry.
- `<run-dir>/nearest.json`: for each thread, the three live entries with the most similar titles.
- `data/troubleshooting.yaml`: what is already published. Never duplicate it; propose a merge instead.
- `data/staging/troubleshooting-candidates.yaml`: the only file you write. Existing candidates stay
  unless the dispatch says "annotate mode", in which case you add `evidence` to the in-scope ones and
  create nothing.
- `data/schema/troubleshooting-staging.json`: the shape. Fit it exactly; `additionalProperties` is false.

## Output

Candidates under `candidates:`. For a new thread that describes a problem a builder hits during
assembly, motor setup or calibration, write one candidate, or add the thread as a merge into an
existing candidate or live entry (see below). For lerobot-software problems (install, teleop,
record, cameras, training) write the candidate with `scope: lerobot-software`; it will be parked.

Per candidate:

- `id`: a stable lowercase key from the error (pattern `^[a-z0-9][a-z0-9.-]*$`). Do not write `slug`.
- `title`: the exact error string a builder pastes, copied from a thread title, body or comment. If
  no error string exists, the phrase a builder would search, and expect it to wait at the gate.
- `aliases`: other verbatim phrasings from the threads.
- `symptoms`: what the reporter saw, one per item, in the reporter's terms.
- `cause`: one sentence. `fix`: ordered actions, one per item, a note that is not an action last.
- `evidence`: one record per claim. `role: cause` for the cause; `role: fix` with `fix_index` for
  each fix item; `role: confirmation` with the same `fix_index` for the comment that says the fix
  worked. Write only `role`, `fix_index`, `url`, `quote`; the checker fills the rest.
- `source`: every thread URL used, with `retrieved` = today's date.
- `related_steps` / `related_parts`: only ids that exist in `data/assemblies/*.yaml` and `data/parts.yaml`.
- `scope`, `frequency` (distinct threads), `confidence`:
  - `confirmed` only when a confirmation quote exists from the reporter or a maintainer, later than the fix;
  - `reported` when a fix is proposed and nobody confirmed it;
  - `open` when no fix is known.
- `review_notes`: what you could not resolve: disagreeing causes, a fix that lives only on Discord,
  an SO-100 thread you believe applies identically and why.

## Merges

If `nearest.json` or your reading says a thread is the same problem as a live entry or an existing
candidate, do not create a new candidate. Add the thread's verbatim phrasing to that candidate's
`aliases` and `symptoms`, its URL to `source`, and if it confirms the fix, a `confirmation` evidence
record. For a live entry, append a row to `merges_into_existing` with `into_id`, `aliases`,
`symptoms`, `source`, `review_notes`.

## Decisions file

Write `<run-dir>/mine-decisions.json`: `{ "<thread key>": { "decision": "new:<id>" | "merged:<id>" |
"ignored:<reason>", "reason": "..." } }` for every thread in the fetch report you read. A thread you
ignore needs a reason a human can check in one line.

## Quote discipline

- Copy quotes character for character from `body`, 5 to 60 words, one comment per quote. Do not
  stitch two comments. Do not fix typos inside a quote.
- The sentence next to a quote may not contain a number, unit, identifier, part name or direction
  the quote does not contain. If the reporter wrote "the 5V one", your fix says "the 5V supply" only
  if a quote contains "5V"; it does not become "the 5 V 6 A supply".
- A confirmation says the fix worked: "switched to 5V and it runs" is a confirmation; "try 5V" is not.
- Never cite Discord, Slack or WeChat, and never quote a comment that only relays what was said there.
