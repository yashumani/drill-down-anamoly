"""Independent flat-table oracles; no dataframe/KNIME dependency or UI oracle."""
import copy
from datetime import date, datetime, timezone
from decimal import Decimal, localcontext
import json
from pathlib import Path
import socket
import unittest
from unittest.mock import patch

from reporting_assurance import (ConfigError, RECORD_TABLE_COLUMNS, RECORD_TABLE_VERSION,
                                  analyze, evaluate, normalize_records, report_to_record_tables)
import reporting_assurance.record_tables as record_module
from test_tier1 import approve, bundle, record, rule
from test_analysis import config, spec


class RecordTableTests(unittest.TestCase):
    def tables(self, value, **kwargs):
        result = report_to_record_tables(value, report_id='fictional-run-001', **kwargs)
        self.assertEqual(tuple(result), tuple(RECORD_TABLE_COLUMNS))
        for name, rows in result.items():
            for row in rows:
                self.assertEqual(tuple(row), RECORD_TABLE_COLUMNS[name])
                self.assertTrue(all(value is None or type(value) in (str, int, bool) for value in row.values()))
                self.assertEqual(row['report_id'], 'fictional-run-001')
        json.dumps(result, allow_nan=False)
        return result

    def test_production_pass_and_fail_keep_gate_separate_from_check_severity(self):
        c, digest = approve(bundle(rule('range', {'field': 'amount', 'min': '0'})))
        for amount, gate, outcome in [('1', 'pass', 'pass'), ('-1', 'fail', 'fail')]:
            value = evaluate([record(amount)], c, mode='production', trusted_digests=[digest])
            tables = self.tables(value)
            self.assertEqual(tables['summary'][0]['gate'], gate)
            self.assertEqual(tables['summary'][0]['table_version'], RECORD_TABLE_VERSION)
            self.assertEqual(tables['checks'][0]['outcome'], outcome)
            self.assertEqual(tables['checks'][0]['severity'], 'critical')
            self.assertTrue(tables['checks'][0]['required'])
            self.assertEqual([tables['summary'][0][key] for key in ('pass_count', 'fail_count', 'not_evaluated_count', 'error_count')],
                             [1, 0, 0, 0] if gate == 'pass' else [0, 1, 0, 0])

    def test_preview_and_untrusted_production_do_not_gain_authority(self):
        c = config()
        for mode, gate in [('preview', 'non_gating'), ('production', 'blocked')]:
            tables = self.tables(evaluate([record('1')], c, mode=mode))
            self.assertEqual(tables['summary'][0]['gate'], gate)
            self.assertFalse(tables['summary'][0]['approval_valid_in_caller_trust'])

    def test_required_unavailable_remains_blocked_and_empty_counts_are_not_fabricated(self):
        c, digest = approve(bundle(rule('coverage', {'fields': ['period'], 'reference': 'expected'})))
        tables = self.tables(evaluate([record('1')], c, mode='production', trusted_digests=[digest]))
        self.assertEqual(tables['summary'][0]['gate'], 'blocked')
        self.assertEqual(tables['checks'][0]['outcome'], 'not_evaluated')
        self.assertEqual(tables['check_counts'], [])
        self.assertEqual(tables['analyses'], [])
        self.assertEqual(tables['analysis_groups'], [])

    def test_error_status_is_not_a_failing_check_or_a_pass(self):
        c, digest = approve(bundle(rule('coverage', {'fields': ['period'], 'reference': 'expected'})))
        value = evaluate([record('1')], c, references={'expected': [{'period': '2026-03-31'}] * 2},
                         mode='production', trusted_digests=[digest])
        tables = self.tables(value)
        self.assertEqual(tables['summary'][0]['gate'], 'blocked')
        self.assertEqual(tables['summary'][0]['error_count'], 1)
        self.assertEqual(tables['checks'][0]['outcome'], 'error')

    def test_named_counts_have_stable_join_keys_and_sorted_names(self):
        c = bundle(rule('unique', {'fields': ['id', 'period']}))
        rows = [dict(record('1'), id='001'), dict(record('1'), id='001')]
        tables = self.tables(evaluate(rows, c))
        self.assertEqual(tables['check_counts'], [
            {'report_id': 'fictional-run-001', 'check_id': 'unique', 'count_name': 'duplicate_excess_rows', 'count': 1},
            {'report_id': 'fictional-run-001', 'check_id': 'unique', 'count_name': 'missing_key_rows', 'count': 0}])

    def test_diagnostics_need_explicit_output_opt_in_and_keep_truncation(self):
        c = bundle(rule('range', {'field': 'amount', 'min': '0'}))
        value = evaluate([record('-1'), record('-2')], c, diagnostic_limit=1)
        default = self.tables(value)
        self.assertEqual(default['check_diagnostics'], [])
        self.assertTrue(default['checks'][0]['diagnostics_available'])
        self.assertFalse(default['checks'][0]['diagnostics_included'])
        self.assertTrue(default['checks'][0]['diagnostics_truncated'])
        included = self.tables(value, include_diagnostics=True)
        self.assertEqual(included['check_diagnostics'], [{'report_id': 'fictional-run-001', 'check_id': 'range', 'diagnostic_index': 0, 'row_index': 0}])

    def test_absent_and_empty_diagnostics_remain_distinct(self):
        for limit, available, count in [(0, False, None), (20, True, 0)]:
            tables = self.tables(evaluate([record('1')], config(), diagnostic_limit=limit), include_diagnostics=True)
            self.assertEqual(tables['checks'][0]['diagnostics_available'], available)
            self.assertEqual(tables['checks'][0]['diagnostic_row_count'], count)
            self.assertEqual(tables['check_diagnostics'], [])
        empty = self.tables(evaluate([], config(), diagnostic_limit=20))
        self.assertEqual(empty['checks'][0]['outcome'], 'not_evaluated')
        self.assertEqual(empty['summary'][0]['row_count'], 0)

    def test_all_analysis_operators_keep_scalar_groups_and_exact_decimal_strings(self):
        rows = [record('9007199254740993.00010', revenue=100, cost=53)]
        for operator, expected in [('summary', ('total', '9007199254740993.00010')),
                                   ('ratio_of_sums', ('ratio', '0.47')),
                                   ('period_end', ('value', '9007199254740993.00010'))]:
            value = analyze(rows, config(), spec(operator))
            tables = self.tables(value)
            self.assertEqual(tables['summary'][0]['analysis_count'], 1)
            self.assertEqual(tables['analyses'][0]['analysis_id'], operator)
            group = tables['analysis_groups'][0]
            self.assertEqual(group['group_index'], 0)
            self.assertEqual(group[expected[0]], expected[1])
            self.assertIsNone(group['relative_delta'])
            self.assertIsNone(group['actual'])

    def test_zero_baseline_keeps_absolute_delta_and_unavailable_relative_value(self):
        refs = {'plan': [record('0', scenario='Plan', snapshot='p1')],
                'calendar': [{'period': '2026-03-31', 'period_state': 'closed', 'complete': True}]}
        value = analyze([record('10')], config(), spec('variance'), references=refs)
        tables = self.tables(value)
        group = tables['analysis_groups'][0]
        self.assertEqual((group['actual'], group['baseline'], group['delta']), ('10', '0', '10'))
        self.assertIsNone(group['relative_delta'])
        self.assertEqual(group['relative_outcome'], 'not_evaluated')
        self.assertEqual(group['relative_reason'], 'zero_baseline')

    def test_skipped_analysis_stays_present_without_sentinel_group_or_zero(self):
        tables = self.tables(analyze([record('1')], config(), spec('variance')))
        self.assertEqual(tables['analyses'][0]['outcome'], 'not_evaluated')
        self.assertEqual(tables['analyses'][0]['reason'], 'baseline_missing')
        self.assertEqual(tables['analyses'][0]['group_count'], 0)
        self.assertIsNone(tables['analyses'][0]['mismatched_groups'])
        self.assertEqual(tables['analysis_groups'], [])

    def test_group_indices_join_within_analysis_without_exposing_group_labels(self):
        rows = [record('40', region='private-A'), record('60', region='private-B')]
        s = spec('summary', group_by=['region'])
        second = copy.deepcopy(s['analyses'][0]); second['id'] = 'second'
        s['analyses'].append(second)
        tables = self.tables(analyze(rows, config(), s))
        self.assertEqual([(row['analysis_id'], row['group_index'], row['total']) for row in tables['analysis_groups']],
                         [('summary', 0, '40'), ('summary', 1, '60'), ('second', 0, '40'), ('second', 1, '60')])
        self.assertNotIn('private-', json.dumps(tables))
        self.assertEqual({row['scope'] for row in tables['limitations']}, {'tier1', 'tier2'})

    def test_no_mutation_io_clock_or_decimal_context_dependence(self):
        value = analyze([record('1.00000')], config(), spec('summary'))
        original = copy.deepcopy(value)
        expected = self.tables(value)
        with localcontext() as context, patch('builtins.open', side_effect=AssertionError('unexpected IO')), patch.object(socket, 'socket', side_effect=AssertionError('unexpected network')):
            context.prec = 2
            self.assertEqual(self.tables(value), expected)
        expected['checks'][0]['outcome'] = 'changed'
        self.assertEqual(value, original)

    def test_malformed_nested_reports_are_rejected_without_echoing_payload(self):
        good = evaluate([record('1')], config(), diagnostic_limit=1)
        cases = []
        for key, bad in [('raw_rows', [{'secret': 'DO_NOT_ECHO'}]), ('report_version', '2.0'), ('outcome_counts', {'pass': 99})]:
            value = copy.deepcopy(good); value[key] = bad; cases.append(value)
        value = copy.deepcopy(good); value['results'][0]['diagnostics']['row_indices'] = [{'secret': 'DO_NOT_ECHO'}]; cases.append(value)
        value = copy.deepcopy(good); value['results'][0]['operator'] = ['DO_NOT_ECHO']; cases.append(value)
        value = copy.deepcopy(good); value['results'].append(copy.deepcopy(value['results'][0])); value['rule_count'] = 2; cases.append(value)
        for value in cases:
            with self.assertRaises(ConfigError) as error:
                self.tables(value)
            self.assertNotIn('DO_NOT_ECHO', str(error.exception))

    def test_report_ids_and_empty_table_columns_are_explicit(self):
        value = evaluate([], config())
        for identity in ('', 'contains spaces', 'x' * 129, None):
            with self.assertRaises(ConfigError):
                report_to_record_tables(value, report_id=identity)
        with self.assertRaises(TypeError):
            report_to_record_tables(value)
        with self.assertRaises(ConfigError):
            report_to_record_tables(value, report_id='safe', include_diagnostics=1)
        self.assertEqual(RECORD_TABLE_COLUMNS['check_counts'], ('report_id', 'check_id', 'count_name', 'count'))
        with self.assertRaises(TypeError):
            RECORD_TABLE_COLUMNS['unexpected'] = ()

    def test_machine_schema_defines_all_columns_even_for_empty_tables(self):
        schema = json.loads(Path(record_module.__file__).with_name('schemas').joinpath('record-tables-v1.json').read_text(encoding='utf-8'))
        self.assertEqual(tuple(schema['properties']), tuple(RECORD_TABLE_COLUMNS))
        for name, columns in RECORD_TABLE_COLUMNS.items():
            self.assertEqual(tuple(schema['properties'][name]['items']['properties']), columns)
            self.assertEqual(schema['properties'][name]['items']['required'], list(columns))
        self.assertEqual(schema['properties']['analysis_groups']['items']['properties']['total']['type'], ['string', 'null'])

    def test_malformed_or_excessive_analysis_groups_do_not_leak_nested_values(self):
        source = analyze([record('1')], config(), spec('summary'))
        cases = []
        bad = copy.deepcopy(source); bad['analyses'][0]['groups'][0]['total'] = 1.0; cases.append(bad)
        bad = copy.deepcopy(source); bad['analyses'][0]['groups'][0]['private'] = {'secret': 1}; cases.append(bad)
        bad = copy.deepcopy(source); bad['analyses'][0]['groups'] *= 2; cases.append(bad)
        bad = copy.deepcopy(source); bad['analyses'][0]['groups'] *= 1001; cases.append(bad)
        bad = copy.deepcopy(source); bad['analyses'] *= 33; cases.append(bad)
        for value in cases:
            with self.assertRaises(ConfigError):
                self.tables(value)


