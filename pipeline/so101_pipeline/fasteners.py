"""Fasteners: where each one seats, which arm it belongs to, and which step installs it.

The assembly STEP places every screw exactly but says nothing about what it fastens. Three passes
turn the placements into what a renderer needs (all geometry in the GLB frame: metres, Y-up):

1. `attach_hole_hosts` — a fastener's `host` is every printed part whose material surrounds its shank
   while the shank itself is in free space: the shank passes through a hole of that part. Bounding-box
   containment (the earlier rule) hosted the motor-1 base screws on the base *motor holder* and the
   claw screws on the gripper *body*, so the viewer drew screws into parts that had no hole yet.
   The arm(s) a fastener belongs to follow from its hole hosts.
2. `synthesize_horn_screws` — the STEP models one horn-retaining M3x6 (motor 5). LeRobot fits one on
   every driven horn, so a screw is added on each remaining geared horn's axis at its outer face
   (approximation: true) and every horn screw carries `joint` instead of a host.
3. `allocate_steps` — walks the arm's steps in order and hands each `fasteners: [{id, qty}]` entry up
   to `qty` unassigned placements that are ready: a horn screw when the step's `servo_slot` is its
   joint, a hosted screw when every host in this arm is installed by then. Preference goes to screws
   whose hosts the step itself installs. The result is `step: {follower: 'F-011', ...}` per placement,
   which is all the viewer reads. Declared quantities that cannot be filled are reported and fail the
   data validator, so a step claiming screws the geometry cannot show is a build error.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh
import yaml

from . import geom
from .export import FASTENER_PRIMS, Output, Placement, fastener_length, screw_tip_up_glb, screw_transform_glb

HOLE_LINE_SAMPLES = 9
HOLE_RING_SAMPLES = 8
HOLE_RING_CLEARANCE_MM = 0.7  # ring radius = shank radius + this: inside the wall of a clearance hole
HORN_SCREW_ID = "m3x6"
HORN_SCREW_MATCH_MM = 2.0  # an existing m3x6 this close to a geared horn's axis is its horn screw


# ------------------------------------------------------------------------------------- steps
@dataclass
class Step:
    id: str
    prep: bool
    parts: list[str]
    servo_slot: str | None
    fasteners: list[tuple[str, int]]


def load_steps(data_dir: Path) -> dict[str, list[Step]]:
    """Steps per arm with `extends:` resolved the way scripts/src/resolve.ts does: every field of the
    parent, overridden by whatever the child lists (id/slug/assembly/extends stay the child's)."""
    raw: dict[str, list[dict]] = {}
    for f in sorted((data_dir / "assemblies").glob("*.yaml")):
        raw[f.stem] = yaml.safe_load(f.read_text()) or []
    index = {s["id"]: s for steps in raw.values() for s in steps}
    own = {"id", "slug", "assembly", "extends"}

    def resolve(s: dict, depth: int = 0) -> dict:
        if "extends" not in s:
            return s
        if depth > 5 or s["extends"] not in index:
            raise ValueError(f"step {s['id']}: cannot resolve extends {s['extends']!r}")
        base = resolve(index[s["extends"]], depth + 1)
        merged = {k: v for k, v in base.items() if k not in own}
        merged.update(s)
        return merged

    out: dict[str, list[Step]] = {}
    for arm, steps in raw.items():
        out[arm] = [
            Step(
                r["id"],
                bool(r.get("prep", False)),
                list(r.get("parts", [])),
                r.get("servo_slot"),
                [(f["id"], int(f["qty"])) for f in r.get("fasteners", []) or []],
            )
            for r in (resolve(s) for s in steps)
        ]
    return out


# ---------------------------------------------------------------------------------- geometry
def _matrix(p: Placement) -> np.ndarray:
    return np.array(p.transform).reshape(4, 4)


def _world_mesh(out: Output, p: Placement) -> trimesh.Trimesh:
    m = out.meshes[p.mesh].copy()
    m.apply_transform(_matrix(p))
    return m


def _tip_up(p: Placement) -> tuple[np.ndarray, np.ndarray]:
    return screw_tip_up_glb(p.transform)


def _perp(axis: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    u = np.cross(axis, [0.0, 1.0, 0.0])
    if np.linalg.norm(u) < 1e-3:
        u = np.cross(axis, [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    return u, np.cross(axis, u)


def seat(fastener: Placement, part: trimesh.Trimesh) -> str:
    """'hole' when the shank runs through free space with the part's material around it, 'solid' when
    the shank is inside the part (a clash), 'none' otherwise."""
    tip, up = _tip_up(fastener)
    length = fastener_length(fastener.id) * geom.MM_TO_M
    shank_r = FASTENER_PRIMS[fastener.id][0] / 2 * geom.MM_TO_M
    ring_r = shank_r + HOLE_RING_CLEARANCE_MM * geom.MM_TO_M
    ts = np.linspace(0.05, 0.95, HOLE_LINE_SAMPLES) * length
    line = np.array([tip + up * t for t in ts])
    lo, hi = part.bounds[0] - ring_r, part.bounds[1] + ring_r
    if not (np.all(line.max(axis=0) >= lo) and np.all(line.min(axis=0) <= hi)):
        return "none"
    u, v = _perp(up)
    ring = np.array(
        [
            tip + up * t + ring_r * (np.cos(a) * u + np.sin(a) * v)
            for t in ts
            for a in np.linspace(0, 2 * np.pi, HOLE_RING_SAMPLES, endpoint=False)
        ]
    )
    in_line = float(part.contains(line).mean())
    in_ring = float(part.contains(ring).mean())
    if in_line < 0.15 and in_ring > 0.25:
        return "hole"
    if in_line >= 0.5:
        return "solid"
    return "none"


def attach_hole_hosts(out: Output, arms: dict[str, list[str]]) -> dict[str, list[str]]:
    """Set `host` on every fastener to the printed parts it passes through a hole of, and narrow its
    `assembly` to the arms those parts belong to. Returns fastener name -> clashing part ids."""
    parts = [(p, _world_mesh(out, p)) for p in out.placements if p.kind == "part"]
    clashes: dict[str, list[str]] = {}
    for f in out.placements:
        if f.kind != "fastener":
            continue
        hosts, solid = [], []
        for p, mesh in parts:
            s = seat(f, mesh)
            if s == "hole":
                hosts.append(p.id)
            elif s == "solid":
                solid.append(p)
        f.host = sorted(set(hosts))
        if f.host:
            f.assembly = sorted({a for h in f.host for a in arms.get(h, [])}, key=["follower", "leader"].index)
        # a clash only counts against a part that shares an arm with the fastener
        same_arm = sorted({p.id for p in solid if set(p.assembly) & set(f.assembly)})
        if same_arm:
            clashes[f.name] = same_arm
    return clashes


def synthesize_horn_screws(out: Output) -> int:
    """Tag the STEP's horn screws with their joint and add one on every geared horn that has none."""
    servos = [p for p in out.placements if p.kind == "servo"]
    fasteners = [p for p in out.placements if p.kind == "fastener" and p.id == HORN_SCREW_ID]
    _, shank_len, _, _ = FASTENER_PRIMS[HORN_SCREW_ID]
    added = 0
    for horn in [p for p in out.placements if p.kind == "horn" and p.id == "servo-horn-geared"]:
        servo = next(s for s in servos if s.joint == horn.joint and s.assembly == horn.assembly)
        hm = _world_mesh(out, horn)
        local = out.meshes[horn.mesh]
        ax = int(np.argmin(local.bounds[1] - local.bounds[0]))
        axis = _matrix(horn)[:3, :3] @ np.eye(3)[ax]
        axis /= np.linalg.norm(axis)
        centre = hm.bounds.mean(axis=0)
        servo_centre = _world_mesh(out, servo).bounds.mean(axis=0)
        outward = axis if np.dot(axis, centre - servo_centre) > 0 else -axis
        thickness = (local.bounds[1] - local.bounds[0])[ax]
        outer_face = centre + outward * thickness / 2
        existing = None
        for f in fasteners:
            tip, _ = _tip_up(f)
            d = tip - centre
            radial = np.linalg.norm(d - np.dot(d, outward) * outward)
            if radial < HORN_SCREW_MATCH_MM * geom.MM_TO_M and abs(np.dot(d, outward)) < 0.012:
                existing = f
                break
        if existing is not None:
            existing.joint = horn.joint
            existing.host = []
            existing.assembly = list(horn.assembly)
            existing.feature = "horn-retaining screw on the drive horn axis (modelled in the STEP)"
            continue
        tip = outer_face - outward * shank_len * geom.MM_TO_M
        out.placements.append(
            Placement(
                "fastener",
                HORN_SCREW_ID,
                f"fastener-{HORN_SCREW_ID}.glb",
                f"M3x6 horn screw ({horn.joint}, synthesized)",
                horn.path,
                screw_transform_glb(tip, outward),
                True,
                "derived",
                "not modelled in the STEP: placed on the drive-horn axis with its head on the horn's outer face "
                '(LeRobot: "Secure the top horn with a M3x6mm screw")',
                "drive-horn axis; head base at the horn's outer face; shank into the output shaft",
                list(horn.assembly),
                [],
                horn.joint,
            )
        )
        added += 1
    return added


# --------------------------------------------------------------------------------- allocation
@dataclass
class Shortfall:
    arm: str
    step: str
    fastener: str
    declared: int
    allocated: int


def allocate_steps(out: Output, steps: dict[str, list[Step]], arms: dict[str, list[str]]) -> list[Shortfall]:
    shortfalls: list[Shortfall] = []
    fasteners = [p for p in out.placements if p.kind == "fastener"]
    for f in fasteners:
        f.step = {}
    for arm, arm_steps in steps.items():
        installed: set[str] = set()
        for s in arm_steps:
            if s.prep:
                continue
            installed |= set(s.parts)
            for fid, qty in s.fasteners:
                ready = []
                for f in fasteners:
                    if f.id != fid or arm not in f.assembly or arm in (f.step or {}):
                        continue
                    if f.joint:
                        if s.servo_slot == f.joint:
                            ready.append((0, f))
                        continue
                    hosts = [h for h in (f.host or []) if arm in arms.get(h, [])]
                    if hosts and all(h in installed for h in hosts):
                        ready.append((1 if any(h in s.parts for h in hosts) else 2, f))
                ready.sort(key=lambda r: r[0])
                for _, f in ready[:qty]:
                    f.step[arm] = s.id
                if len(ready) < qty:
                    shortfalls.append(Shortfall(arm, s.id, fid, qty, len(ready)))
    for f in fasteners:
        if f.step:
            f.assembly = sorted(f.step, key=["follower", "leader"].index)
    return shortfalls


def finalize(out: Output, data_dir: Path, parts: dict[str, dict]) -> dict:
    """Run the three passes; return a report dict for the CLI."""
    arms = {pid: list(p.get("assembly", ["follower", "leader"])) for pid, p in parts.items()}
    clashes = attach_hole_hosts(out, arms)
    added = synthesize_horn_screws(out)
    shortfalls = allocate_steps(out, load_steps(data_dir), arms)
    fasteners = [p for p in out.placements if p.kind == "fastener"]
    unallocated = Counter(f.id for f in fasteners if not f.step)
    return {
        "horn_screws_added": added,
        "clashes": clashes,
        "shortfalls": shortfalls,
        "unallocated": dict(unallocated),
        "per_step": Counter((arm, sid, f.id) for f in fasteners for arm, sid in (f.step or {}).items()),
    }
