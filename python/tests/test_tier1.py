"""Independent golden outcomes and generated invariants; no existing UI oracle."""
import copy
import csv
import io
import json
import os
from pathlib import Path
import random
import socket
import subprocess
import sys
import tempfile
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal, localcontext
from unittest.mock import patch

from reporting_assurance import ConfigError, bundle_digest, evaluate, load_bundle, profile, read_csv, validate_bundle
from reporting_assurance.cli import main


def rule(op, params, id=None, **kwargs):
    return dict(id=id or op, operator=op, params=params, severity='critical', required=True,
                blocking=True, depends_on=[], **kwargs)


def bundle(*rules):
    return dict(schema_version='1.0', revision='synthetic-v1',
                provenance=dict(author='fictional_test_owner', source='independent_golden_test', kind='approved_domain_rules'),
                rules=list(rules))


def approve(config):
    config = copy.deepcopy(config)
    digest = bundle_digest(config)
    config['approval'] = dict(status='approved', revision=config['revision'], digest=digest, approved_by='test_owner')
    return config, digest


def production(rows, config, **kwargs):
    config, digest = approve(config)
    return evaluate(rows, config, mode='production', trusted_digests=[digest], **kwargs)


def outcome(report, id=None):
    return next(r for r in report['results'] if id is None or r['id'] == id)['outcome']


SEM = dict(period='period', scenario='scenario', currency='currency', unit='unit', scale='scale', snapshot='snapshot')


def record(value, **kw):
    row = dict(period='2026-03-31', scenario='Actual', currency='USD', unit='currency', scale='1', snapshot='s1', level='detail', amount=Decimal(value))
    row.update(kw)
    return row


def reconciliation(aggregation='sum', **kw):
    params = dict(measure='amount', control_measure='amount', reference='controls', group_by=[],
                  semantic_fields=SEM, control_scope='independent', aggregation=aggregation, measure_kind='balance' if aggregation == 'period_end' else 'flow', row_level=dict(field='level', value='detail'))
    if aggregation == 'period_end': params['period_field'] = 'period'
    params.update(kw)
    return bundle(rule('reconcile', params))


