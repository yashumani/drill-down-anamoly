"""Optional interpretation of re-evaluated evidence; no provider or network client.

An explicitly authorized, caller-owned adapter can select evidence IDs. It cannot
supply prose, numbers, new facts, approval or gate changes. Statements are rendered
from the original evidence packet, never the mutable copy passed to an adapter.
"""
from copy import deepcopy
import hashlib
import inspect
import json

from .contracts import ConfigError, exact, require, _bounded_tree
from .engine import evaluate
from .analysis import analyze

MAX_FACTS = 256
MAX_SELECTION_BYTES = 65_536
LIMITATIONS = (
    'Internal consistency does not prove source completeness.',
    'Reporting aggregates do not prove transaction accuracy.',
    'These descriptive results do not establish causes.',
    'Interpretation cannot approve rules or change the deterministic gate.',
)
VALUE_FIELDS = {
    'ratio_of_sums': ('numerator', 'denominator', 'ratio'),
    'variance': ('actual', 'baseline', 'delta', 'relative_delta', 'relative_outcome', 'relative_reason'),
    'summary': ('count', 'total', 'mean', 'minimum', 'maximum', 'population_stddev'),
    'period_end': ('value', 'selected_period'),
}


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def _words(code):
    return code.replace('_', ' ')


def _evidence(deterministic, include_numeric):
    tier1 = deterministic.get('tier1', deterministic)
    analyses = deterministic.get('analyses', [])
    facts, mandatory = [], []

    def add(kind, text, required=False):
        identity = 'f%04d' % len(facts)
        facts.append({'id': identity, 'kind': kind, 'text': text})
        if required:
            mandatory.append(identity)

    add('status', 'Deterministic gate: %s. Mode: %s. Approval valid in caller trust: %s. '
        'Rows: %d. Checks: %d.' % (tier1['gate'], tier1['mode'],
        str(tier1['approval_valid_in_caller_trust']).lower(), tier1['row_count'], tier1['rule_count']), True)
    for index, check in enumerate(tier1['results']):
        counts = '; '.join('%s: %d' % (_words(k), v) for k, v in sorted(check['counts'].items()))
        text = 'Check %d (%s): %s; %s. Severity: %s; required: %s; blocking: %s.' % (
            index + 1, check['operator'], _words(check['outcome']), _words(check['reason']),
            check['severity'], str(check['required']).lower(), str(check['blocking']).lower())
        if counts:
            text += ' Counts: ' + counts + '.'
        add('check', text, check['outcome'] != 'pass')
    for index, analysis in enumerate(analyses):
        add('analysis', 'Analysis %d (%s): %s; %s. Calculation groups: %d.' % (
            index + 1, analysis['operator'], _words(analysis['outcome']), _words(analysis['reason']),
            len(analysis['groups'])), analysis['outcome'] != 'pass')
        unavailable_relative = sum(group.get('relative_outcome') == 'not_evaluated'
                                   for group in analysis['groups'])
        if unavailable_relative:
            add('analysis', 'Analysis %d: relative comparison is not evaluated in %d calculation groups '
                '(zero baseline). Absolute deltas remain available.' % (index + 1, unavailable_relative), True)
    for text in LIMITATIONS:
        add('limitation', text, True)
    total_groups = sum(len(item['groups']) for item in analyses)
    included_groups = 0
    if include_numeric:
        # Reserve one fact to make any omitted aggregate evidence explicit.
        for index, analysis in enumerate(analyses):
            for group in analysis['groups']:
                if len(facts) >= MAX_FACTS - 1:
                    break
                values = '; '.join('%s: %s' % (_words(field), 'not evaluated'
                    if group[field] is None else group[field])
                    for field in VALUE_FIELDS[analysis['operator']] if field in group)
                add('analysis_value', 'Analysis %d group %d (%s): %s.' % (
                    index + 1, group['group_index'], analysis['operator'], values))
                included_groups += 1
    omitted = total_groups - included_groups
    if omitted:
        add('limitation', '%d calculation groups were omitted from this interpretation packet. '
            'Inspect the deterministic analysis for their evidence.' % omitted, True)
    packet = {'evidence_version': '1.0', 'source_report_digest': _digest(deterministic),
              'bundle_digest': tier1['bundle_digest'], 'numeric_evidence_included': include_numeric,
              'omitted_numeric_groups': omitted, 'facts': facts, 'mandatory_fact_ids': mandatory}
    packet['evidence_digest'] = _digest(packet)
    return packet


def _validate_selection(packet, selection):
    _bounded_tree(selection)
    exact(selection, ['selection_version', 'evidence_digest', 'fact_ids'])
    require(selection['selection_version'] == '1.0', 'unsupported_selection_version')
    require(selection['evidence_digest'] == packet['evidence_digest'], 'stale_interpretation_selection')
    chosen = selection['fact_ids']
    require(type(chosen) is list and 0 < len(chosen) <= MAX_FACTS, 'selection_fact_limit')
    require(all(type(identity) is str for identity in chosen), 'invalid_selection_fact')
    require(len(set(chosen)) == len(chosen), 'duplicate_selection_fact')
    available = {fact['id'] for fact in packet['facts']}
    require(set(chosen) <= available, 'unknown_selection_fact')
    require(set(packet['mandatory_fact_ids']) <= set(chosen), 'mandatory_evidence_omitted')
    require(len(json.dumps(selection, ensure_ascii=True).encode()) <= MAX_SELECTION_BYTES,
            'selection_resource_limit')
    # Gate, blockers, unavailable checks and limitations always lead the narrative.
    required = packet['mandatory_fact_ids']
    return required + [identity for identity in chosen if identity not in required]


