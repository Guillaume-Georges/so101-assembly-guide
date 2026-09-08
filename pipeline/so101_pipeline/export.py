"""Build per-part GLBs and placements.json from the resolved STEP occurrences.

Printed parts and cables: the upstream mesh, in its product frame.
Servos, horns, controller board: datasheet / bounding-box primitives placed at the vendor model's
transform (approximation: true). No vendor mesh is written (SOURCES.md).
Fasteners: one canonical primitive per id (tip at the origin, axis +Z) placed by tip point and
direction, so STEP screws, synthesized horn screws and the hand-placed handle screw share a mesh.
Hole hosts, horn-screw synthesis and step allocation happen in fasteners.py.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader

from . import geom
from .mapping import Resolved
from .walk import Occurrence

# Feetech STS3215 product specification A/0 (2020-03-28), section 9 (Outside Dimension), mm.
SERVO_LENGTH, SERVO_WIDTH, SERVO_HEIGHT = 45.23, 24.73, 35.0
SERVO_SHAFT_FROM_END, SERVO_BOSS_D, SERVO_BOSS_H = 12.5, 6.0, 3.4
# Servo body: the upstream repo's own simplified model (Apache-2.0), in its authoring frame: X along the
# length, Z along the output axis, shaft at x=+12.5, case top at z=14.4 and bottom at z=-14.4, rear ø6 boss to
# z=-15.6. Both horn plates are fused onto it (z 16.2..18.7 and -15.6..-17.7) and are cut away, since the
# horns are separate placements drawn from the datasheet (D-007 records where body and datasheet differ).
SERVO_BODY_STEP = Path(__file__).resolve().parents[2] / "upstream/SO-ARM100/STEP/SO100/STS3215_03a.step"
SERVO_BODY_SHAFT_XY = (12.5, 0.0)
SERVO_BODY_KEEP_Z = (-15.6, 14.4)
SERVO_BODY_DEFLECTION_MM = 0.05
# Horns: datasheet section 10 (Accessories) drawings, mm. Plate outline drawn as the ø19.95 circle (the geared
# horn's drawing shows a polygon whose side count is not dimensioned); 4-M3 on the ø14 bolt circle as ø2.5
# tapped holes; the 25T spline is not modelled.
HORN_D, HORN_HUB_D, HORN_BOLT_CIRCLE_D, HORN_TAP_D = 19.95, 9.0, 14.0, 2.5
HORN = {  # id -> (plate thickness, hub protrusion on the servo side, centre bore)
    "servo-horn-geared": (2.5, 2.0, 3.2),  # 4.5 overall
    "servo-horn-plain": (2.1, 1.0, 6.05),  # 3.1 overall
}
FASTENER_PRIMS = {  # id -> (shank_d, shank_len, head_d, head_h) mm, all approximations
    "m3x6": (3.0, 6.0, 5.5, 2.4),
    "m2x6": (2.0, 6.0, 4.0, 1.6),  # head per ISO 7045 M2 (dk 4.0, k 1.6), type unsourced
    "motor-tab-screw": (1.9, 4.8, 3.6, 1.4),
    "m2.5x4": (2.5, 4.0, 4.7, 2.1),
    "spacer-m2.5-h6": (5.0, 6.0, 5.0, 0.0),
    "m3-nut": (5.5, 2.4, 5.5, 0.0),
}


@dataclass
class Placement:
    kind: str
    id: str
    mesh: str
    name: str
    path: str  # raw ancestor occurrence names, e.g. "SO101 Assembly v4/ST3215 Servo v2:5"
    transform: list[float]  # 4x4 row-major, GLB frame (m, Y-up)
    approximation: bool
    via: str
    note: str | None = None
    feature: str | None = None
    assembly: list[str] = field(default_factory=lambda: ["follower", "leader"])
    host: list[str] | None = None  # fasteners: printed parts whose hole the shank passes through (fasteners.py)
    joint: str | None = None  # servos, horns, horn screws: joint name (shoulder_pan .. gripper)
    step: dict[str, str] | None = None  # fasteners: step id that installs it, per arm (fasteners.py)


@dataclass
class Output:
    meshes: dict[str, trimesh.Trimesh] = field(default_factory=dict)  # filename -> mesh (GLB frame)
    placements: list[Placement] = field(default_factory=list)
    unplaced: list[dict] = field(default_factory=list)


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _flat(m: np.ndarray) -> list[float]:
    return [round(float(x), 9) for x in m.reshape(-1)]


def _add_mesh(out: Output, filename: str, mesh_mm: trimesh.Trimesh) -> str:
    if filename not in out.meshes:
        out.meshes[filename] = geom.mesh_to_glb_frame(mesh_mm)
    return filename


def _place(
    out: Output,
    kind,
    pid,
    mesh,
    occ: Occurrence,
    m_mm: np.ndarray,
    approx,
    via,
    note=None,
    feature=None,
    arms=None,
):
    out.placements.append(
        Placement(
            kind,
            pid,
            mesh,
            occ.raw_name,
            "/".join(occ.raw_path),
            _flat(geom.to_glb_frame(m_mm)),
            approx,
            via,
            note,
            feature,
            list(arms) if arms is not None else ["follower", "leader"],
        )
    )


def build(resolved: list[Resolved], all_occs: list[Occurrence], parts: dict[str, dict]) -> Output:
    out = Output()
    arms = {pid: list(p.get("assembly", ["follower", "leader"])) for pid, p in parts.items()}
    asm_nodes = {"/".join([*o.raw_path, o.raw_name]): o for o in all_occs if o.solids == -1}
    servo_groups: dict[str, list[Resolved]] = defaultdict(list)
    board_groups: dict[str, list[Resolved]] = defaultdict(list)
    horns: list[Resolved] = []
    servo_centre: dict[str, np.ndarray] = {}  # servo group key -> case centre, STEP world frame (mm)

    for r in resolved:
        o = r.occ
        if r.kind == "part":
            mesh = _add_mesh(out, f"{r.id}.glb", geom.tessellate(o.shape))
            _place(
                out,
                "part",
                r.id,
                mesh,
                o,
                geom.matrix_from_loc(o.location),
                r.approximation,
                r.via,
                r.note,
                arms=arms[r.id],
            )
        elif r.kind == "cable":
            mesh = _add_mesh(out, f"{r.id}--{_slug(o.name)}.glb", geom.tessellate(o.shape))
            _place(
                out,
                "cable",
                r.id,
                mesh,
                o,
                geom.matrix_from_loc(o.location),
                r.approximation,
                r.via,
                r.note,
            )
        elif r.kind == "fastener":
            mesh = _add_mesh(out, f"fastener-{r.id}.glb", fastener_from_step(r.id, o))
            _place(out, "fastener", r.id, mesh, o, _fastener_pose(r.id, o), True, r.via, r.note)
        elif r.kind == "horn":
            horns.append(r)
        elif r.kind == "servo":
            servo_groups[_group_key(o, "ST3215 Servo")].append(r)
        elif r.kind == "board":
            board_groups[_group_key(o, "Bus Servo Adapter (A)")].append(r)

    horns_by_servo: dict[str, list[Occurrence]] = defaultdict(list)
    for r in horns:
        horns_by_servo[_group_key(r.occ, "ST3215 Servo")].append(r.occ)
    for key, members in servo_groups.items():
        node = asm_nodes[key]
        # horns resolve as their own kind, so they are looked up by sub-assembly, not found among members
        local = [(m.occ, node.location.Inverted().Multiplied(m.occ.location)) for m in members]
        local_horns = [(o, node.location.Inverted().Multiplied(o.location)) for o in horns_by_servo[key]]
        drive = next((h for h in local_horns if "驱动" in h[0].name), None)
        idle = next((h for h in local_horns if "从动" in h[0].name), None)
        mesh_mm, feature, centre_local = _servo_body(local, drive, idle)
        servo_centre[key] = (geom.matrix_from_loc(node.location) @ np.array([*centre_local, 1.0]))[:3]
        mesh = _add_mesh(out, "servo-sts3215.glb", mesh_mm)
        r0 = members[0]
        _place(
            out,
            "servo",
            r0.id,
            mesh,
            node,
            geom.matrix_from_loc(node.location),
            True,
            r0.via,
            r0.note,
            feature,
            arms=_arms_for_servo(node),
        )
        out.placements[-1].joint = joint_of(node)

    for r in horns:
        o = r.occ
        centre = servo_centre[_group_key(o, "ST3215 Servo")]
        mesh = _add_mesh(out, f"{r.id}.glb", _horn_mesh(r.id, o, centre))
        _place(
            out,
            "horn",
            r.id,
            mesh,
            o,
            geom.matrix_from_loc(o.location),
            True,
            r.via,
            r.note,
            "datasheet horn (section 10) on the vendor horn's transform: outer face flush with the vendor "
            "extent, hub toward the servo; outline drawn as the ø19.95 circle",
            arms=_arms_for_servo(o),
        )
        out.placements[-1].joint = joint_of(o)

    for key, members in board_groups.items():
        node = asm_nodes[key]
        boxes = [geom.bbox(m.occ.shape, node.location.Inverted().Multiplied(m.occ.location)) for m in members]
        boxes = [b for b in boxes if b is not None]
        lo, hi = np.min([b[0] for b in boxes], axis=0), np.max([b[1] for b in boxes], axis=0)
        mesh = _add_mesh(out, "motor-control-board.glb", geom.box_mesh(hi - lo, (lo + hi) / 2))
        r0 = members[0]
        _place(
            out,
            "board",
            r0.id,
            mesh,
            node,
            geom.matrix_from_loc(node.location),
            True,
            r0.via,
            "bounding box of the vendor PCB model",
            "union bbox of all board components in the sub-assembly frame",
        )
    return out


JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]


def joint_of(o: Occurrence) -> str | None:
    """Joint of a servo sub-assembly or anything inside one, from the instance name 'ST3215 Servo v2:N'."""
    for n in [o.raw_name, *reversed(o.raw_path)]:
        m = re.search(r"ST3215 Servo v2:(\d)", n)
        if m:
            return JOINTS[int(m.group(1)) - 1]
    return None


def _arms_for_servo(o: Occurrence) -> list[str]:
    """The follower model's gripper servo (occurrence :6) sits in the follower gripper body; the leader's
    is re-based into the leader holder by hand_place."""
    names = [*o.raw_path, o.raw_name]
    return (
        ["follower"]
        if any(n.startswith("ST3215 Servo") and n.endswith(":6") for n in names)
        else ["follower", "leader"]
    )


def _group_key(o: Occurrence, prefix: str) -> str:
    idx = next(i for i, p in enumerate(o.path) if p.startswith(prefix))
    return "/".join(o.raw_path[: idx + 1])


@lru_cache(maxsize=1)
def servo_body_mesh() -> trimesh.Trimesh:
    """The upstream STS3215 body in its own frame (mm): case plus rear boss, both fused horn plates cut off,
    datasheet ø6 x 3.4 output boss added on the shaft axis."""
    reader = STEPControl_Reader()
    if reader.ReadFile(str(SERVO_BODY_STEP)) != IFSelect_RetDone:
        raise RuntimeError(f"cannot read {SERVO_BODY_STEP}")
    reader.TransferRoots()
    body = cq.Shape.cast(reader.OneShape())
    z0, z1 = SERVO_BODY_KEEP_Z
    keep = cq.Solid.makeBox(80.0, 60.0, z1 - z0, pnt=cq.Vector(-40.0, -30.0, z0))
    sx, sy = SERVO_BODY_SHAFT_XY
    boss = cq.Solid.makeCylinder(SERVO_BOSS_D / 2, SERVO_BOSS_H, pnt=cq.Vector(sx, sy, z1))
    solid = body.intersect(keep).fuse(boss)
    return geom.tessellate(solid.wrapped, SERVO_BODY_DEFLECTION_MM, 0.35)


def _servo_body(local, drive, idle):
    """The upstream body posed in the vendor sub-assembly frame: its shaft axis on the vendor drive horn's
    centre (the idle horn's when the drive horn is absent, as on motor 5), its case mid-height at the vendor
    bbox centre, its length axis toward the horn end. `local` are the body members and `drive` / `idle` the
    horns, each with its location relative to the sub-assembly node. Returns the mesh, a feature note and
    the case centre (vendor frame, mm)."""
    boxes = [geom.bbox(o.shape, loc) for o, loc in local]
    boxes = [b for b in boxes if b is not None]
    lo, hi = np.min([b[0] for b in boxes], axis=0), np.max([b[1] for b in boxes], axis=0)
    ext = hi - lo
    order = np.argsort(-ext)  # longest first: length (45), then height (35), then width (25)
    ax_len, ax_h, ax_w = order[0], order[1], order[2]
    centre = (lo + hi) / 2
    horn = drive if drive is not None else idle
    if horn is None:
        raise RuntimeError("servo sub-assembly without any horn: cannot orient the body")
    hb = geom.bbox(horn[0].shape, horn[1])
    hc = (hb[0] + hb[1]) / 2
    sign_h = 1.0 if hc[ax_h] > centre[ax_h] else -1.0
    if drive is None:
        sign_h = -sign_h  # the idle horn sits on the rear boss: the output axis points the other way
    sign_len = 1.0 if hc[ax_len] > centre[ax_len] else -1.0
    ex, ez = np.eye(3)[ax_len] * sign_len, np.eye(3)[ax_h] * sign_h
    rot = np.column_stack([ex, np.cross(ez, ex), ez])
    target = centre.copy()
    target[ax_len], target[ax_w] = hc[ax_len], hc[ax_w]
    m = np.eye(4)
    m[:3, :3] = rot
    m[:3, 3] = target - rot @ np.array([*SERVO_BODY_SHAFT_XY, 0.0])
    mesh = servo_body_mesh().copy()
    mesh.apply_transform(m)
    which = "drive" if drive is not None else "idle"
    feature = (
        f"upstream STS3215_03a body on the vendor transform: shaft axis from the {which}-horn centre "
        f"(offset {np.round(hc[[ax_len, ax_w]] - centre[[ax_len, ax_w]], 2).tolist()} from the vendor bbox centre), "
        f"case mid-height at the vendor bbox centre; vendor bbox {np.round(ext, 1).tolist()}, "
        f"axes len/h/w = {ax_len}/{ax_h}/{ax_w}"
    )
    return mesh, feature, target


def _horn_solid(hid: str) -> cq.Shape:
    """Datasheet horn, canonical frame: plate from z=0 to its thickness, outer face at +Z, hub on -Z."""
    plate, hub, bore = HORN[hid]
    solid = cq.Workplane("XY").circle(HORN_D / 2).extrude(plate)
    solid = solid.union(cq.Workplane("XY").workplane(offset=-hub).circle(HORN_HUB_D / 2).extrude(hub))
    solid = solid.faces(">Z").workplane().hole(bore)
    bolts = solid.faces(">Z").workplane().polygon(4, HORN_BOLT_CIRCLE_D, forConstruction=True).vertices()
    solid = bolts.hole(HORN_TAP_D)
    return solid.val()


def _horn_mesh(hid: str, o: Occurrence, servo_centre_world: np.ndarray) -> trimesh.Trimesh:
    """The datasheet horn in the vendor horn's own frame: axis along the thinnest extent, outer face flush
    with the vendor extent on the side away from the servo, hub toward the servo."""
    b = geom.bbox(o.shape)
    ext = b[1] - b[0]
    ax = int(np.argmin(ext))
    c = (b[0] + b[1]) / 2
    inv = np.linalg.inv(geom.matrix_from_loc(o.location))
    servo_c = (inv @ np.array([*servo_centre_world, 1.0]))[:3]
    inward = 1.0 if servo_c[ax] > c[ax] else -1.0
    outward = -inward * np.eye(3)[ax]
    outer = c.copy()
    outer[ax] = b[0][ax] if inward > 0 else b[1][ax]
    plate = HORN[hid][0]
    mesh = geom.tessellate(_horn_solid(hid).wrapped, 0.03, 0.4)
    m = screw_matrix(outer - outward * plate, outward)  # canonical +Z -> outward, z=0 at plate underside
    mesh.apply_transform(m)
    return mesh


def fastener_length(fid: str) -> float:
    """Tip-to-head-top length of the canonical primitive, mm."""
    _, shank_len, _, head_h = FASTENER_PRIMS[fid]
    return shank_len + head_h


def fastener_primitive(fid: str) -> trimesh.Trimesh:
    """One canonical mesh per fastener id (mm) for ids the STEP does not model (the hand-placed M2x6):
    axis +Z, tip at the origin, head at +Z. A placement is then fully described by its tip point and
    its tip->head direction (`screw_matrix`).
    Screws get a pan head in the style of the STEP's ISO 7045 siblings (rounded top edge, cross recess),
    nuts and spacers a hexagonal prism; head and recess proportions are decoration, not a spec (the
    placement stays `approximation: true`)."""
    import cadquery as cq

    shank_d, shank_len, head_d, head_h = FASTENER_PRIMS[fid]
    if head_h == 0.0:  # nut / spacer: hex prism (across flats = head_d) with the thread bore
        solid = cq.Workplane("XY").polygon(6, head_d / np.cos(np.pi / 6)).extrude(shank_len)
        bore = 3.0 if fid == "m3-nut" else 2.5
        solid = solid.faces(">Z").workplane().hole(bore)
        return geom.tessellate(solid.val().wrapped, FASTENER_DEFLECTION_MM, 0.4)
    shank = cq.Workplane("XY").circle(shank_d / 2).extrude(shank_len)
    head = cq.Workplane("XY").workplane(offset=shank_len).circle(head_d / 2).extrude(head_h)
    head = head.faces(">Z").edges().fillet(head_h * 0.35)
    slot_w, slot_l, slot_d = 0.22 * head_d, 0.62 * head_d, 0.5 * head_h
    top = cq.Workplane("XY").workplane(offset=shank_len + head_h - slot_d)
    recess = top.rect(slot_l, slot_w).extrude(slot_d + 0.1).union(top.rect(slot_w, slot_l).extrude(slot_d + 0.1))
    solid = shank.union(head).cut(recess)
    return geom.tessellate(solid.val().wrapped, FASTENER_DEFLECTION_MM, 0.4)


def screw_matrix(tip: np.ndarray, up: np.ndarray) -> np.ndarray:
    """4x4 placing the canonical fastener with its tip at `tip` and its axis (tip -> head) along `up`.
    Frame-agnostic: use it in the STEP frame (mm) or in the GLB frame (m)."""
    up = np.asarray(up, dtype=float)
    up = up / np.linalg.norm(up)
    z = np.array([0.0, 0.0, 1.0])
    if np.allclose(up, z):
        m = np.eye(4)
    elif np.allclose(up, -z):
        m = trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0])
    else:
        m = trimesh.transformations.rotation_matrix(np.arccos(np.clip(np.dot(z, up), -1, 1)), np.cross(z, up))
    m[:3, 3] = tip
    return m


def screw_transform_glb(tip_m: np.ndarray, up_m: np.ndarray) -> list[float]:
    """GLB-frame placement (flat 4x4) of the canonical fastener from a GLB-frame tip point and direction.
    The canonical mesh is authored in the STEP frame, so the pose is built there and converted."""
    return _flat(geom.to_glb_frame(screw_matrix(geom.points_to_step_frame(tip_m), geom.R_ZUP_TO_YUP.T @ up_m)))


def screw_tip_up_glb(transform: list[float]) -> tuple[np.ndarray, np.ndarray]:
    """Inverse of `screw_transform_glb`: GLB-frame tip point and tip->head direction of a placed fastener."""
    m = geom.to_step_frame(np.array(transform).reshape(4, 4))
    up = geom.R_ZUP_TO_YUP @ m[:3, 2]
    return geom.points_to_glb_frame(m[:3, 3]), up / np.linalg.norm(up)


def _fastener_tip_up(fid: str, shape) -> tuple[np.ndarray, np.ndarray]:
    """Tip point and tip->head direction of a STEP fastener product in its own frame, read off its bbox:
    the axis is the longest extent (the thinnest for a nut) and the head is the end the centre of mass
    leans to."""
    shank_d, shank_len, _, head_h = FASTENER_PRIMS[fid]
    b = geom.bbox(shape)
    ext = b[1] - b[0]
    ax = int(np.argmin(ext)) if head_h == 0.0 and shank_len < shank_d else int(np.argmax(ext))
    centre = (b[0] + b[1]) / 2
    if head_h == 0.0:
        sign = 1.0
    else:
        sign = 1.0 if geom.centre_of_mass(shape)[ax] > centre[ax] else -1.0
    up = np.zeros(3)
    up[ax] = sign
    tip = centre.copy()
    tip[ax] = b[0][ax] if sign > 0 else b[1][ax]
    return tip, up


def _fastener_pose(fid: str, o: Occurrence) -> np.ndarray:
    tip, up = _fastener_tip_up(fid, o.shape)
    return geom.matrix_from_loc(o.location) @ screw_matrix(tip, up)


FASTENER_DEFLECTION_MM = 0.03  # screws are 2-6 mm; the part-level 0.08 turns a cross recess into a smudge


def fastener_from_step(fid: str, o: Occurrence) -> trimesh.Trimesh:
    """The STEP's own library part (ISO 7045 pan head with its cross recess, ANSI B18.6.4 fillister head,
    DIN 934 hex nut) tessellated finely and moved into the canonical fastener frame: axis +Z, tip at the
    origin, head at +Z. Same convention as `fastener_primitive`, so STEP-placed, synthesized and
    hand-placed screws of one id keep sharing a mesh; the first STEP occurrence of an id is the one kept."""
    tip, up = _fastener_tip_up(fid, o.shape)
    mesh = geom.tessellate(o.shape, FASTENER_DEFLECTION_MM, 0.4)
    mesh.apply_transform(np.linalg.inv(screw_matrix(tip, up)))
    return mesh


def write(out: Output, out_dir: Path, meta: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, mesh in out.meshes.items():
        # merged vertices, no NORMAL: the viewer derives creased normals itself (toCreasedNormals). Splitting
        # here or shipping normals costs 2.5-3x in the meshopt-compressed file for the same picture.
        mesh.export(out_dir / name)
    doc = {
        "meta": meta,
        "placements": [p.__dict__ for p in out.placements],
        "unplaced": out.unplaced,
    }
    (out_dir / "placements.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