class Tier1GoldenTests(unittest.TestCase):
    def test_clean_required_and_strict_types(self):
        config = bundle(rule('required_fields', {'fields': ['id', 'amount']}), rule('types', {'fields': {'id': {'type': 'string', 'nullable': False}, 'amount': {'type': 'decimal', 'nullable': False}}}))
        report = production([{'id': '001', 'amount': Decimal('0.00')}], config)
        self.assertEqual(report['gate'], 'pass')
        self.assertEqual(report['outcome_counts'], {'pass': 2})

    def test_missing_field_differs_from_null(self):
        config = bundle(rule('required_fields', {'fields': ['x']}), rule('types', {'fields': {'x': {'type': 'integer', 'nullable': True}}}))
        self.assertEqual(production([{'x': None}], config)['gate'], 'pass')
        self.assertEqual(production([{}], config)['gate'], 'fail')

    def test_strict_types_do_not_coerce(self):
        fixtures = [('integer', True, False), ('integer', '10', False), ('integer', 10, True),
                    ('decimal', '1.1', False), ('decimal', Decimal('1.1'), True), ('boolean', 0, False),
                    ('date', '2026-02-30', False), ('date', '03/01/2026', False), ('date', '2026-03-01', True),
                    ('datetime', '2026-04-05T12:00:00Z', True), ('datetime', '2026-04-05T12:00:00', False)]
        for kind, value, expected in fixtures:
            with self.subTest(kind=kind, value_type=type(value).__name__):
                report = production([{'x': value}], bundle(rule('types', {'fields': {'x': {'type': kind, 'nullable': False}}})))
                self.assertEqual(outcome(report), 'pass' if expected else 'fail')

    def test_composite_key_not_individual_uniqueness(self):
        rows = [{'month': 'Jan', 'group': 'A'}, {'month': 'Jan', 'group': 'B'}, {'month': 'Feb', 'group': 'A'}]
        config = bundle(rule('unique', {'fields': ['month', 'group']}))
        self.assertEqual(outcome(production(rows, config)), 'pass')
        report = production(rows + [rows[0]], config)
        self.assertEqual(outcome(report), 'fail')
        self.assertEqual(report['results'][0]['counts']['duplicate_excess_rows'], 1)

    def test_missing_group_offset_by_duplicate_is_detected(self):
        rows = [{'month': 'Jan', 'group': 'A', 'amount': 40}, {'month': 'Jan', 'group': 'A', 'amount': 60}]
        config = bundle(rule('unique', {'fields': ['month', 'group']}), rule('coverage', {'fields': ['month', 'group'], 'expected': [['Jan', 'A'], ['Jan', 'B']]}))
        report = production(rows, config)
        self.assertEqual([r['outcome'] for r in report['results']], ['fail', 'fail'])
        self.assertEqual(report['results'][1]['counts']['missing_groups'], 1)

    def test_empty_input_never_passes(self):
        report = production([], bundle(rule('required_fields', {'fields': ['x']})))
        self.assertEqual(report['gate'], 'blocked')
        self.assertEqual(outcome(report), 'not_evaluated')

    def test_null_grain_fails(self):
        self.assertEqual(outcome(production([{'x': None}], bundle(rule('unique', {'fields': ['x']})))), 'fail')

    def test_allowed_values_distinguish_bool_and_int(self):
        config = bundle(rule('allowed_values', {'field': 'x', 'values': [0]}))
        self.assertEqual(outcome(production([{'x': False}], config)), 'fail')
        self.assertEqual(outcome(production([{'x': 0}], config)), 'pass')

    def test_ranges_are_owner_declared_and_inclusive(self):
        config = bundle(rule('range', {'field': 'x', 'min': '0.01', 'max': '9.99'}))
        for value, status in [('0.01', 'pass'), ('9.99', 'pass'), ('0', 'fail'), ('10', 'fail')]:
            self.assertEqual(outcome(production([{'x': Decimal(value)}], config)), status)

    def test_coverage_missing_reference_not_evaluated(self):
        report = production([{'g': 'A'}], bundle(rule('coverage', {'fields': ['g'], 'reference': 'roster'})))
        self.assertEqual(outcome(report), 'not_evaluated'); self.assertEqual(report['gate'], 'blocked')

    def test_coverage_independent_roster_and_no_mutation(self):
        rows = [{'g': 'A'}]; refs = {'roster': [{'g': 'A'}, {'g': 'B'}]}; original = copy.deepcopy((rows, refs))
        report = production(rows, bundle(rule('coverage', {'fields': ['g'], 'reference': 'roster'})), references=refs)
        self.assertEqual(outcome(report), 'fail'); self.assertEqual((rows, refs), original)

    def test_freshness_by_partition_not_freshest_global_row(self):
        rows = [{'partition': 'A', 'loaded': '2026-04-01T12:00:00Z'}, {'partition': 'B', 'loaded': '2026-04-04T12:00:00Z'}]
        config = bundle(rule('freshness', dict(field='loaded', partition_by=['partition'], expected_partitions=[['A'], ['B']], max_age_seconds=172800)))
        report = production(rows, config, evaluation_time='2026-04-05T12:00:00Z')
        self.assertEqual(outcome(report), 'fail'); self.assertEqual(report['results'][0]['counts']['stale_partitions'], 1)
        self.assertEqual(outcome(production(rows, config)), 'not_evaluated')

    def test_freshness_requires_expected_partitions(self):
        config = bundle(rule('freshness', dict(field='loaded', partition_by=['partition'], max_age_seconds=10)))
        self.assertEqual(outcome(production([{'partition': 'A', 'loaded': '2026-04-05T12:00:00Z'}], config, evaluation_time='2026-04-05T12:00:00Z')), 'not_evaluated')

    def test_missing_partition_and_future_rows_fail(self):
        config = bundle(rule('freshness', dict(field='loaded', partition_by=['partition'], expected_partitions=[['A'], ['B']], max_age_seconds=172800)))
        report = production([{'partition': 'A', 'loaded': '2026-04-06T12:00:00Z'}], config, evaluation_time='2026-04-05T12:00:00Z')
        self.assertEqual(report['results'][0]['counts']['missing_partitions'], 1)
        self.assertEqual(report['results'][0]['counts']['future_rows'], 1)

    def test_freshness_boundary_and_offset_equivalence(self):
        config = bundle(rule('freshness', dict(field='loaded', partition_by=[], max_age_seconds=172800)))
        for stamp, status in [('2026-04-03T12:00:00Z', 'pass'), ('2026-04-03T11:59:59Z', 'fail'), ('2026-04-05T08:00:00-04:00', 'pass')]:
            self.assertEqual(outcome(production([{'loaded': stamp}], config, evaluation_time='2026-04-05T12:00:00Z')), status)

    def test_consistency_mixed_currency_scale_scenario_snapshot(self):
        config = bundle(rule('consistency', dict(fields=['currency', 'scale', 'scenario', 'snapshot'], within=[])))
        for field, new in [('currency', 'EUR'), ('scale', '1000'), ('scenario', 'Plan'), ('snapshot', 's2')]:
            rows = [record('1'), record('2', **{field: new})]
            self.assertEqual(outcome(production(rows, config)), 'fail')

    def test_mixed_subtotal_and_detail_protection(self):
        rows = [record('40'), record('60'), record('100', level='subtotal')]
        levels = bundle(rule('row_level', dict(field='level', allowed_levels=['detail', 'subtotal'], within=['period'])))
        self.assertEqual(outcome(production(rows, levels)), 'fail')
        report = production(rows, reconciliation(), references={'controls': [record('100')]})
        self.assertEqual(outcome(report), 'pass')
        self.assertEqual(report['results'][0]['counts'], dict(selected_rows=2, excluded_rows=1, unmatched_groups=0, mismatched_groups=0))

    def test_reconciliation_independent_controls_missing_and_invalid(self):
        rows = [record('100')]; config = reconciliation()
        report = production(rows, config)
        self.assertEqual(outcome(report), 'not_evaluated'); self.assertEqual(report['gate'], 'blocked')
        report = production(rows, config, references={'controls': [record('100'), record('100')]})
        self.assertEqual(outcome(report), 'error'); self.assertEqual(report['gate'], 'blocked')

    def test_reconciliation_context_and_coverage_mismatch(self):
        for field, val in [('currency', 'EUR'), ('scale', '1000'), ('snapshot', 's2'), ('scenario', 'Plan')]:
            self.assertEqual(outcome(production([record('100', **{field: val})], reconciliation(), references={'controls': [record('100')]})), 'fail')
        missing = record('100'); del missing['unit']
        self.assertEqual(outcome(production([missing], reconciliation(), references={'controls': [record('100')]})), 'not_evaluated')

    def test_period_end_balance_is_140_not_360(self):
        rows = [record('100', period='2026-01-31'), record('120', period='2026-02-28'), record('140', period='2026-03-31')]
        config = reconciliation('period_end')
        self.assertEqual(outcome(production(rows, config, references={'controls': [record('140')]})), 'pass')
        self.assertEqual(outcome(production(rows, config, references={'controls': [record('360')]})), 'fail')
        self.assertEqual(outcome(production(rows, config, references={'controls': [record('140', period='2026-02-28')]})), 'fail')

    def test_period_end_duplicate_latest_is_error(self):
        rows = [record('140'), record('140')]
        self.assertEqual(outcome(production(rows, reconciliation('period_end'), references={'controls': [record('140')]})), 'error')

    def test_tolerance_boundary_exact(self):
        config = reconciliation(tolerance='0.01')
        for value, status in [('100.01', 'pass'), ('100.0101', 'fail')]:
            self.assertEqual(outcome(production([record(value)], config, references={'controls': [record('100')]})), status)

    def test_dependency_only_blocks_dependent_checks(self):
        a = rule('allowed_values', {'field': 'currency', 'values': ['USD']}, id='currency')
        b = rule('range', {'field': 'amount', 'min': 0}, id='analysis_input'); b['depends_on'] = ['currency']
        c = rule('required_fields', {'fields': ['amount']}, id='structure')
        report = production([record('5', currency='EUR')], bundle(a, b, c))
        self.assertEqual([r['outcome'] for r in report['results']], ['fail', 'not_evaluated', 'pass'])

    def test_outcomes_severity_and_gate_are_independent(self):
        required = rule('required_fields', {'fields': ['x']}); required['severity'] = 'info'
        optional = rule('coverage', {'fields': ['x'], 'reference': 'missing'}); optional.update(required=False, blocking=False)
        report = production([{'x': 0}], bundle(required, optional))
        self.assertEqual(report['gate'], 'pass'); self.assertEqual(outcome(report, 'coverage'), 'not_evaluated')
        self.assertEqual(production([{}], bundle(required, optional))['gate'], 'fail')

    def test_draft_preview_and_approval_trust(self):
        config = bundle(rule('required_fields', {'fields': ['x']})); rows = [{'x': 0}]
        self.assertEqual(evaluate(rows, config)['gate'], 'non_gating')
        self.assertEqual(evaluate(rows, config, mode='production')['gate'], 'blocked')
        config, digest = approve(config)
        self.assertEqual(evaluate(rows, config, mode='production')['gate'], 'blocked')
        self.assertEqual(evaluate(rows, config, mode='production', trusted_digests=[digest])['gate'], 'pass')
        config['rules'][0]['severity'] = 'warning'
        self.assertEqual(evaluate(rows, config, mode='production', trusted_digests=[digest])['gate'], 'blocked')

    def test_draft_flag_cannot_authenticate(self):
        config = bundle(rule('required_fields', {'fields': ['x']})); config['provenance']['kind'] = 'draft_proposal'
        self.assertEqual(production([{'x': 1}], config)['gate'], 'blocked')

    def test_no_required_checks_cannot_gate_pass(self):
        check = rule('required_fields', {'fields': ['x']}); check.update(required=False)
        self.assertEqual(production([{'x': 1}], bundle(check))['gate'], 'blocked')


