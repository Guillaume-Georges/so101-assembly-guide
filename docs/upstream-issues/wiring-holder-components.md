# Draft upstream issue — TheRobotStudio/SO-ARM100

**Title:** SO-101 assembly STEP: eleven empty `Wiring_holder v1` components — dropped feature or missing part?

Hi, while building a source-traceable assembly guide for the SO-101 we walked
`STEP/SO101/SO101 Assembly.step` (commit `eecbe3e`) with OpenCascade XCAF and
found eleven occurrences of a component named `Wiring_holder v1` nested inside
the printed-part sub-assemblies:

- `Upper_arm_SO101 v9`: 2
- `Under_arm_SO101 v12`: 1
- `Motor_holder_SO101_Base v6`: 3
- `Motor_holder_SO101_Wrist v8`: 2
- `Wrist_Roll_Pitch_SO100 v15`: 1
- `Wrist_Roll_Follower_SO101 v10`: 1
- `Wrist_Roll_SO101 v6`: 1

Every one of them has zero solids, and the printed bodies' volumes equal the
published STLs (e.g. `Motor_holder_SO101_Base` 13314 vs 13307 mm³), so they
contribute no geometry. No STL, BOM row or assembly step mentions a wiring
holder or cable clip anywhere in the repo, the LeRobot page, or the Seeed and
Waveshare wikis (Seeed does mention "cable clips" as an SO-101 addition).

Questions:

1. Are these leftovers of a dropped separate clip part, or placeholders for
   the wire grooves that are already cut into the SO-101 brackets?
2. If a clip part exists, could its STL be added to `STL/SO101/Individual/`?

Happy to send a PR removing the empty components from the STEP if that is the
answer. Thanks for the open design.
