"""Observed counts only. No top values, row samples or inferred business boundaries."""
from collections import Counter
from .table import table, token


def profile(rows):
    table(rows)
    columns = sorted({f for r in rows for f in r})
    return {"kind": "observed_facts", "row_count": len(rows), "column_count": len(columns),
            "columns": [{"column_index": i, "present_count": sum(f in r for r in rows),
                         "null_count": sum(r.get(f) is None for r in rows),
                         "distinct_non_null_count": len({token(r[f]) for r in rows if r.get(f) is not None}),
                         "runtime_types": dict(Counter(type(r[f]).__name__ for r in rows if r.get(f) is not None))}
                        for i, f in enumerate(columns)],
            "limitations": ["observed_values_do_not_define_valid_business_rules"]}
