"""One authoritative deterministic Tier 1 executor; no IO, clock reads or mutation."""
from collections import Counter, defaultdict
from datetime import datetime, date, time, timezone
from decimal import localcontext
from .contracts import ConfigError, validate_bundle, bundle_digest, number, MAX_ROWS
from .table import table, key, token, valid_type, decimal, exact_sum, instant, iso_date, math_context


def result(outcome, reason, counts=None, indices=None):
    return {"outcome": outcome, "reason": reason, "counts": counts or {}}, indices or []


def field_check(rows, fields):
    bad = [i for i, row in enumerate(rows) if any(f not in row or row[f] is None for f in fields)]
    return bad


def expected_keys(p, refs, fields, inline):
    if inline in p:
        return {tuple(token(v) for v in values) for values in p[inline]}
    if p.get("reference") not in refs: return None
    source = refs[p["reference"]]
    if not source: return None
    keys = [key(r, fields) for r in source]
    if len(set(keys)) != len(keys): raise ValueError
    return set(keys)


def run(op, p, rows, refs, at):
    if op == "required_fields":
        bad = [i for i, r in enumerate(rows) if any(f not in r for f in p["fields"])]
        return result("fail" if bad else "pass", "missing_fields" if bad else "fields_present", {"affected_rows": len(bad)}, bad)
    if op == "types":
        bad = [i for i, r in enumerate(rows) if any(f not in r or (r[f] is None and not s["nullable"]) or
               (r.get(f) is not None and not valid_type(r[f], s["type"])) for f, s in p["fields"].items())]
        return result("fail" if bad else "pass", "type_or_nullability" if bad else "types_valid", {"affected_rows": len(bad)}, bad)
    if op == "unique":
        fields = p["fields"]
        bad = field_check(rows, fields)
        bad_set = set(bad)
        seen = set(); duplicate = []
        for i, row in enumerate(rows):
            if i in bad_set: continue
            k = key(row, fields)
            if k in seen: duplicate.append(i)
            seen.add(k)
        return result("fail" if bad or duplicate else "pass", "invalid_grain" if bad or duplicate else "grain_unique",
                      {"missing_key_rows": len(bad), "duplicate_excess_rows": len(duplicate)}, bad + duplicate)
    if op in ("allowed_values", "range"):
        field = p["field"]; bad = []
        allowed = {token(v) for v in p.get("values", [])}
        for i, row in enumerate(rows):
            value = row.get(field)
            invalid = field not in row or (op == "range" and value is None)
            if not invalid:
                if op == "allowed_values": invalid = token(value) not in allowed
                else:
                    try:
                        d = decimal(value)
                        invalid = ("min" in p and d < number(p["min"])) or ("max" in p and d > number(p["max"]))
                    except ValueError: invalid = True
            if invalid: bad.append(i)
        return result("fail" if bad else "pass", "outside_declared_domain" if bad else "declared_domain_valid", {"affected_rows": len(bad)}, bad)
    if op == "coverage":
        fields = p["fields"]
        try: expected = expected_keys(p, refs, fields, "expected")
        except ValueError: return result("error", "invalid_coverage_reference")
        if expected is None: return result("not_evaluated", "coverage_reference_unavailable")
        bad = field_check(rows, fields)
        bad_set = set(bad)
        actual = {key(r, fields) for i, r in enumerate(rows) if i not in bad_set}
        missing = len(expected - actual); extra = len(actual - expected)
        failed = bool(bad or missing or (extra and not p.get("allow_extra", False)))
        return result("fail" if failed else "pass", "coverage_mismatch" if failed else "declared_coverage_present",
                      {"missing_groups": missing, "extra_groups": extra, "invalid_key_rows": len(bad)}, bad)
    if op == "freshness":
        if at is None: return result("not_evaluated", "evaluation_time_required")
        partitions = p["partition_by"]
        try:
            expected = expected_keys(p, refs, partitions, "expected_partitions") if partitions else {()}
        except ValueError: return result("error", "invalid_partition_reference")
        if partitions and expected is None: return result("not_evaluated", "expected_partitions_required")
        latest = {}; bad = []; future = []
        for i, row in enumerate(rows):
            try:
                k = key(row, partitions)
                value = row[p["field"]]
                # Freshness requires a timestamp, not an arbitrary date-looking column.
                stamp = instant(value)
                if (stamp - at).total_seconds() > p.get("future_tolerance_seconds", 0): future.append(i)
                latest[k] = max(stamp, latest.get(k, stamp))
            except (ValueError, KeyError, OverflowError, TypeError): bad.append(i)
        missing = len(expected - latest.keys())
        stale = sum((at - latest[k]).total_seconds() > p["max_age_seconds"] for k in expected & latest.keys())
        failed = bool(bad or future or missing or stale)
        return result("fail" if failed else "pass", "partition_freshness_failed" if failed else "partitions_fresh",
                      {"missing_partitions": missing, "stale_partitions": stale, "invalid_rows": len(bad), "future_rows": len(future)}, bad + future)
    if op in ("consistency", "row_level"):
        fields = p["fields"] if op == "consistency" else [p["field"]]
        bad = field_check(rows, fields + p["within"])
        groups = defaultdict(set)
        bad_set = set(bad)
        for i, row in enumerate(rows):
            if i in bad_set: continue
            groups[key(row, p["within"])].add(key(row, fields))
            if op == "consistency" and any(token(row[f]) != token(v) for f, v in p.get("expected", {}).items()): bad.append(i)
            if op == "row_level" and token(row[p["field"]]) not in {token(v) for v in p["allowed_levels"]}: bad.append(i)
        mixed = sum(len(values) != 1 for values in groups.values())
        failed = bool(bad or mixed)
        return result("fail" if failed else "pass", "mixed_or_invalid_context" if failed else "context_consistent",
                      {"inconsistent_groups": mixed, "affected_rows": len(set(bad))}, sorted(set(bad)))
    if op == "reconcile":
        if p["reference"] not in refs or not refs[p["reference"]]: return result("not_evaluated", "independent_control_unavailable")
        controls = refs[p["reference"]]
        selector = p["row_level"]
        if any(selector["field"] not in r or r[selector["field"]] is None for r in rows):
            return result("not_evaluated", "row_level_context_missing")
        selected = [r for r in rows if token(r[selector["field"]]) == token(selector["value"])]
        if not selected: return result("not_evaluated", "selected_reporting_level_empty")
        sem = p["semantic_fields"]
        fields = list(dict.fromkeys(p["group_by"] + list(sem.values())))
        if field_check(selected, fields) or field_check(controls, fields): return result("not_evaluated", "semantic_context_missing")
        # A partition may have multiple periods, but never multiple units, snapshots, scales, currencies or scenarios.
        contexts = defaultdict(set)
        for r in selected + list(controls):
            contexts[key(r, p["group_by"])].add(key(r, [v for k, v in sem.items() if k != "period"]))
        if any(len(v) != 1 for v in contexts.values()): return result("fail", "incompatible_control_context")
        period_end = p["aggregation"] == "period_end"
        grouping = [f for f in fields if not (period_end and f == p["period_field"])]
        def aggregate(source, measure, independent=False):
            groups = defaultdict(list)
            for r in source: groups[key(r, grouping)].append(r)
            totals, dates = {}, {}
            for k, records in groups.items():
                if period_end:
                    parsed = [(iso_date(r[p["period_field"]]), r) for r in records]
                    last = max(d for d, r in parsed)
                    records = [r for d, r in parsed if d == last]
                    dates[k] = last
                    if len(records) != 1: raise ValueError
                elif independent and len(records) != 1: raise ValueError
                totals[k] = exact_sum(decimal(r.get(measure)) for r in records)
            return totals, dates
        try:
            actual, dates = aggregate(selected, p["measure"])
            expected, control_dates = aggregate(controls, p["control_measure"], True)
        except (ValueError, KeyError, TypeError): return result("error", "invalid_or_duplicate_control_or_measure")
        unmatched = len(actual.keys() ^ expected.keys())
        tolerance = number(p.get("tolerance", "0"))
        with math_context() as ctx:
            ctx.prec = 320
            mismatch = sum(abs(actual[k] - expected[k]) > tolerance or dates.get(k) != control_dates.get(k) for k in actual.keys() & expected.keys())
        failed = bool(unmatched or mismatch)
        return result("fail" if failed else "pass", "control_mismatch" if failed else "declared_" + p["control_scope"] + "_control_matches",
                      {"selected_rows": len(selected), "excluded_rows": len(rows) - len(selected), "unmatched_groups": unmatched, "mismatched_groups": mismatch})
    raise ConfigError("unknown_operator")


