"""Command-line entry point. The exporter arrives in Phase 2."""

import sys


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if "--version" in args:
        print("so101-pipeline 0.0.0")
        return 0
    print("so101-pipeline: STEP exporter is scheduled for Phase 2.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
