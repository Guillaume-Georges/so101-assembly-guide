from pathlib import Path

import numpy as np
import pytest
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS_Shape

from so101_pipeline import geom
from so101_pipeline.mapping import MappingError, resolve
from so101_pipeline.walk import Occurrence, normalise

REPO = Path(__file__).resolve().parents[2]


def test_normalise_strips_version_instance_and_copy_suffixes():
    assert normalise("Upper_arm_SO101 v9:1") == "Upper_arm_SO101"
    assert normalise("Wiring_holder v1 (2)") == "Wiring_holder"
    assert normalise("ST3215 Servo v2:6") == "ST3215 Servo"
    assert normalise("Base_08p v18") == "Base_08p"
    assert normalise("Component3") == "Component3"


def _occ(name, path, solids=1, raw=None):
    return Occurrence(
        normalise(name),
        raw or name,
        [normalise(p) for p in path],
        list(path),
        solids,
        TopLoc_Location(),
        TopoDS_Shape(),
        [],
    )


def test_resolve_by_geometry_name_alias_rule_and_failure():
    data = REPO / "data"
    mapping = REPO / "pipeline" / "mapping.yaml"
    occs = [
        _occ("Base_SO101 v12", ["SO101 Assembly v4"]),  # geometry_names
        _occ("Base_08p v18", ["SO101 Assembly v4"]),  # aka -> base-motor-holder-so101
        _occ("SOLID", ["SO101 Assembly v4", "Upper_arm_SO101 v9:1"]),  # @parent rule
        _occ("Pan Head Screw DIN EN ISO 7045 - M3 x 6 - H Steel 4.6 Plain v1", ["SO101 Assembly v4"]),
        _occ("Component3", ["SO101 Assembly v4"]),  # cable via geometry_names -> kind cable
        _occ("Wiring_holder v1 (1)", ["SO101 Assembly v4", "Upper_arm_SO101 v9:1"], solids=0),  # skipped
    ]
    res = resolve(occs, data, mapping)
    by = {r.occ.raw_name: r for r in res}
    assert by["Base_SO101 v12"].id == "base-so101" and by["Base_SO101 v12"].via == "geometry_names"
    assert by["Base_08p v18"].id == "base-motor-holder-so101" and by["Base_08p v18"].via == "aka"
    assert by["SOLID"].id == "upper-arm-so101"
    assert by["Pan Head Screw DIN EN ISO 7045 - M3 x 6 - H Steel 4.6 Plain v1"].kind == "fastener"
    assert by["Component3"].kind == "cable" and by["Component3"].id == "servo-cable-3pin"
    assert len(res) == 5  # the empty component is not a placement

    with pytest.raises(MappingError, match="unmapped STEP occurrences"):
        resolve([_occ("Mystery_Bracket v1", ["SO101 Assembly v4"])], data, mapping)


def test_glb_frame_conversion_is_consistent_for_meshes_and_transforms():
    import trimesh

    box = trimesh.creation.box(extents=[10.0, 20.0, 30.0])  # mm, Z-up
    t = np.eye(4)
    t[:3, 3] = [100.0, 200.0, 300.0]  # translate in mm
    world_mm = trimesh.transform_points(box.vertices, t)
    expected = np.column_stack([world_mm[:, 0], world_mm[:, 2], -world_mm[:, 1]]) * 0.001  # (x, z, -y) m
    glb_mesh = geom.mesh_to_glb_frame(box)
    got = trimesh.transform_points(glb_mesh.vertices, geom.to_glb_frame(t))
    assert np.allclose(got, expected, atol=1e-9)
