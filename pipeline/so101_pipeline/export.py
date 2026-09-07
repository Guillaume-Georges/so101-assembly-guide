"""Build per-part GLBs and placements.json from the resolved STEP occurrences.

Printed parts and cables: the upstream mesh, in its product frame.
Servos, horns, controller board, fasteners: datasheet / bounding-box primitives placed at the
vendor model's transform (approximation: true). No vendor mesh is written (SOURCES.md).
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
    "tapping-0-48": (1.5, 4.8, 2.9, 1.2),
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
    host: list[str] | None = None  # fasteners/horns: part ids whose bbox (+2 mm) contains this placement


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
            mesh = _add_mesh(out, f"fastener-{r.id}.glb", _fastener_primitive(r.id, o))
            _place(
                out,
                "fastener",
                r.id,
                mesh,
                o,
                geom.matrix_from_loc(o.location),
                True,
                r.via,
                r.note,
            )
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


def _fastener_primitive(fid: str, o: Occurrence) -> trimesh.Trimesh:
    shank_d, shank_len, head_d, head_h = FASTENER_PRIMS[fid]
    b = geom.bbox(o.shape)
    ext = b[1] - b[0]
    ax = int(np.argmax(ext))
    axis = np.zeros(3)
    axis[ax] = 1.0
    centre = (b[0] + b[1]) / 2
    if head_h == 0.0:  # nut / spacer: one cylinder
        return geom.cylinder_along(axis, centre, shank_d / 2, shank_len)
    # head sits where the centre of mass leans
    com = geom.centre_of_mass(o.shape)
    sign = 1.0 if com[ax] > centre[ax] else -1.0
    head_c = centre.copy()
    head_c[ax] = b[1][ax] if sign > 0 else b[0][ax]
    head_c[ax] -= sign * head_h / 2
    shank_c = head_c.copy()
    shank_c[ax] -= sign * (head_h / 2 + shank_len / 2)
    return trimesh.util.concatenate(
        [
            geom.cylinder_along(axis, head_c, head_d / 2, head_h),
            geom.cylinder_along(axis, shank_c, shank_d / 2, shank_len),
        ]
    )


def attach_hosts(out: Output) -> None:
    """Give every fastener a `host`: the printed parts whose world bbox (+2 mm) contains its centre.
    The viewer shows a fastener when its step lists the fastener id and one host is installed."""
    boxes = []
    for p in out.placements:
        if p.kind != "part":
            continue
        m = np.array(p.transform).reshape(4, 4)
        v = out.meshes[p.mesh].vertices
        w = (m[:3, :3] @ v.T).T + m[:3, 3]
        boxes.append((p.id, w.min(axis=0) - 0.002, w.max(axis=0) + 0.002))
    for p in out.placements:
        if p.kind != "fastener":
            continue
        c = np.array(p.transform).reshape(4, 4)[:3, 3]
        p.host = sorted({pid for pid, lo, hi in boxes if np.all(c >= lo) and np.all(c <= hi)})


def write(out: Output, out_dir: Path, meta: dict) -> None:
    attach_hosts(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, mesh in out.meshes.items():
        mesh.export(out_dir / name)
    doc = {
        "meta": meta,
        "placements": [p.__dict__ for p in out.placements],
        "unplaced": out.unplaced,
    }
    (out_dir / "placements.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
