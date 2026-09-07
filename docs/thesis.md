# Thesis

The official SO-101 README plus a build video is what every first-time builder
already has. What they lack at the bench is, per step: *which* of the 20-odd
printed parts, *which* of the six servos (they differ by gear ratio and are
not interchangeable), in *which* orientation, with *which* screws, and *how
to know they got it right* before the next step buries the mistake.

This project encodes that as data (`data/`) with a source for every fact, and
renders it two ways: an interactive 3D viewer driven by the real assembled
STEP geometry, and a printable checklist. Where public sources disagree, the
disagreement is shown, not resolved silently.

Accuracy beats polish. A wrong step is worse than a missing step.

The same repo shape transfers to any open-hardware kit: swap `upstream/` and
`data/`, keep `pipeline/` and `viewer/`.
