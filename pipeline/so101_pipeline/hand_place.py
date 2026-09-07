"""Leader-only parts have no solid in the assembly STEP (D-005).

The assembly STEP is a follower arm. Leader parts are placed from their per-part STEP files by
mating features shared with their follower counterparts, and every placement records the feature
and is approximation: true. Frames below are part-local, millimetres, as found by
scripts in docs/phases/phase-2.md (circle features on planar faces).

Handle: `Handle_SO101.step` and `Wrist_Roll_SO101.step` are authored in one frame. The handle's single
r=1.1 (M2 clearance) hole lies on the same axis as an r=0.6 pilot hole in the holder (both at
y=0, direction (0.951, 0, -0.309)), so the handle takes the holder's transform as-is and the one
M2x6 screw (LeRobot) sits in that hole pair. Trigger: its four r=1.6 (M3) holes are on the r=7 mm
horn pattern like the jaw's, rotated 13.7 deg; it is set on the gripper drive horn so those holes
take the STEP's drive-side jaw screws, rotated so the lever hangs down.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader
from OCP.TopoDS import TopoDS_Shape

from . import geom
from .export import FASTENER_PRIMS, Output, Placement, _add_mesh, _flat, fastener_primitive, screw_matrix
from .walk import Occurrence

# Leader holder (Wrist_Roll_SO101) vs follower gripper body (Wrist_Roll_Follower_SO101): both carry
# the same stepped horn recess (r=10 -> r=12 -> r=11.24 -> r=13.24 along +Z, axis at x=y=0).
# Follower: r10 face at z=0.95, y=-0.22. Leader: r10 face at z=0, y=0. Same in-plane heading (CoM -X).
HOLDER_FROM_FOLLOWER_BODY = np.array([[1, 0, 0, 0.0], [0, 1, 0, -0.22], [0, 0, 1, 0.95], [0, 0, 0, 1]])
# Trigger_SO101.step, part frame: the horn face is the plane z=0 (normal -Z, horn on the -Z side), the
# 3.5 mm plate lies on z in [0, 3.5], and the four M3 holes (r=1.6) sit at radius 7 mm, the first at
# atan2(5.98, 3.64) = 58.7 deg from +X. The STEP jaw screws sit at 45 deg + k*90 on the same radius.
TRIGGER_PLATE_MM = 3.5
TRIGGER_HOLE_ANGLE = np.degrees(np.arctan2(5.98, 3.64))
# Handle_SO101.step, holder frame: the M2 clearance hole runs from (-24.86, 0, 39.21) to
# (-27.26, 0, 40.0); the screw enters at the outer end and threads into the holder's pilot hole
# (r=0.6, from (-25.69, 0, 39.49) toward (-17.75, 0, 36.91)).
HANDLE_SCREW_ENTRY = np.array([-27.26, 0.0, 40.0])
HANDLE_SCREW_DIR = np.array([0.951, 0.0, -0.309])


def _read(path: Path) -> TopoDS_Shape:
    r = STEPControl_Reader()
    if r.ReadFile(str(path)) != IFSelect_RetDone:
        raise RuntimeError(f"cannot read {path}")
    r.TransferRoots()
    return r.OneShape()


def _m(o: Occurrence) -> np.ndarray:
    return geom.matrix_from_loc(o.location)


def _placement(kind, pid, mesh, name, m_mm, feature, note, arms, joint=None) -> Placement:
    return Placement(
        kind,
        pid,
        mesh,
        name,
        "hand-placed",
        _flat(geom.to_glb_frame(m_mm)),
        True,
        "hand",
        note,
        feature,
        arms,
        None,
        joint,
    )


def add_leader_parts(out: Output, occs: list[Occurrence], step_dir: Path, data_dir: Path) -> None:
    leaf = {o.path[-1] if o.name.startswith("SOLID") and o.path else o.name: o for o in occs if o.solids > 0}
    body = leaf["Wrist_Roll_Follower_SO101"]
    servo6 = next(o for o in occs if o.solids == -1 and o.raw_name == "ST3215 Servo v2:6")
    horns6 = [o for o in occs if o.solids > 0 and "舵盘" in o.name and "ST3215 Servo v2:6" in o.raw_path]

    m_body, m_s6 = _m(body), _m(servo6)
    m_holder = m_body @ HOLDER_FROM_FOLLOWER_BODY
    rebase = m_holder @ np.linalg.inv(m_body)  # follower-body frame -> leader-holder frame

    holder_shape = _read(step_dir / "Leader_Specific" / "Wrist_Roll_SO101.step")
    mesh = _add_mesh(out, "wrist-roll-so101.glb", geom.tessellate(holder_shape))
    out.placements.append(
        _placement(
            "part",
            "wrist-roll-so101",
            mesh,
            "Wrist_Roll_SO101 (hand-placed)",
            m_holder,
            "stepped horn recess r10/r12/r11.24/r13.24 about +Z at the origin, matched to the same recess on "
            "Wrist_Roll_Follower_SO101 (offset y -0.22, z +0.95 mm); in-plane heading from centre of mass (both -X)",
            "leader holder on the wrist-roll (motor 5) drive horn; D-005",
            ["leader"],
        )
    )

    # Gripper servo and its horns, re-based from the follower body into the leader holder.
    m_s6_l = rebase @ m_s6
    servo_pl = next(p for p in out.placements if p.kind == "servo" and p.name == "ST3215 Servo v2:6")
    out.placements.append(
        _placement(
            "servo",
            servo_pl.id,
            servo_pl.mesh,
            "ST3215 Servo v2:6 (leader, hand-placed)",
            m_s6_l,
            "same pocket as the follower gripper body, expressed relative to the shared horn recess",
            "leader gripper servo; the leader holder's servo pocket is assumed to sit where the follower body's does",
            ["leader"],
            "gripper",
        )
    )
    for h in horns6:
        hp = next(
            p for p in out.placements if p.kind == "horn" and p.name == h.raw_name and p.path == "/".join(h.raw_path)
        )
        out.placements.append(
            _placement(
                "horn",
                hp.id,
                hp.mesh,
                f"{h.raw_name} (leader, hand-placed)",
                rebase @ _m(h),
                "re-based with the leader gripper servo",
                None,
                ["leader"],
                "gripper",
            )
        )

    trigger_shape = _read(step_dir / "Leader_Specific" / "Trigger_SO101.step")
    mesh = _add_mesh(out, "trigger-so101.glb", geom.tessellate(trigger_shape))
    m_trigger, feature = _place_trigger(out, trigger_shape, rebase)
    out.placements.append(
        _placement(
            "part",
            "trigger-so101",
            mesh,
            "Trigger_SO101 (hand-placed)",
            m_trigger,
            feature,
            "trigger on the leader gripper servo's drive horn; D-005",
            ["leader"],
        )
    )

    handle_shape = _read(step_dir / "Leader_Specific" / "Handle_SO101.step")
    mesh = _add_mesh(out, "handle-so101.glb", geom.tessellate(handle_shape))
    out.placements.append(
        _placement(
            "part",
            "handle-so101",
            mesh,
            "Handle_SO101 (hand-placed)",
            m_holder,
            "same authoring frame as Wrist_Roll_SO101: the handle's r=1.1 M2 hole (-27.26, 0, 40) and the "
            "holder's r=0.6 pilot hole (-25.69, 0, 39.49) share the axis (0.951, 0, -0.309); the handle takes "
            "the holder's transform unchanged",
            "handle under the leader holder, fixed by one M2x6 in the coaxial hole pair; pose exact relative "
            "to the holder, which is itself a recess match (D-005)",
            ["leader"],
        )
    )
    # the one M2x6 (LeRobot): enters the handle at the outer end of its hole, threads into the holder's pilot
    mesh = _add_mesh(out, "fastener-m2x6.glb", fastener_primitive("m2x6"))
    _, shank_len, _, _ = FASTENER_PRIMS["m2x6"]
    tip = HANDLE_SCREW_ENTRY + HANDLE_SCREW_DIR / np.linalg.norm(HANDLE_SCREW_DIR) * shank_len
    out.placements.append(
        Placement(
            "fastener",
            "m2x6",
            mesh,
            "M2x6 handle screw (hand-placed)",
            "hand-placed",
            _flat(geom.to_glb_frame(m_holder @ screw_matrix(tip, -HANDLE_SCREW_DIR))),
            True,
            "hand",
            "not modelled in the STEP: placed in the handle's M2 hole, on the axis of the holder's pilot hole "
            '(LeRobot: "Attach the handle to the leader holder using 1 M2x6mm screw")',
            "handle hole (-27.26, 0, 40) -> holder pilot (-25.69, 0, 39.49) along (0.951, 0, -0.309), holder frame",
            ["leader"],
        )
    )


def _place_trigger(out: Output, trigger: TopoDS_Shape, rebase: np.ndarray) -> tuple[np.ndarray, str]:
    """Pose the trigger from the STEP's four drive-side jaw screws (exact horn hole pattern) rather than
    from the jaw body. The trigger plate sits under the screw heads, its z=0 face toward the servo; its
    hole pattern is turned onto the screws (four solutions 90 deg apart) and the one whose lever points
    down and toward the gripper tip is taken, as in the upstream leader photo (SO101_Leader.webp: the
    finger loop hangs ahead of the grip). Works in the STEP frame (mm, Z-up); `rebase` moves
    follower-frame geometry into the leader holder's frame."""
    servo6 = next(p for p in out.placements if p.kind == "servo" and p.joint == "gripper" and "leader" in p.name)
    s6m = np.array(servo6.transform).reshape(4, 4)
    s6c = geom.points_to_step_frame((s6m[:3, :3] @ out.meshes[servo6.mesh].vertices.T).T + s6m[:3, 3]).mean(axis=0)
    # drive-side jaw screws: heads farther from the gripper servo body along the horn axis than the plain side
    screws = []
    for p in out.placements:
        if p.kind != "fastener" or p.id != "m3x6":
            continue
        m = rebase @ geom.to_step_frame(np.array(p.transform).reshape(4, 4))
        tip, up = m[:3, 3], m[:3, 2]
        screws.append((tip, up))
    horn = next(
        p
        for p in out.placements
        if p.kind == "horn" and p.id == "servo-horn-geared" and p.joint == "gripper" and "leader" in p.name
    )
    hm_glb = np.array(horn.transform).reshape(4, 4)
    local = out.meshes[horn.mesh]
    world = (hm_glb[:3, :3] @ local.vertices.T).T + hm_glb[:3, 3]
    horn_centre = geom.points_to_step_frame(world).mean(axis=0)
    ax = int(np.argmin(local.bounds[1] - local.bounds[0]))
    axis = geom.points_to_step_frame(hm_glb[:3, :3] @ np.eye(3)[ax])
    axis /= np.linalg.norm(axis)
    if np.dot(axis, horn_centre - s6c) < 0:
        axis = -axis  # outward: from the servo through the drive horn
    drive = [
        (tip, up)
        for tip, up in screws
        if abs(np.dot(up, axis)) > 0.9
        and np.dot(tip - horn_centre, axis) > -8.0
        and np.linalg.norm((tip - horn_centre) - np.dot(tip - horn_centre, axis) * axis) < 9.0
    ]
    if len(drive) != 4:
        raise RuntimeError(f"expected 4 drive-side gripper screws, found {len(drive)}")
    _, shank_len, _, _ = FASTENER_PRIMS["m3x6"]
    centre = np.mean([tip for tip, _ in drive], axis=0)  # the horn's hole pattern centre
    head_base = np.mean([np.dot(tip + up * shank_len - horn_centre, axis) for tip, up in drive])
    origin = horn_centre + axis * (head_base - TRIGGER_PLATE_MM)  # trigger z=0 plane on the horn axis
    origin = origin + ((centre - horn_centre) - np.dot(centre - horn_centre, axis) * axis)
    # basis: local +Z -> outward axis; local X,Y span the plate plane
    u, v = _basis_perp(axis)
    screw_angles = [np.degrees(np.arctan2(np.dot(t - centre, v), np.dot(t - centre, u))) for t, _ in drive]
    com = geom.centre_of_mass(trigger)
    tip_dir = np.array([0.0, -1.0, 0.0])  # STEP frame: the arm extends toward -Y, up is +Z
    want = (tip_dir + np.array([0.0, 0.0, -1.0])) / np.sqrt(2)  # lever down and toward the tip
    best = None
    for k in range(4):
        theta = np.radians(screw_angles[0] - TRIGGER_HOLE_ANGLE + 90.0 * k)
        ex = np.cos(theta) * u + np.sin(theta) * v
        ey = np.cross(axis, ex)
        r = np.column_stack([ex, ey, axis])
        lever = r @ com
        score = np.dot(lever / np.linalg.norm(lever), want)
        if best is None or score > best[0]:
            best = (score, r, k)
    _, r, k = best
    m = np.eye(4)
    m[:3, :3] = r
    m[:3, 3] = origin
    feature = (
        "four r=1.6 holes on the r=7 horn pattern set on the STEP's drive-side gripper screws (head base "
        f"{head_base:.1f} mm out from the horn centre, plate {TRIGGER_PLATE_MM} mm); rotation about the horn axis "
        f"(solution {k} of 4) chosen so the finger loop points down and toward the gripper tip as in the upstream "
        "leader photo; the loop's rest angle and the leader servo pocket are assumptions, so it overlaps the holder"
    )
    return m, feature


def _basis_perp(axis: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    u = np.cross(axis, [0.0, 0.0, 1.0])
    if np.linalg.norm(u) < 1e-3:
        u = np.cross(axis, [0.0, 1.0, 0.0])
    u /= np.linalg.norm(u)
    return u, np.cross(axis, u)