class ContractBoundaryTests(unittest.TestCase):
    def setUp(self): self.config = bundle(rule('required_fields', {'fields': ['x']}))

    def test_unknown_fields_operators_versions_cycles_dependencies(self):
        cases = []
        c = copy.deepcopy(self.config); c['unexpected'] = 1; cases.append(c)
        c = copy.deepcopy(self.config); c['schema_version'] = '99.0'; cases.append(c)
        c = copy.deepcopy(self.config); c['rules'][0]['operator'] = 'eval'; cases.append(c)
        c = copy.deepcopy(self.config); c['rules'][0]['params']['python'] = 'os.system'; cases.append(c)
        c = copy.deepcopy(self.config); c['rules'][0]['depends_on'] = ['required_fields']; cases.append(c)
        c = copy.deepcopy(self.config); c['rules'][0]['depends_on'] = ['absent']; cases.append(c)
        c = copy.deepcopy(self.config); c['rules'] *= 129; cases.append(c)
        for c in cases:
            with self.subTest(case=len(c.get('rules', []))):
                with self.assertRaises(ConfigError): validate_bundle(c)

    def test_duplicate_json_keys_and_nonfinite_numbers(self):
        for text in ['{"schema_version":"1.0","schema_version":"2.0"}', '{"x":NaN}', '{"x":1.1}', '[' * 30 + '1' + ']' * 30]:
            with self.assertRaises(ConfigError): load_bundle(text)

    def test_scalar_resource_and_shape_limits(self):
        for rows in [[{'x': float('nan')}], [{'x': 1.0}], [{'x': []}], [{'x': 'a' * 4097}], [{'x': Decimal('1e101')}], [None]]:
            with self.assertRaises(ConfigError): evaluate(rows, self.config)
        with self.assertRaises(ConfigError): evaluate([{'x': 1}], self.config, evaluation_time='2026-01-01')
        with self.assertRaises(ConfigError): evaluate([{'x': 1}], self.config, diagnostic_limit=21)

    def test_malformed_parameter_types_are_config_errors(self):
        valid = [rule('types', {'fields': {'x': {'type': 'string', 'nullable': False}}}),
                 rule('range', {'field': 'x', 'min': '0'}), rule('coverage', {'fields': ['x'], 'expected': [['A']]})]
        for check in valid:
            for k in list(check['params']):
                for bad in [None, {}, [], True, 3]:
                    if check['operator'] == 'range' and k == 'min' and type(bad) is int: continue
                    changed = copy.deepcopy(check); changed['params'][k] = bad
                    with self.subTest(op=check['operator'], field=k, bad_type=type(bad).__name__):
                        with self.assertRaises(ConfigError): validate_bundle(bundle(changed))

    def test_large_integer_and_duplicate_reference_fail_safely(self):
        with self.assertRaises(ConfigError): evaluate([{'x': 10**5000}], self.config)
        c = bundle(rule('coverage', {'fields': ['x'], 'reference': 'roster'}))
        report = production([{'x': 1}], c, references={'roster': [{'x': 1}, {'x': 1}]})
        self.assertEqual(outcome(report), 'error')
        self.assertEqual(report['gate'], 'blocked')

    def test_explicit_null_domain_and_csv_null_convention(self):
        c = bundle(rule('allowed_values', {'field': 'x', 'values': [None, 0]}))
        self.assertEqual(outcome(production([{'x': None}, {'x': 0}], c)), 'pass')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic.csv'
            path.write_text('a,b\n,0\n')
            self.assertEqual(read_csv(path, types={'b': 'integer'}, null_token=''), [{'a': None, 'b': 0}])

    def test_csv_identifiers_decimal_null_and_empty_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic.csv'
            path.write_text('id,amount,empty,null,date\n001,0.123456789012345678901234567890,,\\N,2026-02-30\n', encoding='utf-8')
            rows = read_csv(path, types={'amount': 'decimal', 'date': 'date'})
            self.assertEqual(rows, [{'id': '001', 'amount': Decimal('0.123456789012345678901234567890'), 'empty': '', 'null': None, 'date': '2026-02-30'}])

    def test_csv_invalid_and_ambiguous_cells_not_normalized(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic.csv'
            for body in ['a,a\n1,2\n', 'a,b\n1\n', ',b\n1,2\n']:
                path.write_text(body)
                with self.assertRaises(ConfigError): read_csv(path)
            path.write_text('a,b\n01,"1,000"\n')
            self.assertEqual(read_csv(path, types={'a': 'integer', 'b': 'decimal'}), [{'a': '01', 'b': '1,000'}])

    def test_cli_api_parity_and_safe_errors(self):
        config, digest = approve(bundle(rule('types', {'fields': {'id': {'type': 'string', 'nullable': False}, 'amount': {'type': 'decimal', 'nullable': False}}})))
        with tempfile.TemporaryDirectory() as directory:
            rules = Path(directory) / 'rules.json'; data = Path(directory) / 'data.csv'
            rules.write_text(json.dumps(config)); data.write_text('id,amount\n001,10.01\n')
            out = io.StringIO()
            with patch('sys.stdout', out):
                code = main(['--rules', str(rules), '--csv', str(data), '--mode', 'production', '--trusted-digest', digest])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(out.getvalue()), evaluate([{'id': '001', 'amount': Decimal('10.01')}], config, mode='production', trusted_digests=[digest]))
            out = io.StringIO()
            with patch('sys.stdout', out): code = main(['--rules', str(rules), '--csv', str(data) + 'missing'])
            self.assertEqual(code, 2); self.assertNotIn(directory, out.getvalue())