def load_selection(text):
    """Parse an offline JSON plan. No provider names, code or imports are accepted."""
    require(type(text) is str and len(text.encode('utf-8')) <= MAX_SELECTION_BYTES,
            'selection_resource_limit')
    def unique_pairs(pairs):
        value = {}
        for key, item in pairs:
            require(key not in value, 'duplicate_json_key')
            value[key] = item
        return value
    def no_number(_):
        raise ConfigError('invalid_selection_literal')
    try:
        value = json.loads(text, object_pairs_hook=unique_pairs, parse_float=no_number,
                           parse_constant=no_number)
        _bounded_tree(value)
        exact(value, ['selection_version', 'evidence_digest', 'fact_ids'])
        return value
    except (ValueError, TypeError, RecursionError):
        raise ConfigError('invalid_interpretation_json') from None


def explain(rows, bundle, *, evaluation_time=None, references=None, mode='preview',
            trusted_digests=(), diagnostic_limit=0, include_analysis=False,
            analysis_spec=None, include_numeric_evidence=False, selection=None,
            adapter=None, allow_adapter=False):
    """Re-evaluate Tier 1/2 and add a separate, non-authoritative interpretation.

    Default: local controlled templates, no adapter call. A caller-owned adapter
    must expose select_evidence(packet) AND be explicitly enabled with
    allow_adapter=True. It receives a detached counts-only packet by default,
    without rows, field/group/rule names, diagnostics or provenance strings.
    Numeric aggregate evidence requires include_numeric_evidence=True.

    The caller owns the adapter's code, provider authorization, credentials,
    timeout, costs and any external transmission. This package supplies none of
    those services and does not verify live model operation. JSON can provide
    an offline selection only; it never selects executable adapters.
    """
    if any(type(option) is not bool for option in (include_analysis, include_numeric_evidence, allow_adapter)):
        raise ConfigError('invalid_interpretation_options')
    if include_numeric_evidence and not include_analysis:
        raise ConfigError('numeric_evidence_requires_analysis')
    if analysis_spec is not None and not include_analysis:
        raise ConfigError('analysis_spec_requires_analysis')
    if adapter is not None and selection is not None:
        raise ConfigError('one_interpretation_source_required')
    options = dict(evaluation_time=evaluation_time, references=references, mode=mode,
                   trusted_digests=trusted_digests, diagnostic_limit=diagnostic_limit)
    deterministic = analyze(rows, bundle, analysis_spec, **options) if include_analysis else evaluate(rows, bundle, **options)
    packet = _evidence(deterministic, include_numeric_evidence)
    method = 'caller_adapter' if adapter is not None else 'supplied_selection' if selection is not None else 'controlled_templates'
    called = False

    def finish(outcome, reason, identities=()):
        facts = {fact['id']: fact for fact in packet['facts']}
        interpretation = {'interpretation_version': '1.0', 'outcome': outcome, 'reason': reason,
            'method': method, 'adapter_called': called, 'model_verification': 'not_verified',
            'changes_deterministic_gate': False, 'evidence_digest': packet['evidence_digest'],
            'statements': [{'fact_id': identity, 'text': facts[identity]['text']} for identity in identities]}
        return {'explanation_version': '1.0', 'deterministic': deterministic,
                'evidence': packet, 'interpretation': interpretation}

    if adapter is not None:
        if not allow_adapter:
            return finish('not_evaluated', 'adapter_authorization_required')
        try:
            select_evidence = adapter.select_evidence
            if inspect.iscoroutinefunction(select_evidence) or inspect.isasyncgenfunction(select_evidence):
                return finish('error', 'async_adapter_not_supported')
            called = True
            selection = select_evidence(deepcopy(packet))
            if inspect.isawaitable(selection) or inspect.isasyncgen(selection):
                if inspect.iscoroutine(selection):
                    selection.close()
                return finish('error', 'async_adapter_not_supported')
        except Exception:
            # Never echo exception text, user data or provider responses.
            return finish('error', 'adapter_execution_failed')
    if called and selection is None:
        return finish('error', 'invalid_interpretation_selection')
    if selection is None:
        identities = [fact['id'] for fact in packet['facts']]
        reason = 'controlled_template_summary'
    else:
        try:
            identities = _validate_selection(packet, selection)
        except (ConfigError, ValueError, TypeError, RecursionError):
            return finish('error', 'invalid_interpretation_selection')
        reason = 'adapter_selection_validated' if called else 'offline_selection_validated'
    return finish('pass', reason, identities)
