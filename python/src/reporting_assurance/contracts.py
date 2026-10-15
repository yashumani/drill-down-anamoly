"""Strict, bounded v1 declarative contract. JSON selects only registered operators."""
import hashlib
import json
import re
from copy import deepcopy
from decimal import Decimal, InvalidOperation

MAX_CONFIG_BYTES = 1_048_576
MAX_RULES = 128
MAX_ROWS = 100_000
MAX_COLUMNS = 256
MAX_CELL_CHARS = 4096
MAX_EXPECTED = 10_000
ID = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")
TYPES = {"string", "integer", "decimal", "boolean", "date", "datetime"}


class ConfigError(ValueError):
    """A safe reason code, never an echo of user input."""


def require(ok, code="invalid_config"):
    if not ok:
        raise ConfigError(code)


def exact(obj, required, optional=()):
    require(type(obj) is dict and set(required) <= obj.keys()
            and obj.keys() <= set(required) | set(optional), "unknown_or_missing_fields")


def name(value):
    require(type(value) is str and 0 < len(value) <= 128, "invalid_field_name")


def names(values, empty=False):
    require(type(values) is list and (empty or bool(values)) and len(values) <= MAX_COLUMNS,
            "invalid_field_list")
    for value in values:
        name(value)
    require(len(set(values)) == len(values), "duplicate_fields")


def scalar(value):
    require(value is None or type(value) in (str, int, bool), "invalid_literal")
    if type(value) is str:
        require(len(value) <= MAX_CELL_CHARS, "literal_limit")
    if type(value) is int:
        require(abs(value).bit_length() <= 333 and len(str(abs(value))) <= 100, "numeric_limit")


def number(value):
    require(type(value) in (str, int), "decimal_literal_must_be_string_or_integer")
    if type(value) is int:
        require(abs(value).bit_length() <= 333, "numeric_limit")
    try:
        result = Decimal(value)
    except (InvalidOperation, ValueError):
        raise ConfigError("invalid_decimal") from None
    require(result.is_finite() and len(result.as_tuple().digits) <= 100
            and abs(result.as_tuple().exponent) <= 100, "numeric_limit")
    return result


def pairs(values, width):
    require(type(values) is list and 0 < len(values) <= MAX_EXPECTED, "expected_limit")
    seen = set()
    for row in values:
        require(type(row) is list and len(row) == width, "invalid_expected_tuple")
        for value in row:
            scalar(value)
            require(value is not None, "null_expected_key")
        key = json.dumps(row, sort_keys=True)
        require(key not in seen, "duplicate_expected_key")
        seen.add(key)


def validate_params(op, p):
    if op == "required_fields":
        exact(p, ["fields"]); names(p["fields"])
    elif op == "types":
        exact(p, ["fields"])
        require(type(p["fields"]) is dict and 0 < len(p["fields"]) <= MAX_COLUMNS)
        for field, spec in p["fields"].items():
            name(field); exact(spec, ["type", "nullable"])
            require(type(spec["type"]) is str and spec["type"] in TYPES and type(spec["nullable"]) is bool, "invalid_type_spec")
    elif op == "unique":
        exact(p, ["fields"]); names(p["fields"])
    elif op == "allowed_values":
        exact(p, ["field", "values"]); name(p["field"])
        require(type(p["values"]) is list and 0 < len(p["values"]) <= MAX_EXPECTED)
        for value in p["values"]: scalar(value)
    elif op == "range":
        exact(p, ["field"], ["min", "max"]); name(p["field"])
        require("min" in p or "max" in p, "missing_range_bounds")
        bounds = [number(p[k]) for k in ("min", "max") if k in p]
        require(len(bounds) < 2 or bounds[0] <= bounds[1], "inverted_range")
    elif op == "coverage":
        exact(p, ["fields"], ["expected", "reference", "allow_extra"]); names(p["fields"])
        require(("expected" in p) != ("reference" in p), "coverage_requires_one_source")
        if "expected" in p: pairs(p["expected"], len(p["fields"]))
        if "reference" in p: name(p["reference"])
        require(type(p.get("allow_extra", False)) is bool)
    elif op == "freshness":
        exact(p, ["field", "partition_by", "max_age_seconds"], ["expected_partitions", "reference", "future_tolerance_seconds"])
        name(p["field"]); names(p["partition_by"], empty=True)
        require(type(p["max_age_seconds"]) is int and 0 <= p["max_age_seconds"] <= 315_576_000)
        require(type(p.get("future_tolerance_seconds", 0)) is int and 0 <= p.get("future_tolerance_seconds", 0) <= 86400)
        require(not ("expected_partitions" in p and "reference" in p))
        if "expected_partitions" in p: pairs(p["expected_partitions"], len(p["partition_by"]))
        if "reference" in p: name(p["reference"])
    elif op == "consistency":
        exact(p, ["fields", "within"], ["expected"]); names(p["fields"]); names(p["within"], empty=True)
        if "expected" in p:
            require(type(p["expected"]) is dict and p["expected"].keys() <= set(p["fields"]))
            for value in p["expected"].values(): scalar(value)
    elif op == "row_level":
        exact(p, ["field", "allowed_levels", "within"]); name(p["field"]); names(p["within"], empty=True)
        require(type(p["allowed_levels"]) is list and 0 < len(p["allowed_levels"]) <= 16)
        for value in p["allowed_levels"]: scalar(value); require(value is not None)
    elif op == "reconcile":
        exact(p, ["measure", "control_measure", "reference", "group_by", "semantic_fields", "aggregation", "measure_kind", "control_scope", "row_level"], ["period_field", "tolerance"])
        for k in ("measure", "control_measure", "reference"): name(p[k])
        names(p["group_by"], empty=True)
        exact(p["semantic_fields"], ["period", "scenario", "currency", "unit", "scale", "snapshot"])
        for value in p["semantic_fields"].values(): name(value)
        require(len(set(p["semantic_fields"].values())) == 6, "semantic_fields_must_differ")
        require(p["control_scope"] in ("independent", "internal"), "invalid_control_scope")
        require(p["aggregation"] in ("sum", "period_end"), "unsupported_aggregation")
        require((p["measure_kind"], p["aggregation"]) in (("flow", "sum"), ("balance", "period_end")), "incompatible_measure_aggregation")
        exact(p["row_level"], ["field", "value"]); name(p["row_level"]["field"]); scalar(p["row_level"]["value"])
        require(p["row_level"]["value"] is not None)
        if p["aggregation"] == "period_end":
            require(p.get("period_field") == p["semantic_fields"]["period"], "period_end_requires_period_field")
        else:
            require("period_field" not in p, "period_field_only_for_balances")
        require(number(p.get("tolerance", "0")) >= 0, "negative_tolerance")
    else:
        raise ConfigError("unknown_operator")


