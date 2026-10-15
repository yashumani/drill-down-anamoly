"""Bounded scalar-only table boundary and exact decimal/date semantics."""
from datetime import date, datetime, timezone
from decimal import Decimal, localcontext, Context, ROUND_HALF_EVEN
import re
from .contracts import ConfigError, MAX_ROWS, MAX_COLUMNS, MAX_CELL_CHARS, number


def table(rows):
    if type(rows) not in (list, tuple) or len(rows) > MAX_ROWS:
        raise ConfigError("table_row_limit_or_shape")
    columns = set()
    cells = 0
    for row in rows:
        if type(row) is not dict or len(row) > MAX_COLUMNS:
            raise ConfigError("table_column_limit_or_shape")
        cells += len(row)
        if cells > 2_000_000: raise ConfigError("table_cell_limit")
        for key, value in row.items():
            if type(key) is not str or not 0 < len(key) <= 128:
                raise ConfigError("invalid_field_name")
            columns.add(key)
            if len(columns) > MAX_COLUMNS: raise ConfigError("table_column_limit_or_shape")
            if value is not None and type(value) not in (str, int, bool, Decimal, date, datetime):
                raise ConfigError("unsupported_cell_type")
            if type(value) is str and len(value) > MAX_CELL_CHARS: raise ConfigError("cell_limit")
            if type(value) is int: number(value)
            if type(value) is Decimal:
                if not value.is_finite() or len(value.as_tuple().digits) > 100 or abs(value.as_tuple().exponent) > 100:
                    raise ConfigError("numeric_limit")
    return rows


def iso_date(value):
    if type(value) is date: return value
    if type(value) is not str or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value): raise ValueError
    return date.fromisoformat(value)


def instant(value):
    if type(value) is str:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", value): raise ValueError
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if type(value) is not datetime or value.tzinfo is None or value.utcoffset() is None: raise ValueError
    return value.astimezone(timezone.utc)


def valid_type(value, kind):
    if kind == "string": return type(value) is str
    if kind == "integer": return type(value) is int
    if kind == "decimal": return type(value) in (int, Decimal)
    if kind == "boolean": return type(value) is bool
    try:
        (iso_date if kind == "date" else instant)(value)
        return True
    except (ValueError, OverflowError, TypeError): return False


def token(value):
    # Tag types so False, 0 and "0" remain distinct. Date strings are intentionally not coerced in keys.
    return (type(value).__name__, value)


def key(row, fields):
    if any(f not in row or row[f] is None for f in fields): raise ValueError
    return tuple(token(row[f]) for f in fields)


def decimal(value):
    if type(value) not in (int, Decimal): raise ValueError
    result = Decimal(value)
    if not result.is_finite(): raise ValueError
    return result


def math_context(precision=320):
    """Do not inherit caller precision, rounding, exponent range or traps."""
    return localcontext(Context(prec=precision, rounding=ROUND_HALF_EVEN, Emin=-999999, Emax=999999))


def exact_sum(values):
    # Input bound: <=100k scalars of <=100 digits, exponent within +/-100. This precision is exact for sums.
    with math_context() as ctx:
        ctx.prec = 320
        return sum(values, Decimal(0))
