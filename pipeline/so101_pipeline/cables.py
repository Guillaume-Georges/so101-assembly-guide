"""Cable centrelines derived from the upstream-drawn cable bodies (D-003 sibling: cables are the only
wiring geometry upstream publishes). Written into data/cables.yaml as `derived: true` entries; a
hand-authored entry with the same id (`derived: false`) is kept untouched on regeneration.

Method (per body, GLB frame, metres): sample the surface, build a k-NN graph, find the two
geodesically farthest points (double sweep), Dijkstra between them, re-centre each path point by
averaging its surface neighbours within one cable diameter, then Ramer–Douglas–Peucker.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import trimesh
import yaml
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

from .export import Output

RDP_TOL = 0.0015  # 1.5 mm
JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]


def _rdp(pts: np.ndarray, tol: float) -> np.ndarray:
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    n = np.linalg.norm(ab)
    if n == 0:
        d = np.linalg.norm(pts - a, axis=1)
    else:
        d = np.linalg.norm(np.cross(pts - a, ab / n), axis=1)
    i = int(np.argmax(d))
    if d[i] > tol:
        return np.vstack([_rdp(pts[: i + 1], tol)[:-1], _rdp(pts[i:], tol)])
    return np.vstack([a, b])


def centreline(mesh: trimesh.Trimesh, n_samples: int = 3000, k: int = 12) -> tuple[np.ndarray, float]:
    pts, _ = trimesh.sample.sample_surface(mesh, n_samples)
    tree = cKDTree(pts)
    d, idx = tree.query(pts, k=k + 1)
    rows = np.repeat(np.arange(len(pts)), k)
    cols = idx[:, 1:].reshape(-1)
    w = d[:, 1:].reshape(-1)
    from scipy.sparse import coo_matrix

    g = coo_matrix((w, (rows, cols)), shape=(len(pts), len(pts))).tocsr()
    dist0 = dijkstra(g, indices=0, directed=False)
    a = int(np.argmax(np.where(np.isfinite(dist0), dist0, -1)))
    dist_a, pred = dijkstra(g, indices=a, directed=False, return_predecessors=True)
    b = int(np.argmax(np.where(np.isfinite(dist_a), dist_a, -1)))
    path = [b]
    while path[-1] != a:
        path.append(int(pred[path[-1]]))
    path = np.array(path[::-1])
    # cable diameter estimate from volume / geodesic length (cylinder)
    length = float(dist_a[b])
    diameter = 2 * float(np.sqrt(max(mesh.volume, 1e-12) / (np.pi * max(length, 1e-9))))
    centred = np.array([pts[tree.query_ball_point(pts[i], diameter)].mean(axis=0) for i in path])
    return _rdp(centred, RDP_TOL), diameter


def _box_dist(p: np.ndarray, box: np.ndarray) -> float:
    return float(np.linalg.norm(np.maximum(0.0, np.maximum(box[0] - p, p - box[1]))))


def _ends(line: np.ndarray, anchors: dict[str, np.ndarray]) -> tuple[str, str]:
    """Nearest anchor bbox for each end, forced distinct: minimise d(a, start) + d(b, end) over a != b."""
    names = list(anchors)
    best = None
    for a in names:
        for b in names:
            if a == b:
                continue
            cost = _box_dist(line[0], anchors[a]) + _box_dist(line[-1], anchors[b])
            if best is None or cost < best[0]:
                best = (cost, a, b)
    assert best is not None
    return best[1], best[2]


def derive_cables(out: Output, anchors: dict[str, np.ndarray]) -> list[dict]:
    """anchors: 'board' | joint name -> world bbox (2x3, m) of the servo/board placement."""
    cables = []
    for p in out.placements:
        if p.kind != "cable" or "050375033" in p.mesh:
            continue
        mesh = out.meshes[p.mesh].copy()
        mesh.apply_transform(np.array(p.transform).reshape(4, 4))
        line, diameter = centreline(mesh)
        ends = list(_ends(line, anchors))
        # orient from the base side (lower joint / board) to the tip
        order = {"board": -1, **{j: i for i, j in enumerate(JOINTS)}}
        if order[ends[0]] > order[ends[1]]:
            line, ends = line[::-1], ends[::-1]
        cables.append(
            {
                "id": f"cable-{ends[0].replace('_', '-')}-to-{ends[1].replace('_', '-')}",
                "from": ends[0],
                "to": ends[1],
                "assembly": ["follower", "leader"],
                "diameter_m": round(diameter, 4),
                "path": [[round(float(x), 4) for x in pt] for pt in line],
                "derived": True,
                "approximation": True,
                "source": [
                    {
                        "ref": "upstream/SO-ARM100/STEP/SO101/SO101 Assembly.step",
                        "note": f"derived from STEP cable body {p.name}: surface k-NN graph, farthest-point geodesic, "
                        f"neighbour re-centring, RDP 1.5 mm; endpoints by nearest servo/board",
                    }
                ],
            }
        )
    cables.sort(key=lambda c: (c["from"] != "board", JOINTS.index(c["to"]) if c["to"] in JOINTS else 99))
    return cables


def write_cables_yaml(cables: list[dict], data_dir: Path) -> Path:
    path = data_dir / "cables.yaml"
    existing = yaml.safe_load(path.read_text()) if path.exists() else []
    existing = [c for c in (existing or []) if isinstance(c, dict)]
    manual = {c["id"]: c for c in existing if not c.get("derived", False)}
    merged = [manual.get(c["id"], c) for c in cables]
    merged += [c for cid, c in manual.items() if cid not in {c["id"] for c in cables}]
    yaml.SafeDumper.ignore_aliases = lambda *a: True  # type: ignore[assignment]
    header = (
        "# cables.yaml — servo bus cable routes, metres, GLB frame (Y-up). Schema: data/schema/cables.json\n"
        "# Entries with derived: true are written by `uv run so101-pipeline` from the STEP cable bodies and are\n"
        "# overwritten on regeneration; set derived: false on an entry to hand-author it (it then wins).\n"
    )
    path.write_text(header + yaml.safe_dump(merged, sort_keys=False, allow_unicode=True, width=110))
    return path
