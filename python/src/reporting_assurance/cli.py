"""Local-only API/CLI parity. Errors are fixed codes and never include source values."""
import argparse
import json
import sys
from pathlib import Path
from .contracts import ConfigError, load_bundle, bundle_digest, MAX_CONFIG_BYTES
from .adapters import read_csv
from .engine import evaluate


def main(argv=None):
    parser = argparse.ArgumentParser(prog="reporting-assurance")
    parser.add_argument("--rules", required=True)
    parser.add_argument("--csv")
    parser.add_argument("--evaluation-time")
    parser.add_argument("--mode", choices=["preview", "production"], default="preview")
    parser.add_argument("--trusted-digest", action="append", default=[])
    parser.add_argument("--reference", action="append", default=[], metavar="NAME=LOCAL_CSV")
    parser.add_argument("--diagnostic-limit", type=int, default=0)
    parser.add_argument("--digest-only", action="store_true")
    parser.add_argument("--include-analysis", action="store_true", help="Run the bounded Tier 2 specification embedded in the rule bundle")
    args = parser.parse_args(argv)
    try:
        path = Path(args.rules)
        if path.stat().st_size > MAX_CONFIG_BYTES: raise ConfigError("config_resource_limit")
        config = load_bundle(path.read_text(encoding="utf-8"))
        if args.digest_only:
            print(bundle_digest(config)); return 0
        if not args.csv: raise ConfigError("csv_required")
        types = {}
        for r in config["rules"]:
            if r["operator"] == "types":
                for field, spec in r["params"]["fields"].items():
                    if field in types and types[field] != spec["type"]: raise ConfigError("conflicting_csv_types")
                    types[field] = spec["type"]
        rows = read_csv(args.csv, types=types)
        refs = {}
        for ref in args.reference:
            name, sep, filename = ref.partition("=")
            if not sep or not name or name in refs: raise ConfigError("invalid_reference_argument")
            # Reference columns may differ from the primary table. Convert only columns actually present.
            import csv
            try:
                with Path(filename).open(encoding="utf-8-sig", newline="") as h: header = next(csv.reader(h), [])
            except (csv.Error, UnicodeError): raise ConfigError("invalid_csv") from None
            ref_types = {f: t for f, t in types.items() if f in header}
            for r in config["rules"]:
                if r["operator"] == "reconcile" and r["params"]["reference"] == name:
                    ref_types[r["params"]["control_measure"]] = "decimal"
            refs[name] = read_csv(filename, types=ref_types)
        report = evaluate(rows, config, evaluation_time=args.evaluation_time, references=refs,
                          mode=args.mode, trusted_digests=args.trusted_digest, diagnostic_limit=args.diagnostic_limit)
        gate = report["gate"]
        if args.include_analysis:
            if "analysis" not in config: raise ConfigError("analysis_spec_required")
            from .analysis import analyze
            report = analyze(rows, config, evaluation_time=args.evaluation_time, references=refs, mode=args.mode, trusted_digests=args.trusted_digest)
        print(json.dumps(report, sort_keys=True, ensure_ascii=True, allow_nan=False))
        return {"pass": 0, "non_gating": 0, "fail": 1, "blocked": 2}[gate]
    except ConfigError as exc:
        print(json.dumps({"outcome": "error", "reason": str(exc)})); return 2
    except (OSError, UnicodeError, ValueError, OverflowError):
        print(json.dumps({"outcome": "error", "reason": "input_unavailable_or_invalid"})); return 2


if __name__ == "__main__": sys.exit(main())
