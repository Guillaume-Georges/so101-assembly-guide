"""Leader-only parts have no solid in the assembly STEP (D-005).

The assembly STEP is a follower arm. Leader parts are placed from their per-part STEP files by
mating features shared with their follower counterparts, and every placement records the feature
and is approximation: true. Frames below are part-local, millimetres, as found by
scripts in docs/phases/phase-2.md (circle features on planar faces).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader
from OCP.TopoDS import TopoDS_Shape

from . import geom
from .export import Output, Placement, _add_mesh, _flat
from .walk import Occurrence

# Leader holder (Wrist_Roll_SO101) vs follower gripper body (Wrist_Roll_Follower_SO101): both carry
# the same stepped horn recess (r=10 -> r=12 -> r=11.24 -> r=13.24 along +Z, axis at x=y=0).
# Follower: r10 face at z=0.95, y=-0.22. Leader: r10 face at z=0, y=0. Same in-plane heading (CoM -X).
HOLDER_FROM_FOLLOWER_BODY = np.array([[1, 0, 0, 0.0], [0, 1, 0, -0.22], [0, 0, 1, 0.95], [0, 0, 0, 1]])
# Trigger vs moving jaw, both on the gripper servo's drive horn. Jaw: drive-horn face is the
# r=10 circle at z=-17.4 (normal -Z). Trigger: r=10 circle at z=0 (normal -Z). Heading assumed equal.
TRIGGER_FROM_JAW = np.array([[1, 0, 0, 0.0], [0, 1, 0, 0.0], [0, 0, 1, -17.4], [0, 0, 0, 1]])


def _read(path: Path) -> TopoDS_Shape:
    r = STEPControl_Reader()
    if r.ReadFile(str(path)) != IFSelect_RetDone:
        raise RuntimeError(f"cannot read {path}")
    r.TransferRoots()
    return r.OneShape()


def _m(o: Occurrence) -> np.ndarray:
    return geom.matrix_from_loc(o.location)


def _placement(kind, pid, mesh, name, m_mm, feature, note, arms) -> Placement:
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
    )


def add_leader_parts(out: Output, occs: list[Occurrence], step_dir: Path, data_dir: Path) -> None:
    leaf = {o.path[-1] if o.name.startswith("SOLID") and o.path else o.name: o for o in occs if o.solids > 0}
    body = leaf["Wrist_Roll_Follower_SO101"]
    jaw = leaf["Moving_Jaw_SO101"]
    servo6 = next(o for o in occs if o.solids == -1 and o.raw_name == "ST3215 Servo v2:6")
    horns6 = [o for o in occs if o.solids > 0 and "舵盘" in o.name and "ST3215 Servo v2:6" in o.raw_path]

    m_body, m_jaw, m_s6 = _m(body), _m(jaw), _m(servo6)
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
            )
        )

    trigger_shape = _read(step_dir / "Leader_Specific" / "Trigger_SO101.step")
    mesh = _add_mesh(out, "trigger-so101.glb", geom.tessellate(trigger_shape))
    m_trigger = rebase @ m_jaw @ TRIGGER_FROM_JAW
    out.placements.append(
        _placement(
            "part",
            "trigger-so101",
            mesh,
            "Trigger_SO101 (hand-placed)",
            m_trigger,
            "r=10 horn face at the trigger origin (normal -Z) matched to the moving jaw's drive-side r=10 face at "
            "z=-17.4; rotation about the horn axis assumed equal to the jaw's",
            "trigger on the leader gripper servo's drive horn; D-005",
            ["leader"],
        )
    )

    handle_shape = _read(step_dir / "Leader_Specific" / "Handle_SO101.step")
    mesh = _add_mesh(out, "handle-so101.glb", geom.tessellate(handle_shape))
    m_handle, feature = _place_handle(handle_shape, holder_shape, m_holder)
    out.placements.append(
        _placement(
            "part",
            "handle-so101",
            mesh,
            "Handle_SO101 (hand-placed)",
            m_handle,
            feature,
            "handle under the leader holder; hole choice not derivable, placement from the LeRobot leader "
            "assembly video (Leader_v2.mp4 0:14 and 0:24): grip hangs below the holder, pointing down and "
            "toward the base; D-005",
            ["leader"],
        )
    )


HANDLE_MOUNT_NORMAL = np.array([-0.951, 0.0, 0.309])  # planar face carrying the single r=1.1 (M2) hole
HANDLE_MOUNT_CENTRE = np.array([-27.26, 0.0, 40.0])


def _place_handle(handle: TopoDS_Shape, holder: TopoDS_Shape, m_holder: np.ndarray) -> tuple[np.ndarray, str]:
    """No unique feature pair exists (one M2 hole on a tilted face vs eight M2 holes on the holder). The
    LeRobot leader video shows the grip hanging from the holder's underside, pointing down and toward the
    base. Build that pose: mount-face normal -> world up, symmetry plane (local y) -> world x, grip
    pointing to world -z (base side); mount-face centre placed under the holder's centroid at its lowest point."""
    n = HANDLE_MOUNT_NORMAL / np.linalg.norm(HANDLE_MOUNT_NORMAL)
    com = geom.centre_of_mass(handle)
    grip = com - HANDLE_MOUNT_CENTRE
    grip -= n * np.dot(grip, n)  # component along the mount plane
    grip /= np.linalg.norm(grip)
    # handle local basis: e_up = n (toward the holder), e_side = local +y, e_back = grip direction
    e_side = np.array([0.0, 1.0, 0.0])
    e_side -= n * np.dot(e_side, n)
    e_side /= np.linalg.norm(e_side)
    e_back = np.cross(n, e_side)
    if np.dot(e_back, grip) < 0:
        e_side, e_back = -e_side, -e_back
    local = np.column_stack([e_side, e_back, n])  # columns: side, back, up (handle frame)
    # world targets in the STEP frame (mm, Z-up): up = +Z, base side = +Y (arm extends to -Y), side = X
    hb = geom.bbox(holder)
    holder_world = trimesh_bbox_world(hb, m_holder)
    centre = holder_world.mean(axis=0)
    world = np.column_stack([np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])])
    r = world @ local.T  # maps handle local -> world
    # the grip hangs down: its mount face (normal up) sits at the holder's lowest z, under its centroid
    target = np.array([centre[0], centre[1], holder_world[:, 2].min()])
    m = np.eye(4)
    m[:3, :3] = r
    m[:3, 3] = target - r @ HANDLE_MOUNT_CENTRE
    feature = (
        "mount face (normal (-0.951,0,0.309), r=1.1 M2 hole at (-27.26,0,40)) turned to face world up; handle "
        "symmetry plane to world x; grip direction to the base side; mount-face centre at the holder's lowest "
        "point under its bbox centroid. Pose from LeRobot Leader_v2.mp4 0:14/0:24; which of the holder's eight "
        "M2 holes takes the screw is not derivable"
    )
    return m, feature


def trimesh_bbox_world(bb: np.ndarray, m: np.ndarray) -> np.ndarray:
    corners = np.array(
        [[x, y, z] for x in (bb[0][0], bb[1][0]) for y in (bb[0][1], bb[1][1]) for z in (bb[0][2], bb[1][2])]
    )
    return (m[:3, :3] @ corners.T).T + m[:3, 3]