class GeneratedPropertyTests(unittest.TestCase):
    def test_permutation_determinism_and_exact_decimal_additivity(self):
        rng = random.Random(20261014)
        for trial in range(100):
            cents = [rng.randint(-10**12, 10**12) for _ in range(rng.randint(1, 30))]
            rows = [record(str(Decimal(c) / 100)) for c in cents]
            expected = Decimal(sum(cents)) / 100
            refs = {'controls': [record(str(expected))]}
            config = reconciliation()
            before = copy.deepcopy((rows, config, refs))
            report = production(rows, config, references=refs)
            self.assertEqual(outcome(report), 'pass')
            self.assertEqual((rows, config, refs), before)
            rng.shuffle(rows)
            self.assertEqual(production(rows, config, references=refs), report)
            with localcontext() as context:
                context.prec = 3
                self.assertEqual(production(rows, config, references=refs), report)

    def test_diagnostic_privacy_bounds_and_no_network_or_io(self):
        secret = 'FICTIONAL_SECRET_customer@example.invalid_<script>'
        rows = [{'x': secret} for _ in range(100)]
        config = bundle(rule('allowed_values', {'field': 'x', 'values': ['expected']}))
        with patch('socket.socket', side_effect=AssertionError('network')), patch('builtins.open', side_effect=AssertionError('IO')):
            report = production(rows, config)
            observed = profile(rows)
            diagnostic = production(rows, config, diagnostic_limit=5)
        for value in [report, observed, diagnostic]:
            self.assertNotIn(secret, json.dumps(value)); self.assertNotIn('top_values', json.dumps(value))
        self.assertNotIn('diagnostics', report['results'][0])
        self.assertEqual(diagnostic['results'][0]['diagnostics'], {'row_indices': [0, 1, 2, 3, 4], 'truncated': True})

    def test_large_table_and_bounded_report(self):
        rows = [{'id': 'synthetic-%06d' % i, 'value': i % 7} for i in range(100_000)]
        report = production(rows, bundle(rule('unique', {'fields': ['id']})))
        self.assertEqual(report['gate'], 'pass')
        self.assertLess(len(json.dumps(report)), 2000)
        with self.assertRaises(ConfigError): production(rows + [rows[0]], bundle(rule('unique', {'fields': ['id']})))


if __name__ == '__main__': unittest.main()
