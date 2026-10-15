"""Explicit CSV adapter: preserves strings/IDs, null token, strict declared conversion."""
import csv
from pathlib import Path
from decimal import Decimal, InvalidOperation
import re
from .contracts import ConfigError, MAX_ROWS, MAX_COLUMNS, MAX_CELL_CHARS, reference_types_from_roles
from .table import table, iso_date, instant


def read_csv(path, *, types=None, null_token="\\N"):
    """Read local CSV only. Empty string stays empty; only null_token becomes None.

    Invalid typed cells remain strings so the types rule reports failure.
    No type inference; no floats. String identifiers keep leading zeros.
    """
    if types is None: types = {}
    if type(types) is not dict or any(t not in ("string", "integer", "decimal", "boolean", "date", "datetime") for t in types.values()):
        raise ConfigError("invalid_csv_types")
    if type(null_token) is not str or len(null_token) > 32: raise ConfigError("invalid_null_token")
    csv_path = Path(path)
    if csv_path.stat().st_size > 64 * 1024 * 1024: raise ConfigError("csv_byte_limit")
    try:
        with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle, strict=True)
            header = next(reader, None)
            if not header or len(header) > MAX_COLUMNS or len(set(header)) != len(header) or any(not h or len(h) > 128 for h in header):
                raise ConfigError("invalid_csv_header")
            if not types.keys() <= set(header): raise ConfigError("csv_type_field_missing")
            rows = []
            for cells in reader:
                if len(rows) >= MAX_ROWS: raise ConfigError("table_row_limit_or_shape")
                if len(cells) != len(header): raise ConfigError("ragged_csv_record")
                row = {}
                for field, value in zip(header, cells):
                    if len(value) > MAX_CELL_CHARS: raise ConfigError("cell_limit")
                    if value == null_token: row[field] = None; continue
                    kind = types.get(field, "string")
                    try:
                        converted = value
                        if kind == "integer":
                            if not re.fullmatch(r"-?(?:0|[1-9]\d*)", value): raise ValueError
                            converted = int(value)
                        elif kind == "decimal":
                            if not re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?", value): raise ValueError
                            converted = Decimal(value)
                        elif kind == "boolean":
                            if value not in ("true", "false"): raise ValueError
                            converted = value == "true"
                        elif kind == "date": iso_date(value)
                        elif kind == "datetime": instant(value)
                        row[field] = converted
                    except (ValueError, InvalidOperation, OverflowError): row[field] = value
                rows.append(row)
    except (csv.Error, UnicodeError): raise ConfigError("invalid_csv") from None
    return table(rows)



def reference_csv_types(bundle, reference, columns, primary_types):
    """Reference schemas are separate from the primary table's schema.

    Explicit bundle declarations are approval-bound. Registered operators also
    define required native types: control/baseline measures are Decimal and
    calendar complete is bool. No types are inferred from observed values.
    """
    declared = bundle.get('reference_types', {}).get(reference, {})
    required = reference_types_from_roles(bundle).get(reference, {})
    # Retain compatible legacy mappings for shared keys. Reference declarations
    # override primary mappings; primary and reference columns are independent.
    result = {field: kind for field, kind in primary_types.items() if field in columns}
    result.update(declared)
    result.update({field: kind for field, kind in required.items() if field in columns})
    return result
