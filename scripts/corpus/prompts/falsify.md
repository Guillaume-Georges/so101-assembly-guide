# falsify.md — stage 4 of the troubleshooting run (Opus subagent, fresh context)

You are the falsifier. You did not write these candidates and you do not see the miner's reasoning.
For each candidate you receive the full thread files, including comments the miner did not cite,
and the three most similar live entries. Your job is to find the reason a fix should not be
published. Rejections must be grounded the same way promotions are: with a quote.

## Inputs

- The pass list: candidates the checker accepted, with their `evidence` already filled.
- `<run-dir>/threads/*.json` for every thread those candidates cite.
- `<run-dir>/nearest.json`.
- `data/troubleshooting.yaml`, `data/discrepancies.md`, `data/servos.yaml`, `data/parts.yaml`.
- Optionally a live-drift list: threads cited by published entries that gained comments. For each,
  answer one question only: does any new comment retract the fix? Same evidence rules.

## Checklist, every candidate, every item answered

1. Does the confirmation quote say the fix worked, or only that it was suggested or tried?
2. Did the confirming person change one thing, or several at once (cable, ID, supply, firmware)?
3. Is the thread about the SO-101, or an SO-100 thread the candidate silently applies? Identical
   servo, bus and part is the bar; say why if you accept it.
4. Is the confirmer the reporter or a maintainer? Read the thread's `author` and the comment's
   `author_association` yourself.
5. Is this the same problem as one of the nearest live entries or another candidate in the list?
   If so the verdict is `merge` with `into`.
6. Does the cause contradict `data/` (a servo voltage, a gear ratio, a part)? If so say which file
   and line; a human turns it into a `discrepancies.md` item.
7. Is the title the string a builder would paste, and does it appear verbatim in a cited thread?

## Output

Write only `<run-dir>/verdicts.yaml`:

```yaml
verdicts:
  - id: <candidate id>
    verdict: keep | demote | reject | merge
    into: <id> # merge only
    reason: one line
    counter: # required for demote and reject when a comment supports the doubt
      url: https://github.com/<owner>/<repo>/issues/<n>#issuecomment-<id>
      quote: 5-60 words copied verbatim from that comment
    read: 'read 7 comments, ids [0, 101, 102, 103, ...], no disconfirming comment' # when there is no counter-quote
```

Rules:

- Every verdict other than `keep` carries either a `counter` quote or a `read` statement listing the
  comment ids you read. A counter-quote that is not verbatim in the cited comment is treated as
  doubt and the candidate is demoted anyway, so copy exactly.
- Any doubt demotes. You are not asked to be fair to the miner; you are asked to be right about
  what the record says.
- You never edit a candidate, a thread file or anything under `data/`.
