"""Independent grounding, privacy, opt-in and real CLI checks; adapters here are mocks."""
import copy
from decimal import Decimal, localcontext
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
import warnings
import gc
from unittest.mock import patch

from reporting_assurance import ConfigError, explain, load_selection, evaluate
from test_tier1 import bundle, rule, approve, record
from test_analysis import spec


class OfflineSelectionAdapter:
    """A local test double. This class does not implement or verify a live model."""
    def __init__(self):
        self.calls = []

    def select_evidence(self, packet):
        self.calls.append(copy.deepcopy(packet))
        return dict(selection_version='1.0', evidence_digest=packet['evidence_digest'],
                    fact_ids=packet['mandatory_fact_ids'])


def configuration():
    return bundle(rule('required_fields', {'fields': ['amount']}, id='structure'))


def plan(packet):
    return dict(selection_version='1.0', evidence_digest=packet['evidence_digest'],
                fact_ids=[fact['id'] for fact in packet['facts']])


class InterpretationTests(unittest.TestCase):
    def test_default_summary_re_evaluates_and_keeps_gate_separate(self):
        rows = [{'amount': 0}]
        config, digest = approve(configuration())
        result = explain(rows, config, mode='production', trusted_digests=[digest])
        self.assertEqual(result['deterministic'], evaluate(rows, config, mode='production', trusted_digests=[digest]))
        self.assertEqual(result['deterministic']['gate'], 'pass')
        view = result['interpretation']
        self.assertEqual((view['outcome'], view['method'], view['adapter_called']), ('pass', 'controlled_templates', False))
        self.assertFalse(view['changes_deterministic_gate'])
        self.assertEqual(view['model_verification'], 'not_verified')
        text = ' '.join(statement['text'] for statement in view['statements'])
        self.assertIn('Deterministic gate: pass.', text)
        self.assertIn('Rows: 1. Checks: 1.', text)
        self.assertIn('Check 1 (required_fields): pass; fields present.', text)
        self.assertIn('do not establish causes', text)

    def test_preview_and_missing_approval_never_become_production_passes(self):
        rows = [{'amount': 1}]
        for mode, gate in [('preview', 'non_gating'), ('production', 'blocked')]:
            adapter = OfflineSelectionAdapter()
            result = explain(rows, configuration(), mode=mode, adapter=adapter, allow_adapter=True)
            self.assertEqual(result['deterministic']['gate'], gate)
            self.assertIn('Deterministic gate: ' + gate, result['interpretation']['statements'][0]['text'])
            self.assertEqual(result['interpretation']['outcome'], 'pass')

    def test_adapter_is_never_inspected_or_called_without_explicit_authorization(self):
        class DoNotInspect:
            def __getattribute__(self, name):
                raise AssertionError('adapter_must_not_be_inspected')
        result = explain([{'amount': 1}], configuration(), adapter=DoNotInspect())
        self.assertEqual(result['interpretation']['outcome'], 'not_evaluated')
        self.assertEqual(result['interpretation']['reason'], 'adapter_authorization_required')
        self.assertFalse(result['interpretation']['adapter_called'])
        self.assertEqual(result['interpretation']['statements'], [])

    def test_mock_adapter_receives_only_detached_safe_metadata(self):
        secret = 'FICTIONAL_PRIVATE_VALUE_12345'
        config = configuration()
        config['rules'][0]['id'] = 'private_rule_identifier'
        config['provenance']['source'] = secret
        rows = [{'amount': 1, 'private_field': secret}]
        before = copy.deepcopy((rows, config))
        adapter = OfflineSelectionAdapter()
        with patch('builtins.open', side_effect=AssertionError('no_file_io')), patch.object(socket, 'socket', side_effect=AssertionError('no_network')):
            result = explain(rows, config, adapter=adapter, allow_adapter=True, diagnostic_limit=5)
        self.assertEqual(len(adapter.calls), 1)
        packet = json.dumps(adapter.calls[0])
        for value in [secret, 'private_field', 'private_rule_identifier', 'row_indices', 'provenance']:
            self.assertNotIn(value, packet)
        self.assertEqual((rows, config), before)
        self.assertEqual(result['interpretation']['reason'], 'adapter_selection_validated')
        self.assertEqual(result['interpretation']['method'], 'caller_adapter')
        json.dumps(result, allow_nan=False)

    def test_adapter_mutation_cannot_invent_rendered_facts_or_change_results(self):
        class MutatingAdapter:
            def select_evidence(self, packet):
                selection = plan(packet)
                packet['facts'][0]['text'] = 'Invented acquisition caused a 999 percent increase.'
                packet['mandatory_fact_ids'].clear()
                return selection
        result = explain([{'amount': 1}], configuration(), adapter=MutatingAdapter(), allow_adapter=True)
        self.assertNotIn('acquisition', json.dumps(result))
        self.assertIn('Deterministic gate: non_gating', result['interpretation']['statements'][0]['text'])
        self.assertEqual(result['interpretation']['outcome'], 'pass')

    def test_unknown_ids_free_prose_stale_digest_and_missing_blockers_are_rejected(self):
        config, digest = approve(configuration())
        rows = [{}]
        original = explain(rows, config, mode='production', trusted_digests=[digest])
        base = plan(original['evidence'])
        variants = []
        bad = copy.deepcopy(base); bad['narrative'] = 'Invented cause and 999'; variants.append(bad)
        bad = copy.deepcopy(base); bad['fact_ids'].append('f9999'); variants.append(bad)
        bad = copy.deepcopy(base); bad['fact_ids'] *= 2; variants.append(bad)
        bad = copy.deepcopy(base); bad['evidence_digest'] = '0' * 64; variants.append(bad)
        bad = copy.deepcopy(base); bad['fact_ids'].remove('f0001'); variants.append(bad)
        bad = copy.deepcopy(base); bad['selection_version'] = '2.0'; variants.append(bad)
        bad = copy.deepcopy(base); bad['fact_ids'] = 'f0000'; variants.append(bad)
        variants.extend([False, [], {'approval': True}])
        for selection in variants:
            with self.subTest(selection_type=type(selection).__name__):
                result = explain(rows, config, mode='production', trusted_digests=[digest], selection=selection)
                self.assertEqual(result['deterministic'], original['deterministic'])
                self.assertEqual(result['deterministic']['gate'], 'fail')
                self.assertEqual(result['interpretation']['reason'], 'invalid_interpretation_selection')
                self.assertEqual(result['interpretation']['statements'], [])

    def test_missing_coverage_and_zero_denominator_are_explained_as_unavailable(self):
        config = configuration()
        config['rules'].append(rule('coverage', {'fields': ['amount'], 'reference': 'missing'}, id='coverage'))
        config['analysis'] = spec()
        result = explain([record('1', revenue=0, cost=0)], config, include_analysis=True)
        text = ' '.join(f['text'] for f in result['evidence']['facts'])
        self.assertIn('not evaluated; coverage reference unavailable', text)
        self.assertIn('not evaluated; zero denominator', text)
        self.assertNotIn('analysis_value', [f['kind'] for f in result['evidence']['facts']])

    def test_aggregate_numeric_evidence_requires_explicit_opt_in(self):
        rows = [record('100', revenue=100, cost=80), record('900', revenue=900, cost=450)]
        config = configuration(); config['analysis'] = spec()
        counts_only = explain(rows, config, include_analysis=True)
        numeric = explain(rows, config, include_analysis=True, include_numeric_evidence=True)
        text = ' '.join(f['text'] for f in numeric['evidence']['facts'])
        self.assertIn('numerator: 470; denominator: 1000; ratio: 0.47', text)
        self.assertNotIn('ratio: 0.47', json.dumps(counts_only['evidence']))
        self.assertEqual(counts_only['evidence']['omitted_numeric_groups'], 1)
        self.assertEqual(numeric['evidence']['omitted_numeric_groups'], 0)
        self.assertEqual(counts_only['deterministic'], numeric['deterministic'])
        self.assertNotIn('revenue', json.dumps(numeric['evidence']))

    def test_zero_baseline_unavailability_is_mandatory_even_without_numeric_evidence(self):
        config = configuration(); config['analysis'] = spec('variance')
        refs = {'plan': [record('0', scenario='Plan', snapshot='p1')],
                'calendar': [{'period': '2026-03-31', 'complete': True, 'period_state': 'closed'}]}
        result = explain([record('10')], config, references=refs, include_analysis=True)
        unavailable = next(f for f in result['evidence']['facts'] if 'zero baseline' in f['text'])
        self.assertIn('relative comparison is not evaluated in 1 calculation groups', unavailable['text'])
        self.assertIn(unavailable['id'], result['evidence']['mandatory_fact_ids'])
        self.assertNotIn('actual: 10', json.dumps(result['evidence']))
        selection = plan(result['evidence']); selection['fact_ids'].remove(unavailable['id'])
        rejected = explain([record('10')], config, references=refs, include_analysis=True, selection=selection)
        self.assertEqual(rejected['interpretation']['outcome'], 'error')
        self.assertEqual(rejected['deterministic'], result['deterministic'])

    def test_packet_bounds_make_omitted_groups_explicit(self):
        rows = [record('1', private_group='private-%04d' % i) for i in range(1000)]
        config = configuration(); config['analysis'] = spec('summary', group_by=['private_group'])
        result = explain(rows, config, include_analysis=True, include_numeric_evidence=True)
        evidence = result['evidence']
        self.assertLessEqual(len(evidence['facts']), 256)
        shared = sum(f['kind'] == 'analysis_value' for f in evidence['facts'])
        self.assertEqual(shared + evidence['omitted_numeric_groups'], 1000)
        self.assertGreater(evidence['omitted_numeric_groups'], 0)
        self.assertEqual(evidence['facts'][-1]['kind'], 'limitation')
        self.assertIn(evidence['facts'][-1]['id'], evidence['mandatory_fact_ids'])
        self.assertNotIn('private-', json.dumps(evidence))

    def test_failed_mock_adapter_redacts_exception_and_none_is_not_success(self):
        class FailingAdapter:
            def select_evidence(self, packet):
                raise RuntimeError('FICTIONAL_SECRET_TOKEN_AND_ROWS')
        class EmptyAdapter:
            def select_evidence(self, packet):
                return None
        class AsyncAdapter:
            async def select_evidence(self, packet):
                return plan(packet)
        class DeferredAdapter:
            def select_evidence(self, packet):
                return AsyncAdapter().select_evidence(packet)
        for adapter in [AsyncAdapter(), DeferredAdapter()]:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter('always', RuntimeWarning)
                asynchronous = explain([{'amount': 1}], configuration(), adapter=adapter, allow_adapter=True)
                gc.collect()
            self.assertEqual(asynchronous['interpretation']['outcome'], 'error')
            self.assertEqual(asynchronous['interpretation']['reason'], 'async_adapter_not_supported')
            self.assertFalse(any('never awaited' in str(item.message) for item in caught))
        for adapter in [FailingAdapter(), EmptyAdapter()]:
            result = explain([{'amount': 1}], configuration(), adapter=adapter, allow_adapter=True)
            self.assertEqual(result['interpretation']['outcome'], 'error')
            self.assertTrue(result['interpretation']['adapter_called'])
            self.assertNotIn('FICTIONAL_SECRET', json.dumps(result))
            self.assertEqual(result['interpretation']['statements'], [])

    def test_determinism_and_stale_plan_after_evidence_changes(self):
        config = configuration(); rows = [{'amount': 1}, {'amount': 2}]
        first = explain(rows, config)
        with localcontext() as context:
            context.prec = 2
            self.assertEqual(explain(list(reversed(rows)), config), first)
        replay = explain(rows, config, selection=plan(first['evidence']))
        self.assertEqual(replay['interpretation']['outcome'], 'pass')
        changed = explain(rows + [{'amount': 3}], config, selection=plan(first['evidence']))
        self.assertEqual(changed['interpretation']['outcome'], 'error')

    def test_malformed_options_and_json_never_select_executable_code(self):
        for options in [dict(allow_adapter='false'), dict(include_analysis=[]),
                        dict(include_numeric_evidence=True), dict(analysis_spec=spec()),
                        dict(adapter=OfflineSelectionAdapter(), selection={})]:
            with self.assertRaises(ConfigError):
                explain([{'amount': 1}], configuration(), **options)
        for text in ['null', '{"selection_version":"1.0","selection_version":"2.0"}',
                     '{"provider":"os.system","code":"delete"}', 'x' * 65537]:
            with self.assertRaises(ConfigError):
                load_selection(text)

    def test_tier2_keeps_explicit_diagnostics_in_tier1_only(self):
        config = configuration(); config['analysis'] = spec('summary')
        result = explain([{}], config, include_analysis=True, diagnostic_limit=1)
        self.assertEqual(result['deterministic']['tier1']['results'][0]['diagnostics']['row_indices'], [0])
        self.assertNotIn('row_indices', json.dumps(result['evidence']))

    def test_real_cli_explain_and_offline_plan_preserve_gate_and_privacy(self):
        root = Path(__file__).resolve().parents[2]
        args = ['-m', 'reporting_assurance', '--rules', str(root / 'python/examples/rules.json'),
                '--csv', str(root / 'python/examples/reporting.csv'), '--reference',
                'controls=' + str(root / 'python/examples/controls.csv'),
                '--evaluation-time', '2026-04-05T12:00:00Z', '--mode', 'production',
                '--trusted-digest', (root / 'python/examples/trusted-digest.txt').read_text().strip(),
                '--include-analysis', '--explain']
        def run(extra=()):
            return subprocess.run([sys.executable, *args, *extra], capture_output=True, text=True)
        first = run(); self.assertEqual(first.returncode, 0, first.stderr)
        report = json.loads(first.stdout)
        self.assertEqual(report['deterministic']['tier1']['gate'], 'pass')
        self.assertEqual(report['interpretation']['method'], 'controlled_templates')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'selection.json'
            path.write_text(json.dumps(plan(report['evidence'])), encoding='utf-8')
            replay = run(['--interpretation-plan', str(path)])
            self.assertEqual(replay.returncode, 0, replay.stderr)
            result = json.loads(replay.stdout)
            self.assertEqual(result['deterministic'], report['deterministic'])
            self.assertEqual(result['interpretation']['reason'], 'offline_selection_validated')
            path.write_text(json.dumps(dict(plan(report['evidence']), invented_fact='FICTIONAL_SECRET')), encoding='utf-8')
            rejected = run(['--interpretation-plan', str(path)])
            self.assertEqual(rejected.returncode, 2)
            result = json.loads(rejected.stdout)
            self.assertEqual(result['deterministic']['tier1']['gate'], 'pass')
            self.assertEqual(result['interpretation']['outcome'], 'error')
            self.assertNotIn('FICTIONAL_SECRET', rejected.stdout)
