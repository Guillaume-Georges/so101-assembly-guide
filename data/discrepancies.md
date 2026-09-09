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
- Source D (tie-breaker, 2026-09-07): Feetech STS3215 product specification
  A/0 (2020-03-28), section 9 drawing: the horn screw is "M3X6 机牙螺丝"
  (M3x6 machine thread); the case screws are "PA3.0X5 自攻螺丝" (self-tapping);
  no screw is given for the mounting tabs; section 10 says "No Accessories".
- Correction: the M2.5x4 screws in the STEP are the controller-board screws
  (with M2.5 spacers), not motor screws. The motor positions hold 22
  "#1-42 x 3/16 in Type AB" tapping screws (≈ ø1.9 x 4.8 mm), consistent
  with LeRobot's "smallest screws" and Waveshare's "pointed screws".
- Seating (pipeline hole test, 2026-09-07): the STEP's 24 tapping-screw
  positions match LeRobot's 24 per arm exactly. Motor 1: two #1-42 up
  through the base floor and two "#0-48 x 3/16 in" (≈ ø1.5 x 4.8 mm) down
  from above, all into base holes, so the STEP draws the upper pair one size
  smaller. The base motor holder's "one on each side" pair are #1-42 too,
  horizontal, through the holder into the base and 17 mm clear of the servo:
  they fasten the holder, not the motor. The two holders at motors 2 and 4
  have no screws of their own; each is clamped by the motor's four side
  screws (per side one through the arm part, one through the holder). The
  former `tapping-0-48` id is retired; those two screws are
  `motor-tab-screw` with the variant noted.
- Resolution: horn thread settled = M3x6 machine screw (datasheet, LeRobot,
  STEP all agree). Motor-to-bracket fastening stays **open**: the data
  carries `motor-tab-screw` with the upstream default from the STEP (#1-42
  tapping) and the vendor variants (LeRobot M2x6, Waveshare "pointed"),
  flagged `unverified` until a kit is measured. Kit-shipped hardware is
  recorded per vendor in `vendors.yaml` as vendors describe it.
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
- Source D (2026-09-09 corpus mining): six threads report
  `[RxPacketError] Input voltage error!` after powering 7.4V servos from 12V
  (lerobot#2387, maintainer-confirmed; SO-ARM100 #174, #151, #142, #36, #17),
  and lerobot#2924's reporter ran a leader on 12V. Treated as builder errors
  the troubleshooting entry `power-supply-5v-or-12v-input-voltage-error`
  warns against, not as a variant. The 12V supply is now a qty-0 part
  (`power-supply-12v`) so the 12V servo variant is fully modelled.
- Affects: F/L-002

## D-003 — Wiring holders / cable clips

- Topic: part `wiring-holder`
- Source A: `SO101 Assembly.step` contains eleven `Wiring_holder v1`
  instances; Seeed wiki names "the addition of cable clips on SO-ARM101" as
  a difference from SO-100.
- Source B: SO-ARM100 README part table and `STL/SO101/Individual/` list no
  such part; LeRobot and Waveshare assembly steps never mention one.
- Sweep 2026-09-07 (all 237 tracked files, `Optional/`, `Mini/`,
  `Simulation/`, the single v0.1.1 release): no clip, wire, cable or holder
  STL exists. Walking the assembly STEP with XCAF shows every
  `Wiring_holder v1` occurrence has **zero solids**: they are empty
  components nested inside the printed-part sub-assemblies (Upper_arm x2,
  Motor_holder_Base x3, ...). The printed bodies' volumes equal their STLs
  (Base 122707 vs 122690 mm³, Motor_holder_Base 13314 vs 13307, Upper_arm
  117417 vs 117328), so the holders add no geometry anywhere.
- Resolution: there is no separate part. Seeed's "cable clips" and
  Waveshare's "wire grooves" describe features of the SO-101 brackets. The
  `wiring-holder` id is retired (never reuse it). Upstream issue drafted in
  `docs/upstream-issues/wiring-holder-components.md` asking whether the
  empty components are a dropped feature.
- Affects: none

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
- XCAF walk 2026-09-07: `Base_08p v18` has the same volume and extents as
  `Base_motor_holder_SO101.stl` (23717 vs 23709 mm³, 80.6 x 49.1 x 31.4 vs
  80.2 x 47.6 x 31.4) — it is the base motor holder under its SO-100 name.
  `Wrist_Roll_Pitch_SO100 v15` matches `Wrist_Roll_Pitch_SO101.stl`
  (32273 vs 32299 mm³). `Handle`, `Trigger` and the leader
  `Wrist_Roll_SO101` have no solid in the assembly STEP (the model is a
  follower arm; `Wrist_Roll_SO101 v6` is present as an empty assembly).
- Resolution: both SO-100 names recorded as `aka:`; the pipeline matched by
  alias, and the placement check (part bbox vs servo bbox, see
  `docs/phases/phase-2.md`) confirmed both roles: the flags are cleared. The three
  leader parts are hand-placed from their per-part STEP files with
  `approximation: true` and the mating feature recorded.
- Handle (2026-09-07): `Handle_SO101.step` and `Wrist_Roll_SO101.step` are
  authored in one frame. The handle's single r=1.1 M2 hole (from
  (-24.86, 0, 39.21) to (-27.26, 0, 40)) and an r=0.6 pilot hole in the
  holder (from (-25.69, 0, 39.49) toward (-17.75, 0, 36.91)) lie on one axis,
  (0.951, 0, -0.309). The handle takes the holder's transform unchanged and
  the M2x6 sits in that hole pair; the earlier "which of the holder's eight
  M2 holes" question is closed (six of those eight are the gripper servo's
  tab holes and two are a tilted pair the handle's y-axis through-hole does
  not use). L-061 is no longer `unverified`; it stays `approximation`
  because the holder is a recess match.
