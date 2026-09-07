"""Tessellation, unit/axis conversion and datasheet primitives."""

from __future__ import annotations

import numpy as np
import trimesh
from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Tool
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.GProp import GProp_GProps
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Shape

# STEP is millimetres, Z-up. GLB is metres, Y-up: (x, y, z) -> (x, z, -y) / 1000.
R_ZUP_TO_YUP = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, -1.0, 0.0]])
MM_TO_M = 0.001


def tessellate(shape: TopoDS_Shape, linear_deflection: float = 0.08, angular: float = 0.35) -> trimesh.Trimesh:
    """Triangulate a shape in its own frame (mm). Returns an empty mesh for shapes without faces."""
    BRepMesh_IncrementalMesh(shape, linear_deflection, False, angular, True)
    verts: list[np.ndarray] = []
    faces: list[np.ndarray] = []
    offset = 0
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        face = TopoDS.Face_s(ex.Current())
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        ex.Next()
        if tri is None:
            continue
        t = loc.Transformation()
        n = tri.NbNodes()
        v = np.empty((n, 3))
        for i in range(1, n + 1):
            p = tri.Node(i).Transformed(t)
            v[i - 1] = (p.X(), p.Y(), p.Z())
        m = tri.NbTriangles()
        f = np.empty((m, 3), dtype=np.int64)
        rev = face.Orientation() == TopAbs_REVERSED
        for i in range(1, m + 1):
            a, b, c = tri.Triangle(i).Get()
            f[i - 1] = (a, c, b) if rev else (a, b, c)
        verts.append(v)
        faces.append(f - 1 + offset)
        offset += n
    if not verts:
        return trimesh.Trimesh()
    return trimesh.Trimesh(np.vstack(verts), np.vstack(faces), process=True)


def bbox(shape: TopoDS_Shape, loc: TopLoc_Location | None = None) -> np.ndarray | None:
    box = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape.Moved(loc) if loc else shape, box, True, False)
    if box.IsVoid():
        return None
    return np.array(box.Get()).reshape(2, 3)


def volume(shape: TopoDS_Shape) -> float:
    g = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, g)
    return g.Mass()


def centre_of_mass(shape: TopoDS_Shape) -> np.ndarray:
    g = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, g)
    c = g.CentreOfMass()
    return np.array([c.X(), c.Y(), c.Z()])


def matrix_from_loc(loc: TopLoc_Location) -> np.ndarray:
    t = loc.Transformation()
    m = np.eye(4)
    for i in range(3):
        for j in range(4):
            m[i, j] = t.Value(i + 1, j + 1)
    return m


def to_glb_frame(m_mm_zup: np.ndarray) -> np.ndarray:
    """Convert a 4x4 world transform (mm, Z-up) into the GLB frame (m, Y-up) for a mesh whose
    vertices were converted with `mesh_to_glb_frame`."""
    C = np.eye(4)
    C[:3, :3] = R_ZUP_TO_YUP * MM_TO_M
    Cinv = np.linalg.inv(C)
    return C @ m_mm_zup @ Cinv


def to_step_frame(m_glb: np.ndarray) -> np.ndarray:
    """Inverse of `to_glb_frame`: a GLB-frame transform (m, Y-up) back to the STEP frame (mm, Z-up)."""
    C = np.eye(4)
    C[:3, :3] = R_ZUP_TO_YUP * MM_TO_M
    return np.linalg.inv(C) @ m_glb @ C


def points_to_step_frame(pts: np.ndarray) -> np.ndarray:
    """GLB-frame points (m, Y-up) to STEP-frame points (mm, Z-up)."""
    return (R_ZUP_TO_YUP.T @ np.asarray(pts).T).T / MM_TO_M


def points_to_glb_frame(pts: np.ndarray) -> np.ndarray:
    """STEP-frame points (mm, Z-up) to GLB-frame points (m, Y-up)."""
    return (R_ZUP_TO_YUP @ np.asarray(pts).T).T * MM_TO_M


def mesh_to_glb_frame(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    out = mesh.copy()
    out.apply_transform(np.diag([MM_TO_M, MM_TO_M, MM_TO_M, 1.0]))
    r = np.eye(4)
    r[:3, :3] = R_ZUP_TO_YUP
    out.apply_transform(r)
    return out


# ---------------------------------------------------------------- primitives (mm, part frame)
def box_mesh(extents: np.ndarray, centre: np.ndarray) -> trimesh.Trimesh:
    m = trimesh.creation.box(extents=extents)
    m.apply_translation(centre)
    return m


def cylinder_along(
    axis: np.ndarray, centre: np.ndarray, radius: float, height: float, sections: int = 32
) -> trimesh.Trimesh:
    m = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    axis = axis / np.linalg.norm(axis)
    z = np.array([0.0, 0.0, 1.0])
    if np.allclose(axis, z):
        rot = np.eye(4)
    elif np.allclose(axis, -z):
        rot = trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0])
    else:
        rot = trimesh.transformations.rotation_matrix(np.arccos(np.clip(np.dot(z, axis), -1, 1)), np.cross(z, axis))
    m.apply_transform(rot)
    m.apply_translation(centre)
    return m
