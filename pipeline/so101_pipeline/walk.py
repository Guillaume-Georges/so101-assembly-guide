"""Walk a STEP assembly with XCAF and return every leaf occurrence with its world transform."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS_Shape
from OCP.XCAFDoc import XCAFDoc_DocumentTool

_SUFFIX = re.compile(r"(\s+v\d+)?(:\d+)?(\s+\(\d+\))?$")


def normalise(name: str) -> str:
    """'Upper_arm_SO101 v9:1' -> 'Upper_arm_SO101'; 'Wiring_holder v1 (2)' -> 'Wiring_holder'."""
    prev = None
    while prev != name:
        prev, name = name, _SUFFIX.sub("", name)
    return name.strip()


@dataclass
class Occurrence:
    name: str  # normalised product name of the leaf
    raw_name: str
    path: list[str]  # normalised ancestor names, root first
    raw_path: list[str]  # raw occurrence names of the ancestors (unique per instance)
    solids: int  # -1 for an assembly node, 0 for an empty component
    location: TopLoc_Location
    shape: TopoDS_Shape  # in its own (product) frame; apply `location` for world
    matrix: list[list[float]] = field(default_factory=list)  # 3x4 world transform, mm

    @property
    def path_str(self) -> str:
        return "/".join(self.path)


def _name_of(label: TDF_Label) -> str:
    n = TDataStd_Name()
    if label.FindAttribute(TDataStd_Name.GetID_s(), n):
        return n.Get().ToExtString()
    return "?"


def _count_solids(shape: TopoDS_Shape) -> int:
    n, ex = 0, TopExp_Explorer(shape, TopAbs_SOLID)
    while ex.More():
        n += 1
        ex.Next()
    return n


def walk_step(path: str) -> list[Occurrence]:
    doc = TDocStd_Document(TCollection_ExtendedString("doc"))
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    if reader.ReadFile(path) != IFSelect_RetDone:
        raise RuntimeError(f"cannot read STEP: {path}")
    reader.Transfer(doc)
    st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    out: list[Occurrence] = []

    def visit(label: TDF_Label, loc: TopLoc_Location, ancestors: list[str], raw_anc: list[str]) -> None:
        ref = TDF_Label()
        is_ref = st.GetReferredShape_s(label, ref)
        target = ref if is_ref else label
        raw = _name_of(label)
        tname = _name_of(target) if is_ref else raw
        here = loc.Multiplied(st.GetLocation_s(label)) if is_ref else loc
        if st.IsAssembly_s(target):
            t = here.Transformation()
            m = [[t.Value(i, j) for j in range(1, 5)] for i in range(1, 4)]
            out.append(Occurrence(normalise(tname), raw, ancestors, raw_anc, -1, here, TopoDS_Shape(), m))
            comps = TDF_LabelSequence()
            st.GetComponents_s(target, comps)
            for i in range(1, comps.Length() + 1):
                visit(comps.Value(i), here, [*ancestors, normalise(raw)], [*raw_anc, raw])
            return
        shape = st.GetShape_s(target)
        t = here.Transformation()
        m = [[t.Value(i, j) for j in range(1, 5)] for i in range(1, 4)]
        out.append(Occurrence(normalise(tname), raw, ancestors, raw_anc, _count_solids(shape), here, shape, m))

    roots = TDF_LabelSequence()
    st.GetFreeShapes(roots)
    for i in range(1, roots.Length() + 1):
        visit(roots.Value(i), TopLoc_Location(), [], [])
    return out