- Trigger (2026-09-07): `Trigger_SO101.step` is in its own part frame (horn
  face at z=0). Its four M3 holes are on the 7 mm horn radius, rotated
  13.7 deg from the STEP's jaw screws, so it is set on the drive-side jaw
  screws; of the four 90-degree fits the one matching the upstream leader
  photo (loop down and toward the tip) is used. The earlier placement had the
  plate inside the horn and the holes off the screws.
- Affects: `aka` on the parts above; Phase 2 mapping

## D-006 — Leader gripper-motor horns

- Topic: L-062
- Source A: LeRobot, Gripper/Handle (Leader): "attach a motor horn using a
  M3x6mm horn screw" (singular).
- Source B: Waveshare, Leader step 17: "the steering wheel is installed at
  both ends of the servo".
- Resolution: open; step lists both horns and says so.
- Affects: L-062

## D-007 — Servo body: upstream STEP model vs datasheet

- Topic: `servo-sts3215-*` geometry; every "fit the motor" step's picture
- Source A: `upstream/SO-ARM100/STEP/SO100/STS3215_03a.step` (repo's own
  simplified body, read 2026-09-08): case 45.40 x 24.80 x 28.8 mm, shaft
  axis 10.2 mm from the case end, no output boss modelled (the geared horn's
  ø9 hub sits directly on the case top), fused horn plates 2.5 and 2.1 mm.
- Source B: Feetech STS3215 product specification A/0, section 9: outside
  dimensions 45.23 x 24.73 x 35 (case 32, ears to 36.5), shaft axis 12.5 mm
  from the end, ø6 x 3.4 output boss.
- Source C (pipeline, 2026-09-08): the embedded vendor model (Waveshare's
  ST3215 file, transforms only) has its drive-horn axis 12.5 mm from its
  45.2 mm bbox centre, i.e. 10.1 mm from the case end, agreeing with the
  STEP body; its bbox height is 36.3 (datasheet 36.5 over the ears).
- Resolution: the STEP body is used for its shape (it is the only licensed
  body geometry) and the datasheet for the boss. The body is posed on the
  vendor model's shaft axis (drive-horn centre), where STEP body and vendor
  model agree; the datasheet's "12.5" is read as a different reference and
  is not used for placement. Dimensions in text come from the datasheet.
- Affects: `servo-sts3215.glb`; the servo stays `approximation: true`

## D-008 — Servo 5 silent: cable damage vs calibration behaviour

- Topic: troubleshooting `servo5-cable-torn` and
  `no-signal-from-servo5-during-calibration`
- Source A: Waveshare wiki, follower step 14 note: inserting servo 5 before
  its wires are routed tears the wire; motor 5 then does not answer.
- Source B: Seeed wiki, calibration tip: "it is normal that the terminal
  does not receive a signal from servo 5 when performing master-slave arm
  calibration. You can continue with the operation."
- Source C: lerobot `so_leader.py` (commit 7d615ac, 2026-07-29): wrist_roll
  is the `full_turn_motor`, left out of `record_ranges_of_motion`, range set
  to 0–4095 in code.
- Resolution: not a contradiction. A and B describe different situations
  that share the phrase "no signal from servo 5". B is explained by C and
  is expected; A is a physical fault. Two entries, each naming the other.
- Affects: F/L-050, calibration

## D-009 — Leader and follower control boards interchangeable?

- Topic: part `motor-control-board` (one id, qty 2)
- Source A: SO-ARM100 README and both vendor wikis: one bus servo adapter
  per arm, no leader/follower distinction stated.
- Source B: one builder in lerobot#1244 (2026-09-09 corpus mining, comment
  3359241601 by a non-maintainer): "In my case. It was follower's board. not one with
  leader's. Make it sure it's right one's. Follower - Follower Servo, Leader
  - Leader Servo." No maintainer reply, no second report.
- Resolution: upstream (one board type). Unverified, one report; kept as a
  symptom line on `setup-motors-no-response` when that merge lands. A second
  independent report upgrades this to a variant note.
- Affects: F/L-070

## Not discrepancies (checked, consistent)

- Motor 5 gets one horn only: LeRobot Joint 5 and Waveshare step 15 agree.
- Servo IDs 1–6 bottom to top: LeRobot setup-motors, Waveshare and Seeed agree.
- Set IDs before assembly: LeRobot order, Waveshare and Seeed agree.