class RecordNormalizationTests(unittest.TestCase):
    def test_declared_exact_scalars_preserve_ids_zero_null_empty_and_date_meaning(self):
        raw = [{'id': '001', 'amount': '9007199254740993.00010', 'zero': '0.00', 'nullable': None,
                'empty': '', 'quantity': '12', 'flag': 'false', 'date': '2026-03-31',
                'time': '2026-04-05T12:00:00+02:00'}]
        original = copy.deepcopy(raw)
        rows = normalize_records(raw, types={'id': 'string', 'amount': 'decimal', 'zero': 'decimal',
            'quantity': 'integer', 'flag': 'boolean', 'date': 'date', 'time': 'datetime'})
        self.assertEqual(rows[0]['id'], '001')
        self.assertEqual(rows[0]['amount'].as_tuple(), Decimal('9007199254740993.00010').as_tuple())
        self.assertEqual(rows[0]['zero'].as_tuple(), Decimal('0.00').as_tuple())
        self.assertIsNone(rows[0]['nullable']); self.assertEqual(rows[0]['empty'], '')
        self.assertEqual(rows[0]['quantity'], 12); self.assertIs(rows[0]['flag'], False)
        self.assertEqual(rows[0]['time'], raw[0]['time']); self.assertEqual(raw, original)

    def test_bad_typed_text_remains_checkable_and_missing_fields_stay_missing(self):
        rows = normalize_records([{'id': 1, 'amount': 'bad', 'n': '001', 'flag': 'TRUE'}],
            types={'id': 'string', 'amount': 'decimal', 'n': 'integer', 'flag': 'boolean', 'missing': 'decimal'})
        self.assertEqual(rows, [{'id': 1, 'amount': 'bad', 'n': '001', 'flag': 'TRUE'}])
        c = bundle(rule('types', {'fields': {'amount': {'type': 'decimal', 'nullable': False}}}))
        self.assertEqual(evaluate(rows, c)['results'][0]['outcome'], 'fail')

    def test_no_float_recovery_unknown_objects_or_unsafe_schema(self):
        for value in (1.0, 0.1, float('nan'), float('inf'), {'nested': 1}, object()):
            with self.assertRaises(ConfigError):
                normalize_records([{'x': value}], types={'x': 'decimal'})
        for schema in ({'x': 'eval'}, {'x': []}, {'': 'string'}, []):
            with self.assertRaises(ConfigError):
                normalize_records([{'x': '1'}], types=schema)
        with self.assertRaises(ConfigError):
            normalize_records([{'x': '1' * 101}], types={'x': 'decimal'})

    def test_native_scalars_empty_records_and_limits_remain_explicit(self):
        value = {'x': Decimal('1.2300'), 'd': date(2026, 3, 31), 't': datetime(2026, 4, 5, tzinfo=timezone.utc)}
        self.assertEqual(normalize_records([value], types={'x': 'decimal', 'd': 'date', 't': 'datetime'}), [value])
        self.assertEqual(normalize_records([], types={'x': 'decimal'}), [])
        with self.assertRaises(ConfigError):
            normalize_records([{}] * 100001, types={})


if __name__ == '__main__':
    unittest.main()
