# pipeline

Turns upstream CAD into what the viewer loads: one GLB per part (Y-up, metres,
file name = part id from `data/parts.yaml`) plus `out/placements.json` holding
each part's world transform and the name it carries in the STEP assembly tree.

Phase 2 fills this in. Run with `uv run so101-pipeline`.