OPERATORS = ("required_fields", "types", "unique", "allowed_values", "range", "coverage",
             "freshness", "consistency", "row_level", "reconcile")


def _bounded_tree(value, depth=0, budget=None):
    if budget is None: budget = [0]
    budget[0] += 1
    require(depth <= 16 and budget[0] <= 100_000, "config_resource_limit")
    if type(value) is dict:
        for k, v in value.items(): name(k); _bounded_tree(v, depth + 1, budget)
    elif type(value) is list:
        for v in value: _bounded_tree(v, depth + 1, budget)
    else: scalar(value)


def validate_bundle(bundle):
    _bounded_tree(bundle)
    exact(bundle, ["schema_version", "revision", "provenance", "rules"], ["approval", "analysis"])
    require(bundle["schema_version"] == "1.0", "unsupported_schema_version")
    require(type(bundle["revision"]) is str and ID.fullmatch(bundle["revision"]), "invalid_revision")
    exact(bundle["provenance"], ["author", "source", "kind"])
    require(bundle["provenance"]["kind"] in ("approved_domain_rules", "draft_proposal"))
    for k in ("author", "source"): require(type(bundle["provenance"][k]) is str and bool(bundle["provenance"][k]))
    require(type(bundle["rules"]) is list and 0 < len(bundle["rules"]) <= MAX_RULES, "rule_limit")
    ids = set()
    for rule in bundle["rules"]:
        exact(rule, ["id", "operator", "params", "severity", "required", "blocking", "depends_on"])
        require(type(rule["id"]) is str and ID.fullmatch(rule["id"]) and rule["id"] not in ids, "invalid_or_duplicate_rule_id")
        ids.add(rule["id"])
        require(rule["operator"] in OPERATORS, "unknown_operator")
        require(rule["severity"] in ("info", "warning", "critical"), "invalid_severity")
        require(type(rule["required"]) is bool and type(rule["blocking"]) is bool)
        names(rule["depends_on"], empty=True)
        validate_params(rule["operator"], rule["params"])
    graph = {r["id"]: r["depends_on"] for r in bundle["rules"]}
    visited, active = set(), set()
    def visit(node):
        require(node in graph, "unknown_dependency")
        require(node not in active, "dependency_cycle")
        if node in visited: return
        active.add(node)
        for dep in graph[node]: visit(dep)
        active.remove(node); visited.add(node)
    for node in graph: visit(node)
    if "analysis" in bundle:
        from .analysis import validate_analysis
        validate_analysis(bundle["analysis"], ids)
    if "approval" in bundle:
        a = bundle["approval"]
        exact(a, ["status", "revision", "digest", "approved_by"])
        require(a["status"] == "approved" and a["revision"] == bundle["revision"], "invalid_approval")
        require(type(a["digest"]) is str and re.fullmatch(r"[a-f0-9]{64}", a["digest"]), "invalid_digest")
        require(type(a["approved_by"]) is str and bool(a["approved_by"]), "invalid_approver")
    require(len(json.dumps(bundle, ensure_ascii=True).encode()) <= MAX_CONFIG_BYTES, "config_resource_limit")
    return deepcopy(bundle)


def bundle_digest(bundle):
    validated = validate_bundle(bundle)
    validated.pop("approval", None)
    return hashlib.sha256(json.dumps(validated, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode()).hexdigest()


def load_bundle(text):
    require(type(text) is str and len(text.encode("utf-8")) <= MAX_CONFIG_BYTES, "config_resource_limit")
    def obj(pairs_):
        result = {}
        for k, v in pairs_:
            require(k not in result, "duplicate_json_key"); result[k] = v
        return result
    def no_float(_): raise ConfigError("decimal_literal_must_be_string_or_integer")
    try:
        value = json.loads(text, object_pairs_hook=obj, parse_float=no_float, parse_constant=no_float)
        return validate_bundle(value)
    except (ValueError, TypeError, RecursionError) as exc:
        if isinstance(exc, ConfigError): raise
        raise ConfigError("invalid_json") from None
