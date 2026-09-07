# Draft upstream issue — TheRobotStudio/SO-ARM100

**Title:** Provenance/licence of the servo and controller models embedded in `SO101 Assembly.step`

Hi, `STEP/SO101/SO101 Assembly.step` (commit `eecbe3e`) embeds six
`ST3215 Servo v2` sub-assemblies (internal component names `SCS215 v6_7`,
`ZK_122`, `SG-ZIJI_15`, `XG-ZIJI_16`, `MOTOR-1723_3`, `PCB-CHAZUO_92`,
`GE_27`, horns named 金属舵盘（驱动/从动）) and a `Bus Servo Adapter (A) v3`
PCB with full component models (`Board`, `User_Library-*`, `X2564WV-03-N0SN`,
`dc-005-5a-20`, ...).

They do not match the repo's own `STEP/SO100/STS3215_03a.step` (a single-body
Autodesk export), and the repo's Apache-2.0 LICENSE does not say whether these
vendor models are covered by it or were included under a separate permission.

For a derived project we currently use them only to read transforms and
replace the meshes with datasheet-derived primitives. Could you clarify:

1. Where the `ST3215 Servo v2` / `SCS215` model and the `Bus Servo Adapter (A)`
   model come from (Feetech / Waveshare downloads?) and under what terms?
2. Whether `STS3215_03a.step` is the model you would prefer derived projects
   to redistribute?

Thanks.
