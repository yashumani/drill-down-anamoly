"""Pure, framework-neutral normalization and flat result tables (contract v1)."""
from collections import Counter
from decimal import Decimal, InvalidOperation
import re
from types import MappingProxyType

from .contracts import ConfigError, ID, MAX_COLUMNS, MAX_ROWS, TYPES, exact, name, require
from .table import instant, iso_date, table

RECORD_TABLE_VERSION = '1.0'
GROUP_FIELDS = {
    'summary': ('count', 'total', 'mean', 'minimum', 'maximum', 'population_stddev'),
    'ratio_of_sums': ('numerator', 'denominator', 'ratio'),
    'variance': ('actual', 'baseline', 'delta', 'relative_delta', 'relative_outcome', 'relative_reason'),
    'period_end': ('value', 'selected_period'),
}
NUMERIC_FIELDS = frozenset(('total', 'mean', 'minimum', 'maximum', 'population_stddev',
                            'numerator', 'denominator', 'ratio', 'actual', 'baseline',
                            'delta', 'relative_delta', 'value'))
OUTCOMES = ('pass', 'fail', 'not_evaluated', 'error')
OPERATORS = frozenset(('required_fields', 'types', 'unique', 'allowed_values', 'range',
                       'coverage', 'freshness', 'consistency', 'row_level', 'reconcile'))
RECORD_TABLE_COLUMNS = MappingProxyType({
    'summary': ('report_id', 'table_version', 'report_version', 'engine_version', 'mode',
                'bundle_digest', 'approval_valid_in_caller_trust', 'gate', 'gate_reason',
                'evaluation_time', 'row_count', 'rule_count', 'pass_count', 'fail_count',
                'not_evaluated_count', 'error_count', 'analysis_count'),
    'checks': ('report_id', 'check_id', 'operator', 'outcome', 'reason', 'severity', 'required',
               'blocking', 'diagnostics_available', 'diagnostics_included',
               'diagnostic_row_count', 'diagnostics_truncated'),
    'check_counts': ('report_id', 'check_id', 'count_name', 'count'),
    'check_diagnostics': ('report_id', 'check_id', 'diagnostic_index', 'row_index'),
    'analyses': ('report_id', 'analysis_id', 'operator', 'outcome', 'reason', 'group_count', 'mismatched_groups'),
    'analysis_groups': ('report_id', 'analysis_id', 'group_index', 'count', 'total', 'mean',
                        'minimum', 'maximum', 'population_stddev', 'numerator', 'denominator',
                        'ratio', 'actual', 'baseline', 'delta', 'relative_delta',
                        'relative_outcome', 'relative_reason', 'value', 'selected_period'),
    'limitations': ('report_id', 'scope', 'limitation_index', 'code'),
})
_DECIMAL_TEXT = re.compile(r'^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?$')


