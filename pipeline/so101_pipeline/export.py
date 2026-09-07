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
from pathlib import Path

import numpy as np
import trimesh

from . import geom
from .mapping import Resolved
from .walk import Occurrence

# Feetech STS3215 product specification A/0 (2020-03-28), section 9, mm.
SERVO_LENGTH, SERVO_WIDTH, SERVO_HEIGHT = 45.23, 24.73, 35.0
SERVO_SHAFT_FROM_END, SERVO_BOSS_D, SERVO_BOSS_H = 12.5, 6.0, 3.4
HORN_D = 19.2  # vendor-model extent; the datasheet page read gives no horn diameter
HORN_T = {"servo-horn-geared": 4.6, "servo-horn-plain": 3.5}
FASTENER_PRIMS = {  # id -> (shank_d, shank_len, head_d, head_h) mm, all approximations
    "m3x6": (3.0, 6.0, 5.5, 2.4),
    "m2x6": (2.0, 6.0, 3.8, 1.5),
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
            mesh = _add_mesh(out, f"fastener-{r.id}.glb", fastener_primitive(r.id))
            _place(out, "fastener", r.id, mesh, o, _fastener_pose(r.id, o), True, r.via, r.note)
        elif r.kind == "horn":
            mesh = _add_mesh(out, f"{r.id}.glb", _horn_primitive(r.id, o))
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
                arms=_arms_for_servo(o),
            )
            out.placements[-1].joint = joint_of(o)
        elif r.kind == "servo":
            servo_groups[_group_key(o, "ST3215 Servo")].append(r)
        elif r.kind == "board":
            board_groups[_group_key(o, "Bus Servo Adapter (A)")].append(r)

    for key, members in servo_groups.items():
        node = asm_nodes[key]
        local = [(m.occ, node.location.Inverted().Multiplied(m.occ.location)) for m in members]
        horn = next((o for o, _ in local if "驱动" in o.name), None)
        mesh_mm, feature = _servo_primitive(local, horn, node)
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


def _servo_primitive(local, horn, node):
    """Datasheet box aligned to the vendor model's local bbox; boss on the drive-horn side."""
    boxes = [geom.bbox(o.shape, loc) for o, loc in local if "舵盘" not in o.name]
    boxes = [b for b in boxes if b is not None]
    lo, hi = np.min([b[0] for b in boxes], axis=0), np.max([b[1] for b in boxes], axis=0)
    ext = hi - lo
    order = np.argsort(-ext)  # longest first: length (45), then height (35), then width (25)
    ax_len, ax_h, ax_w = order[0], order[1], order[2]
    dims = np.zeros(3)
    dims[ax_len], dims[ax_h], dims[ax_w] = SERVO_LENGTH, SERVO_HEIGHT - SERVO_BOSS_H, SERVO_WIDTH
    centre = (lo + hi) / 2
    body = geom.box_mesh(dims, centre)
    feature = (
        f"vendor bbox {np.round(ext, 1).tolist()} -> datasheet {SERVO_LENGTH}x{SERVO_WIDTH}x{SERVO_HEIGHT}; "
        f"axes len/h/w = {ax_len}/{ax_h}/{ax_w}"
    )
    if horn is not None:
        hb = geom.bbox(horn.shape, next(loc for o, loc in local if o is horn))
        hc = (hb[0] + hb[1]) / 2
        sign = 1.0 if hc[ax_h] > centre[ax_h] else -1.0
        axis = np.zeros(3)
        axis[ax_h] = sign
        boss_c = centre.copy()
        boss_c[ax_len] = hc[ax_len]
        boss_c[ax_w] = hc[ax_w]
        boss_c[ax_h] = centre[ax_h] + sign * (dims[ax_h] / 2 + SERVO_BOSS_H / 2)
        body = trimesh.util.concatenate([body, geom.cylinder_along(axis, boss_c, SERVO_BOSS_D / 2, SERVO_BOSS_H)])
        feature += (
            f"; boss at drive-horn centre, {abs(hc[ax_len] - lo[ax_len]):.1f} mm from bbox end "
            f"(datasheet {SERVO_SHAFT_FROM_END})"
        )
    return body, feature


def _horn_primitive(hid: str, o: Occurrence) -> trimesh.Trimesh:
    b = geom.bbox(o.shape)
    ext = b[1] - b[0]
    ax = int(np.argmin(ext))
    axis = np.zeros(3)
    axis[ax] = 1.0
    return geom.cylinder_along(axis, (b[0] + b[1]) / 2, HORN_D / 2, HORN_T[hid])


def fastener_length(fid: str) -> float:
    """Tip-to-head-top length of the canonical primitive, mm."""
    _, shank_len, _, head_h = FASTENER_PRIMS[fid]
    return shank_len + head_h


def fastener_primitive(fid: str) -> trimesh.Trimesh:
    """One canonical mesh per fastener id (mm): axis +Z, tip at the origin, head at the +Z end.
    A placement is then fully described by its tip point and its tip->head direction (`screw_matrix`)."""
    shank_d, shank_len, head_d, head_h = FASTENER_PRIMS[fid]
    z = np.array([0.0, 0.0, 1.0])
    shank = geom.cylinder_along(z, np.array([0.0, 0.0, shank_len / 2]), shank_d / 2, shank_len)
    if head_h == 0.0:  # nut / spacer: one cylinder
        return shank
    head = geom.cylinder_along(z, np.array([0.0, 0.0, shank_len + head_h / 2]), head_d / 2, head_h)
    return trimesh.util.concatenate([shank, head])


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


def _fastener_pose(fid: str, o: Occurrence) -> np.ndarray:
    """Tip point and tip->head direction of a STEP fastener product, read off its own bbox: the axis is
    the longest extent (the thinnest for a nut) and the head is the end the centre of mass leans to."""
    shank_d, shank_len, _, head_h = FASTENER_PRIMS[fid]
    b = geom.bbox(o.shape)
    ext = b[1] - b[0]
    ax = int(np.argmin(ext)) if head_h == 0.0 and shank_len < shank_d else int(np.argmax(ext))
    centre = (b[0] + b[1]) / 2
    if head_h == 0.0:
        sign = 1.0
    else:
        sign = 1.0 if geom.centre_of_mass(o.shape)[ax] > centre[ax] else -1.0
    up = np.zeros(3)
    up[ax] = sign
    tip = centre.copy()
    tip[ax] = b[0][ax] if sign > 0 else b[1][ax]
    return geom.matrix_from_loc(o.location) @ screw_matrix(tip, up)


def write(out: Output, out_dir: Path, meta: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, mesh in out.meshes.items():
        mesh.export(out_dir / name)
    doc = {
        "meta": meta,
        "placements": [p.__dict__ for p in out.placements],
        "unplaced": out.unplaced,
    }
    (out_dir / "placements.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
