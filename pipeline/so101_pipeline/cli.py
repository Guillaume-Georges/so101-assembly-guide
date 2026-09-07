"""so101-pipeline: STEP assembly -> per-part GLB + placements.json."""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DEFAULT_STEP = REPO / "upstream/SO-ARM100/STEP/SO101/SO101 Assembly.step"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="so101-pipeline")
    ap.add_argument("--version", action="store_true")
    ap.add_argument("--step", default=str(DEFAULT_STEP))
    ap.add_argument("--data", default=str(REPO / "data"))
    ap.add_argument("--mapping", default=str(HERE.parent / "mapping.yaml"))
    ap.add_argument("--out", default=str(HERE.parent / "out"))
    ap.add_argument("--dry-run", action="store_true", help="walk and map only; write nothing")
    args = ap.parse_args(argv)
    if args.version:
        print("so101-pipeline 0.1.0")
        return 0
    import numpy as np

    from . import cables, export, hand_place
    from .mapping import MappingError, load_parts, resolve
    from .walk import walk_step

    occs = walk_step(args.step)
    print(
        f"walked {sum(1 for o in occs if o.solids > 0)} solid leaves, "
        f"{sum(1 for o in occs if o.solids == -1)} assemblies"
    )
    try:
        resolved = resolve(occs, Path(args.data), Path(args.mapping))
    except MappingError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 1
    print("mapped:", dict(Counter(r.kind for r in resolved)))
    if args.dry_run:
        return 0
    parts, _ = load_parts(Path(args.data))
    out = export.build(resolved, occs, parts)
    hand_place.add_leader_parts(out, occs, Path(args.step).parent, Path(args.data))
    commit = "unknown"
    try:
        commit = subprocess.check_output(
            ["git", "-C", str(Path(args.step).parent), "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:
        pass
    anchors = {}
    for p in out.placements:
        if p.kind in ("servo", "board") and "hand" not in p.name:
            m = np.array(p.transform).reshape(4, 4)
            key = "board" if p.kind == "board" else cables.JOINTS[int(p.name.rsplit(":", 1)[1]) - 1]
            v = out.meshes[p.mesh].vertices
            w = (m[:3, :3] @ v.T).T + m[:3, 3]
            anchors[key] = np.array([w.min(axis=0), w.max(axis=0)])
    derived = cables.derive_cables(out, anchors)
    written = cables.write_cables_yaml(derived, Path(args.data))
    print(f"✓ wrote {len(derived)} derived cable centrelines to {written}")
    export.write(
        out,
        Path(args.out),
        {
            "step": str(Path(args.step).relative_to(REPO)) if str(args.step).startswith(str(REPO)) else args.step,
            "upstream_commit": commit,
            "units": "m",
            "up": "Y",
            "transform": "row-major 4x4, GLB frame",
        },
    )
    print(f"✓ wrote {len(out.meshes)} meshes and {len(out.placements)} placements to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
