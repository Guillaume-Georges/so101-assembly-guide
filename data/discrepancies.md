# Discrepancies between sources

Where two public sources disagree about the SO-101 build, the disagreement is
recorded here rather than silently resolved. Default preference: the upstream
TheRobotStudio spec, with the variant noted. Read on 2026-09-07; sources are
listed in `SOURCES.md`.

## D-001 — Motor-mounting screw size

- Topic: fasteners `m2x6`; every "fasten the motor" step
- Source A: LeRobot so101.mdx, Joint 1: "4 M2x6mm screws (smallest screws)".
- Source B: `upstream/SO-ARM100/STEP/SO101/SO101 Assembly.step` models
  `DIN EN ISO 7045 - M2.5 x 4` pan-head screws and M3 nuts (`DIN 934`,
  `DIN 555`); no M2 screw is modelled.
- Source C: Waveshare wiki says "four pointed screws" (self-tapping) for the
  motor and "flat head screws" for the shoulder-to-horn joint; no sizes.
- Resolution: follow LeRobot (M2x6). Open: which one a kit actually ships.
- Affects: F/L-011, 012, 021, 031, 042, 050, 061/062, L-061

## D-002 — Follower power supply voltage

- Topic: part `power-supply-5v`
- Source A: SO-ARM100 README, Sourcing Parts: 5V supply for the 7.4V servos;
  12V 5A+ only if the 12V STS3215 variant is bought. Leader is always 7.4V.
- Source B: SVRC setup guide: "12V power supply (3A minimum)" with no servo
  variant stated.
- Source C: Seeed wiki: Standard kit all 5V; Pro kit 12V for the follower,
  5V for the leader.
- Resolution: upstream (5V for 7.4V servos). SVRC's 12V applies only to the
  12V-servo variant; treated as a kit variant note.
- Affects: F/L-002

## D-003 — Wiring holders / cable clips

- Topic: part `wiring-holder`
- Source A: `SO101 Assembly.step` contains eleven `Wiring_holder v1`
  instances; Seeed wiki names "the addition of cable clips on SO-ARM101" as
  a difference from SO-100.
- Source B: SO-ARM100 README part table and `STL/SO101/Individual/` list no
  such part; LeRobot and Waveshare assembly steps never mention one.
- Resolution: open. Part kept with qty 0 and `unverified: true`; no step
  installs it until a source says where.
- Affects: none yet

## D-004 — Leader servo models in vendor kits

- Topic: servos `leader-*`
- Source A: upstream (README + LeRobot): leader = C044 1:191 at joints 1 and
  3, C001 1:345 at joint 2, C046 1:147 at joints 4–6, all 7.4V.
- Source B: Waveshare wiki: leader IDs 1–3 "ST3215 Servo", IDs 4–6
  "ST3215-HS Servo"; some editions use "ST3215 Servo (SE)", an encoder-only
  servo with no power section.
- Resolution: upstream spec in `servos.yaml`; Waveshare recorded as a kit
  variant in `vendors.yaml`.
- Affects: L-002 and every leader servo step

## D-005 — Part names in the assembly STEP vs the STL/README names

- Topic: parts `wrist-roll-pitch-so101`, `base-motor-holder-so101`,
  `handle-so101`, `trigger-so101`
- Source A: README table / `STL/SO101/Individual/`: `Wrist_Roll_Pitch_SO101`,
  `Base_motor_holder_SO101`, `Handle_SO101`, `Trigger_SO101`.
- Source B: `SO101 Assembly.step` (FILE_NAME "SO101 Assembly v4"): the wrist
  solid is named `Wrist_Roll_Pitch_SO100`; a solid `Base_08p` (SO-100
  naming) is present; `Base_motor_holder_SO101`, `Handle_SO101` and
  `Trigger_SO101` do not appear by name.
- Resolution: open until Phase 2 walks the assembly tree. Possibly the STEP
  predates the final STL set or nests these parts under other names.
- Affects: `geometry_names` on the parts above; Phase 2 mapping

## D-006 — Leader gripper-motor horns

- Topic: L-062
- Source A: LeRobot, Gripper/Handle (Leader): "attach a motor horn using a
  M3x6mm horn screw" (singular).
- Source B: Waveshare, Leader step 17: "the steering wheel is installed at
  both ends of the servo".
- Resolution: open; step lists both horns and says so.
- Affects: L-062

## Not discrepancies (checked, consistent)

- Motor 5 gets one horn only: LeRobot Joint 5 and Waveshare step 15 agree.
- Servo IDs 1–6 bottom to top: LeRobot setup-motors, Waveshare and Seeed agree.
- Set IDs before assembly: LeRobot order, Waveshare and Seeed agree.
