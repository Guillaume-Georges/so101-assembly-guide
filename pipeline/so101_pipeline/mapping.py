"""Resolve every STEP occurrence to a data id, or fail loudly."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from .walk import Occurrence

KINDS = {"part", "servo", "horn", "board", "fastener", "cable", "skip"}


@dataclass
class Resolved:
    occ: Occurrence
    kind: str
    id: str
    approximation: bool
    note: str | None
    via: str  # 'geometry_names' | 'aka' | 'rule'


class MappingError(Exception):
    pass


def load_parts(data_dir: Path) -> tuple[dict[str, dict], dict[str, dict]]:
    parts = yaml.safe_load((data_dir / "parts.yaml").read_text()) or []
    fasteners = yaml.safe_load((data_dir / "fasteners.yaml").read_text()) or []
    return {p["id"]: p for p in parts}, {f["id"]: f for f in fasteners}


def _name_index(parts: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    by_geom: dict[str, str] = {}
    by_aka: dict[str, str] = {}
    for pid, p in parts.items():
        for n in p.get("geometry_names", []) or []:
            by_geom[n] = pid
        for n in p.get("aka", []) or []:
            by_aka[n] = pid
    return by_geom, by_aka


def resolve(occs: list[Occurrence], data_dir: Path, mapping_file: Path) -> list[Resolved]:
    parts, fasteners = load_parts(data_dir)
    by_geom, by_aka = _name_index(parts)
    rules = yaml.safe_load(mapping_file.read_text())["rules"]
    for r in rules:
        if r["kind"] not in KINDS:
            raise MappingError(f"unknown kind {r['kind']!r} in {mapping_file}")
    out: list[Resolved] = []
    problems: list[str] = []
    for o in occs:
        if o.solids <= 0:
            continue  # assembly node, or empty component (the Wiring_holder placeholders, D-003)
        res = _resolve_one(o, parts, fasteners, by_geom, by_aka, rules)
        if res is None:
            problems.append(f"{o.path_str}/{o.raw_name}")
        else:
            out.append(res)
    if problems:
        raise MappingError(
            "unmapped STEP occurrences (add a rule or a geometry_names/aka entry):\n  " + "\n  ".join(problems)
        )
    return out


def _kind_for(part: dict) -> str:
    return "cable" if part.get("category") == "cable" else "part"


def _resolve_one(o, parts, fasteners, by_geom, by_aka, rules) -> Resolved | None:
    candidates = [o.name, *reversed(o.path)]
    # Printed parts: exact geometry name first, then alias (keeps the flag), on leaf then ancestors.
    # Only when the ancestor chain is NOT a vendor model (those are handled by rules on path).
    if not any(p.startswith("ST3215 Servo") or p.startswith("Bus Servo Adapter") for p in o.path):
        for c in candidates:
            if c in by_geom:
                return Resolved(o, _kind_for(parts[by_geom[c]]), by_geom[c], False, None, "geometry_names")
        for c in candidates:
            if c in by_aka:
                return Resolved(
                    o,
                    _kind_for(parts[by_aka[c]]),
                    by_aka[c],
                    False,
                    "matched via aka; part stays unverified (D-005)",
                    "aka",
                )
    for r in rules:
        m = r["match"]
        if "name" in m and not re.search(m["name"], o.name):
            continue
        if "path" in m and not re.search(m["path"], o.path_str + "/"):
            continue
        if "parent" in m and not (o.path and re.search(m["parent"], o.path[-1])):
            continue
        rid = r["id"]
        if rid == "@parent":
            parent = o.path[-1]
            rid = by_geom.get(parent) or by_aka.get(parent)
            if rid is None:
                return None
        if r["kind"] == "fastener" and rid not in fasteners:
            raise MappingError(f"rule maps to unknown fastener id {rid!r}")
        if r["kind"] in {"part", "servo", "board", "cable", "horn"} and rid not in parts:
            raise MappingError(f"rule maps to unknown part id {rid!r}")
        return Resolved(o, r["kind"], rid, bool(r.get("approximation", False)), r.get("note"), "rule")
    return None