def normalize_records(records, *, types):
    """Copy native record dictionaries with explicit CSV-like scalar conversions.

    Null stays None; missing fields stay missing. Valid declared decimal/integer/
    boolean text converts; invalid text remains text for the engine's types rule.
    IDs are never stringified. Floats and framework-specific scalars are rejected,
    never rounded/coerced; map missing sentinels in the calling workflow first.
    Date/time text is preserved so key semantics and timezone intent do not shift.
    """
    require(type(types) is dict and len(types) <= MAX_COLUMNS, 'invalid_record_types')
    for field, kind in types.items():
        name(field)
        require(type(kind) is str and kind in TYPES, 'invalid_record_types')
    # Validate before conversion: bounded native scalars only, no float recovery.
    table(records)
    output = []
    for original in records:
        row = dict(original)
        for field, kind in types.items():
            value = row.get(field)
            if type(value) is not str:
                continue
            try:
                if kind == 'decimal' and re.fullmatch(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?', value):
                    row[field] = Decimal(value)
                elif kind == 'integer' and re.fullmatch(r'-?(?:0|[1-9][0-9]*)', value):
                    row[field] = int(value)
                elif kind == 'boolean' and value in ('true', 'false'):
                    row[field] = value == 'true'
            except (ValueError, InvalidOperation, OverflowError):
                pass
        output.append(row)
    return table(output)


def _integer(value, maximum):
    require(type(value) is int and 0 <= value <= maximum, 'invalid_record_report')


def _code(value):
    require(type(value) is str and re.fullmatch(r'[a-z0-9_]{1,128}', value), 'invalid_record_report')


def _identity(value):
    require(type(value) is str and ID.fullmatch(value), 'invalid_record_report')


def _limitations(values):
    require(type(values) is list and len(values) <= 16, 'invalid_record_report')
    for value in values:
        _code(value)


def _validate_tier1(report):
    exact(report, ('report_version', 'engine_version', 'mode', 'bundle_digest',
                   'approval_valid_in_caller_trust', 'gate', 'gate_reason', 'evaluation_time',
                   'row_count', 'rule_count', 'outcome_counts', 'results', 'limitations'))
    require(report['report_version'] == '1.0', 'unsupported_record_report_version')
    require(type(report['engine_version']) is str and re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:[a-z][0-9]+)?', report['engine_version']), 'invalid_record_report')
    require(type(report['bundle_digest']) is str and re.fullmatch('[a-f0-9]{64}', report['bundle_digest']), 'invalid_record_report')
    require(report['mode'] in ('preview', 'production') and report['gate'] in ('pass', 'fail', 'blocked', 'non_gating'), 'invalid_record_report')
    require((report['mode'] == 'preview') == (report['gate'] == 'non_gating'), 'invalid_record_report')
    require(type(report['approval_valid_in_caller_trust']) is bool, 'invalid_record_report')
    require(report['gate'] != 'pass' or report['approval_valid_in_caller_trust'], 'invalid_record_report')
    _code(report['gate_reason'])
    if report['evaluation_time'] is not None:
        require(type(report['evaluation_time']) is str, 'invalid_record_report')
        try:
            instant(report['evaluation_time'])
        except (ValueError, TypeError, OverflowError):
            raise ConfigError('invalid_record_report') from None
    _integer(report['row_count'], MAX_ROWS)
    _integer(report['rule_count'], 128)
    require(report['rule_count'] > 0 and type(report['results']) is list and len(report['results']) == report['rule_count'], 'invalid_record_report')
    ids, frequencies = set(), Counter()
    for check in report['results']:
        exact(check, ('id', 'operator', 'outcome', 'reason', 'counts', 'severity', 'required', 'blocking'), ('diagnostics',))
        _identity(check['id'])
        require(check['id'] not in ids, 'duplicate_record_check_id')
        ids.add(check['id'])
        require(type(check['operator']) is str and check['operator'] in OPERATORS and type(check['outcome']) is str and check['outcome'] in OUTCOMES and type(check['severity']) is str and check['severity'] in ('info', 'warning', 'critical'), 'invalid_record_report')
        _code(check['reason'])
        require(type(check['required']) is bool and type(check['blocking']) is bool, 'invalid_record_report')
        require(type(check['counts']) is dict and len(check['counts']) <= 16, 'invalid_record_report')
        for field, count in check['counts'].items():
            _code(field)
            _integer(count, 200000)
        if 'diagnostics' in check:
            diagnostic = check['diagnostics']
            exact(diagnostic, ('row_indices', 'truncated'))
            require(type(diagnostic['truncated']) is bool and type(diagnostic['row_indices']) is list and len(diagnostic['row_indices']) <= 20, 'invalid_record_report')
            for index in diagnostic['row_indices']:
                _integer(index, report['row_count'] - 1)
        frequencies[check['outcome']] += 1
    counts = report['outcome_counts']
    require(type(counts) is dict and counts.keys() <= set(OUTCOMES), 'invalid_record_report')
    for count in counts.values():
        _integer(count, 128)
    require({key: value for key, value in counts.items() if value} == dict(frequencies), 'inconsistent_record_outcome_counts')
    _limitations(report['limitations'])


def _validate_analyses(analyses):
    require(type(analyses) is list and 0 < len(analyses) <= 32, 'invalid_record_report')
    ids = set()
    for item in analyses:
        exact(item, ('id', 'operator', 'outcome', 'reason', 'groups'), ('mismatched_groups',))
        _identity(item['id'])
        require(item['id'] not in ids, 'duplicate_record_analysis_id')
        ids.add(item['id'])
        require(type(item['operator']) is str and item['operator'] in GROUP_FIELDS and type(item['outcome']) is str and item['outcome'] in OUTCOMES, 'invalid_record_report')
        _code(item['reason'])
        groups = item['groups']
        require(type(groups) is list and len(groups) <= 1000, 'invalid_record_report')
        if 'mismatched_groups' in item:
            _integer(item['mismatched_groups'], 1000)
        if item['outcome'] in ('not_evaluated', 'error'):
            require(not groups, 'invalid_record_report')
        indices = set()
        for group in groups:
            exact(group, ('group_index',) + GROUP_FIELDS[item['operator']])
            _integer(group['group_index'], 999)
            require(group['group_index'] not in indices, 'duplicate_record_group_index')
            indices.add(group['group_index'])
            for field in GROUP_FIELDS[item['operator']]:
                value = group[field]
                if field in NUMERIC_FIELDS:
                    if field == 'relative_delta' and value is None:
                        continue
                    require(type(value) is str and len(value) <= 1024 and _DECIMAL_TEXT.fullmatch(value), 'invalid_record_numeric_text')
                elif field == 'count':
                    _integer(value, MAX_ROWS)
                elif field == 'selected_period':
                    require(type(value) is str, 'invalid_record_report')
                    try:
                        iso_date(value)
                    except ValueError:
                        raise ConfigError('invalid_record_report') from None
                elif field == 'relative_outcome':
                    require(value in ('pass', 'not_evaluated'), 'invalid_record_report')
                else:
                    _code(value)
            if item['operator'] == 'variance':
                require((group['relative_delta'] is None) == (group['relative_outcome'] == 'not_evaluated'), 'invalid_record_report')


def report_to_record_tables(report, *, report_id, include_diagnostics=False):
    """Format evaluate()/analyze() output as joined scalar-only record tables.

    This validates the supported result shape, not source truth, approval identity
    or report authenticity. It never re-evaluates rules or changes the gate. The
    caller supplies an opaque ID unique within their combined outputs. Aggregate
    decimal strings are copied verbatim; unavailable fields are None, never zero.
    Row-index diagnostics require another explicit opt-in even if present upstream.
    """
    require(type(report_id) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', report_id), 'invalid_record_report_id')
    require(type(include_diagnostics) is bool, 'invalid_record_diagnostics_option')
    require(type(report) is dict, 'invalid_record_report')
    analyses = []
    tier1 = report
    if 'analysis_version' in report:
        exact(report, ('analysis_version', 'tier1', 'analyses', 'limitations'))
        require(report['analysis_version'] == '1.0', 'unsupported_record_report_version')
        tier1, analyses = report['tier1'], report['analyses']
        _validate_analyses(analyses)
        _limitations(report['limitations'])
    _validate_tier1(tier1)
    output = {key: [] for key in RECORD_TABLE_COLUMNS}

    def add(table_name, **values):
        output[table_name].append({column: report_id if column == 'report_id' else values.get(column)
                                   for column in RECORD_TABLE_COLUMNS[table_name]})

    summary = {key: tier1[key] for key in ('report_version', 'engine_version', 'mode', 'bundle_digest',
               'approval_valid_in_caller_trust', 'gate', 'gate_reason', 'evaluation_time', 'row_count', 'rule_count')}
    summary.update(table_version=RECORD_TABLE_VERSION, analysis_count=len(analyses))
    summary.update({outcome + '_count': tier1['outcome_counts'].get(outcome, 0) for outcome in OUTCOMES})
    add('summary', **summary)
    for check in tier1['results']:
        diagnostic = check.get('diagnostics')
        values = {key: check[key] for key in ('operator', 'outcome', 'reason', 'severity', 'required', 'blocking')}
        add('checks', check_id=check['id'], diagnostics_available=diagnostic is not None,
            diagnostics_included=include_diagnostics and diagnostic is not None,
            diagnostic_row_count=len(diagnostic['row_indices']) if diagnostic is not None else None,
            diagnostics_truncated=diagnostic['truncated'] if diagnostic is not None else None, **values)
        for field, count in sorted(check['counts'].items()):
            add('check_counts', check_id=check['id'], count_name=field, count=count)
        if include_diagnostics and diagnostic is not None:
            for index, row_index in enumerate(diagnostic['row_indices']):
                add('check_diagnostics', check_id=check['id'], diagnostic_index=index, row_index=row_index)
    for item in analyses:
        add('analyses', analysis_id=item['id'], group_count=len(item['groups']),
            mismatched_groups=item.get('mismatched_groups'),
            **{key: item[key] for key in ('operator', 'outcome', 'reason')})
        for group in item['groups']:
            add('analysis_groups', analysis_id=item['id'], **group)
    scopes = [('tier1', tier1['limitations'])]
    if 'analysis_version' in report:
        scopes.append(('tier2', report['limitations']))
    for scope, codes in scopes:
        for index, code in enumerate(codes):
            add('limitations', scope=scope, limitation_index=index, code=code)
    return output
