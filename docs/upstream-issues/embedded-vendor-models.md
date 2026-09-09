# Draft upstream issue — TheRobotStudio/SO-ARM100

Status: drafted 2026-09-07, revised 2026-09-08 after identifying the embedded
models. Not yet opened; Guillaume posts it.

**Title:** Licence of `STEP/SO100/STS3215_03a.step`, and of the vendor models embedded in `SO101 Assembly.step`

Hi, thanks for publishing the SO-101 under Apache-2.0. We build a derived,
source-cited assembly guide from this repo (https://kitsmith.dev/so101/,
source and data at https://github.com/Guillaume-Georges/so101-assembly-guide;
every step cites a file here at a pinned commit) and have two licence
questions about the servo geometry.

**1. Embedded vendor models.** `STEP/SO101/SO101 Assembly.step` (commit
`eecbe3e`) embeds six `ST3215 Servo v2` sub-assemblies and a
`Bus Servo Adapter (A) v3` PCB with full component models. Their internal
names (`SCS215`, `MOTOR-1723`, `PCB-CHAZUO_92`, horns named
金属舵盘（驱动/从动）) are those of Waveshare's ST3215 download
(`files.waveshare.com/upload/5/59/ST3215-3D.zip`), which states no licence.
We read them only for transforms and do not redistribute them. Is that the
source, and were they included under a permission the LICENSE does not
mention? If so, a NOTICE line would help downstream projects.

**2. `STEP/SO100/STS3215_03a.step`.** This single-body model (added in
`de67464` from the project's SolidWorks export) shares no part names or
internals with the vendor files and looks like your own simplified drawing.
Can you confirm it is your work and covered by the repo's Apache-2.0
licence? We would like to ship a GLB derived from it (horn plates cut off,
datasheet boss added) with attribution per `CITATION.cff` and a modification
note, and would rather ask than assume.

Thanks.

---

Notes for the poster (not part of the issue):

- The current build already ships the derived GLB with `approximation: true`
  and the provenance question recorded in `SOURCES.md` and D-007. If the
  answer to 2 is no, the pipeline's datasheet-box fallback returns by
  reverting the servo-body commit.
- The Onshape document referenced upstream (`d2941bdba816affebdc6d6f0`)
  returns HTTP 403, so provenance cannot be checked without asking.