def evaluate(rows, bundle, *, evaluation_time=None, references=None, mode="preview", trusted_digests=(), diagnostic_limit=0):
    """Return a JSON-safe report. Production requires an approval AND caller-trusted digest.

    Input: list/tuple of plain dicts with bounded scalars. Does not mutate input.
    Diagnostics opt-in exposes only zero-based row indices (max 20), never values.
    """
    config = validate_bundle(bundle)
    if mode not in ("preview", "production"): raise ConfigError("invalid_mode")
    if type(diagnostic_limit) is not int or not 0 <= diagnostic_limit <= 20: raise ConfigError("diagnostic_limit")
    if type(trusted_digests) not in (tuple, list, set, frozenset) or any(type(d) is not str or len(d) != 64 for d in trusted_digests):
        raise ConfigError("invalid_trust_store")
    digest = bundle_digest(config)
    at = None
    if evaluation_time is not None:
        try: at = instant(evaluation_time)
        except (ValueError, OverflowError, TypeError): raise ConfigError("invalid_evaluation_time") from None
    table(rows)
    if references is None: references = {}
    if type(references) is not dict or len(references) > 32: raise ConfigError("reference_limit_or_shape")
    total_reference_rows = 0
    for name, records in references.items():
        if type(name) is not str or not 0 < len(name) <= 128: raise ConfigError("invalid_reference_name")
        table(records); total_reference_rows += len(records)
    if total_reference_rows > MAX_ROWS: raise ConfigError("reference_row_limit")
    # Conservative bound includes all caller tables, even currently unused references.
    cells = sum(len(row) for row in rows)
    cells += sum(len(row) for records in references.values() for row in records)
    if cells * len(config["rules"]) > 50_000_000:
        raise ConfigError("evaluation_work_limit")
    approval = config.get("approval", {})
    approved = (config["provenance"]["kind"] == "approved_domain_rules" and approval.get("digest") == digest
                and digest in trusted_digests)
    rules = {r["id"]: r for r in config["rules"]}
    completed = {}
    def execute(rule):
        if rule["id"] in completed: return
        for dep in rule["depends_on"]: execute(rules[dep])
        if not rows: outcome, indices = result("not_evaluated", "empty_input")
        elif any(completed[d]["outcome"] != "pass" for d in rule["depends_on"]):
            outcome, indices = result("not_evaluated", "prerequisite_not_passed")
        else:
            try: outcome, indices = run(rule["operator"], rule["params"], rows, references, at)
            except (ArithmeticError, ValueError, KeyError, TypeError): outcome, indices = result("error", "check_execution_error")
        outcome.update({k: rule[k] for k in ("id", "operator", "severity", "required", "blocking")})
        if diagnostic_limit: outcome["diagnostics"] = {"row_indices": indices[:diagnostic_limit], "truncated": len(indices) > diagnostic_limit}
        completed[rule["id"]] = outcome
    for rule in config["rules"]: execute(rule)
    results = [completed[r["id"]] for r in config["rules"]]
    if mode == "preview": gate = "non_gating"
    elif not approved: gate = "blocked"
    elif any(r["outcome"] == "fail" and r["blocking"] for r in results): gate = "fail"
    elif any(r["required"] and r["outcome"] in ("not_evaluated", "error") for r in results): gate = "blocked"
    elif not any(r["required"] for r in results): gate = "blocked"
    else: gate = "pass"
    return {"report_version": "1.0", "engine_version": "0.1.0a1", "mode": mode, "bundle_digest": digest,
            "approval_valid_in_caller_trust": approved, "gate": gate,
            "gate_reason": "approval_or_trust_missing" if mode == "production" and not approved else "checks_evaluated",
            "evaluation_time": at.isoformat() if at else None, "row_count": len(rows), "rule_count": len(results),
            "outcome_counts": dict(Counter(r["outcome"] for r in results)), "results": results,
            "limitations": ["internal_consistency_is_not_source_completeness", "aggregates_do_not_prove_transaction_accuracy"]}
