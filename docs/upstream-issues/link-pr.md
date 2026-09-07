# Draft upstream PR text — TheRobotStudio/SO-ARM100 and huggingface/lerobot docs

To be opened by Guillaume once the guide has survived a round of builder feedback (Phase 4).
The guide must already be accurate and cite upstream before asking for the link.

## SO-ARM100 README (under "Getting Your Own SO-101" → Build it Yourself)

```
- Follow our [Assembly Guide](https://huggingface.co/docs/lerobot/so101), or the
  community [interactive step-by-step guide](https://guillaume-georges.github.io/so101-assembly-guide/)
  (3D view per step, servo/gear-ratio per joint, screws and checks, every fact cited to this repo).
```

PR description:

> Adds a link to a community-maintained interactive assembly guide for the SO-101.
> It renders the assembly steps from this repository's STEP/STL files and the LeRobot
> so101 page, one static page per step with a 3D view, the servo and gear ratio for the
> joint, fasteners, tool and a check. Every fact cites its source (this repo at a pinned
> commit, the LeRobot page, the Feetech datasheet or a vendor wiki); anything unsourced
> is flagged, never invented. Where sources disagree the guide records the discrepancy
> rather than picking one (`data/discrepancies.md`). Apache-2.0 attribution is kept for
> all upstream files; no vendor CAD is redistributed. Source: <repo URL>.

## LeRobot docs `docs/source/so101.mdx` (after "Step-by-Step Assembly Instructions")

```
> [!TIP]
> A community [interactive guide](https://guillaume-georges.github.io/so101-assembly-guide/)
> walks these same steps with a 3D view, the servo for each joint and a check per step.
```

Same PR description, plus: "The guide follows the order and wording of this page and links back to it as the primary source for every step."
