"""Held-out fixture expectations. Minimum findings, not an exact cascade count."""
import json
import hashlib
from decimal import Decimal
import unittest
from fixture_adapter import FixtureAdapter,PACK,find,normalized_oracle_status


class IndustryAcceptance(unittest.TestCase):
    def test_original_fixture_provenance_checksums(self):
        for line in (PACK/'checksums.sha256').read_text(encoding='utf-8').splitlines():
            expected, name = line.split('  ', 1)
            path = (PACK/name).resolve()
            self.assertTrue(path.is_relative_to(PACK.resolve()))
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected, name)

    def test_clean_four_industries(self):
        adapter=FixtureAdapter()
        for domain in ['telecom','retail','manufacturing','saas']:
            for table in ['transaction_detail','grouped_data','reporting_aggregates','plan_baseline']:
                with self.subTest(domain=domain,table=table):
                    report=adapter.basic(domain,table)
                    self.assertTrue(all(r['outcome']=='pass' for r in report['results']),report)
            for report in [adapter.coverage(domain),adapter.reporting_checks(domain),adapter.reconciliation(domain),adapter.reconciliation(domain,'parent_child_reconciliation')]:
                self.assertTrue(all(r['outcome']=='pass' for r in report['results']),report)
            self.assertEqual(adapter.calculations(domain)['analyses'][0]['outcome'],'pass')
        self.assertEqual(find(adapter.balance(),'balance_time_aggregation')['outcome'],'pass')
        self.assertEqual(find(adapter.source_lines(),'source_line_reconciliation')['outcome'],'pass')

    def test_quarter_arithmetic_independent_anchors(self):
        expected_ratios={'telecom':Decimal('0.1'),'retail':Decimal('0.47'),'manufacturing':Decimal('0.9'),'saas':Decimal('200')}
        adapter=FixtureAdapter()
        for domain,expected in expected_ratios.items():
            result=adapter.calculations(domain,quarter=True)['analyses'][0]
            self.assertEqual(result['outcome'],'pass',result)
            self.assertEqual(Decimal(result['groups'][0]['ratio']),expected)
            variance=adapter.calculations(domain,'variance')['analyses'][0]
            self.assertEqual(variance['outcome'],'pass',variance)
            group=variance['groups'][0]
            self.assertEqual((Decimal(group['actual']),Decimal(group['baseline']),Decimal(group['delta'])),(Decimal('6000'),Decimal('6600'),Decimal('-600')))

    def test_fifteen_isolated_replacements_against_oracle(self):
        expectations=json.loads((PACK/'expected_findings.json').read_text())
        variants=json.loads((PACK/'variant_manifest.json').read_text())
        for variant in variants:
            v=variant['variant_id'];adapter=FixtureAdapter(v);observed={}
            if v.startswith('V01'):
                for id in ['parent_child_reconciliation','independent_company_control']:observed[id]=find(adapter.reconciliation('telecom',id),id)
            elif v.startswith('V02'):
                observed['composite_grain']=find(adapter.basic('telecom','grouped_data'),'composite_grain')
                observed['expected_group_coverage']=find(adapter.coverage('telecom'),'expected_group_coverage')
            elif v.startswith('V03'):observed['ratio_of_sums']=adapter.calculations('retail')['analyses'][0]
            elif v.startswith('V04'):
                report=adapter.reconciliation('telecom','cross_level_reconciliation','grouped_data',True)
                for id in ['currency_contract','cross_level_reconciliation']:observed[id]=find(report,id)
            elif v.startswith('V05'):observed['amount_scale_contract']=find(adapter.reporting_checks('retail'),'amount_scale_contract')
            elif v.startswith('V06'):
                observed['expected_group_coverage']=find(adapter.coverage('manufacturing','reporting_aggregates'),'expected_group_coverage')
                observed['parent_child_reconciliation']=find(adapter.reconciliation('manufacturing','parent_child_reconciliation'),'parent_child_reconciliation')
            elif v.startswith('V07'):observed['strict_calendar_date']=find(adapter.basic('retail','transaction_detail'),'schema')
            elif v.startswith('V08'):observed['partition_freshness']=find(adapter.reporting_checks('telecom'),'partition_freshness')
            elif v.startswith('V09'):observed['future_timestamp']=find(adapter.reporting_checks('saas'),'partition_freshness')
            elif v.startswith('V10'):observed['comparison_baseline']=adapter.calculations('retail','variance')['analyses'][0]
            elif v.startswith('V11'):observed['snapshot_selection']=find(adapter.reporting_checks('saas'),'snapshot_selection')
            elif v.startswith('V12'):observed['full_period_comparison']=adapter.calculations('retail','variance')['analyses'][0]
            elif v.startswith('V13'):observed['balance_time_aggregation']=find(adapter.balance(),'balance_time_aggregation')
            elif v.startswith('V14'):observed['source_line_reconciliation']=find(adapter.source_lines(),'source_line_reconciliation')
            elif v.startswith('V15'):
                report=adapter.calculations('saas')
                observed['required_numeric_component']=find(report['tier1'],'schema')
                observed['ratio_of_sums']=report['analyses'][0]
            for expectation in [e for e in expectations if e['variant_id']==v]:
                with self.subTest(variant=v,rule=expectation['rule_id']):
                    expected,reason=normalized_oracle_status(expectation['status'])
                    self.assertEqual(observed[expectation['rule_id']]['outcome'],expected,observed)
                    if expectation['status']=='skipped':self.assertEqual(observed[expectation['rule_id']]['reason'],'period_incomplete')
                    if v.startswith('V10'):self.assertEqual(observed[expectation['rule_id']]['reason'],'baseline_missing_or_incompatible')

    def test_oracle_unavailable_reasons_remain_distinct(self):
        self.assertEqual(normalized_oracle_status('unverified')[0],'not_evaluated')
        self.assertEqual(normalized_oracle_status('skipped')[0],'not_evaluated')
        self.assertNotEqual(normalized_oracle_status('unverified')[1],normalized_oracle_status('skipped')[1])


if __name__=='__main__':unittest.main()
