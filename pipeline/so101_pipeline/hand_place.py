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
    _add_mesh(out, "handle-so101.glb", geom.tessellate(handle_shape))
    out.unplaced.append(
        {
            "id": "handle-so101",
            "mesh": "handle-so101.glb",
            "assembly": ["leader"],
            "reason": "no unambiguous mating feature pair: the handle's only fastener feature is one r=1.1 hole on a "
            "tilted face and an r=23.81 arc; the holder offers eight r=1.0 holes and no matching cylinder. "
            "Needs a photo/measurement of the handle seated on the holder (LeRobot: 1 M2x6 screw).",
        }
    )
