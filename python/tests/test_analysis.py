import copy
import json
from decimal import Decimal
import unittest
from reporting_assurance import ConfigError, evaluate, bundle_digest
from reporting_assurance.analysis import analyze
from reporting_assurance.suggestions import suggest_rules
from test_tier1 import bundle, rule, approve, record, SEM


def spec(op='ratio_of_sums',**kw):
    p=dict(measure_kind='balance' if op=='period_end' else 'flow',group_by=[],semantic_fields=SEM,
           row_level={'field':'level','value':'detail'},expected_periods=['2026-03-31'])
    if op=='ratio_of_sums':p.update(numerator={'field':'revenue','subtract_field':'cost'},denominator='revenue')
    elif op=='variance':p.update(measure='amount',baseline_measure='amount',reference='plan',actual_scenario='Actual',baseline_scenario='Plan',actual_snapshot='s1',baseline_snapshot='p1',calendar_reference='calendar')
    elif op=='period_end':p.update(measure='amount',period_field='period')
    else:p['measure']='amount'
    p.update(kw)
    return {'analysis_version':'1.0','analyses':[{'id':op,'operator':op,'params':p,'depends_on':['structure']}]}


def config():return bundle(rule('required_fields',{'fields':['amount']},id='structure'))


class BoundedAnalysisTests(unittest.TestCase):
    def test_correct_weighted_margin(self):
        rows=[record('100',revenue=100,cost=80),record('900',revenue=900,cost=450)]
        report=analyze(rows,config(),spec())
        result=report['analyses'][0]
        self.assertEqual(result['outcome'],'pass')
        self.assertEqual(Decimal(result['groups'][0]['ratio']),Decimal('0.47'))
        # Independently: (20/100 + 450/900)/2 = 0.35, which is not the combined margin.
        self.assertEqual((Decimal(20)/100+Decimal(450)/900)/2,Decimal('0.35'))

    def test_caller_decimal_context_cannot_change_calculation(self):
        from decimal import localcontext, ROUND_DOWN
        rows=[record('1e100',revenue=Decimal('1e100'),cost=Decimal('0.33'))]
        expected=analyze(rows,config(),spec())
        with localcontext() as context:
            context.prec=3;context.rounding=ROUND_DOWN;context.Emax=5;context.Emin=-5
            self.assertEqual(analyze(rows,config(),spec()),expected)

    def test_analysis_output_group_bound(self):
        rows=[record('1',group='fictional-%04d' % i) for i in range(1001)]
        report=analyze(rows,config(),spec('summary',group_by=['group']))
        self.assertEqual(report['analyses'][0]['reason'],'analysis_group_limit')
        self.assertEqual(report['analyses'][0]['groups'],[])

    def test_reported_ratio_mismatch(self):
        rows=[record('1000',revenue=1000,cost=530,margin=Decimal('0.35'))]
        report=analyze(rows,config(),spec(reported_field='margin',tolerance='0.000001'))
        self.assertEqual(report['analyses'][0]['outcome'],'fail')

    def test_zero_missing_negative_denominator_are_unavailable(self):
        for value,reason in [(0,'zero_denominator'),(None,'numeric_or_semantic_evidence_missing'),(-1,'negative_denominator_requires_domain_policy')]:
            report=analyze([record('1',revenue=value,cost=0)],config(),spec())
            self.assertEqual(report['analyses'][0]['outcome'],'not_evaluated')
            self.assertEqual(report['analyses'][0]['reason'],reason)
            self.assertEqual(report['analyses'][0]['groups'],[])

    def test_missing_plan_and_incomplete_period_skip_comparison(self):
        rows=[record('100')];base=record('110',scenario='Plan',snapshot='p1')
        calendar={'period':'2026-03-31','complete':True,'period_state':'closed'}
        report=analyze(rows,config(),spec('variance'))
        self.assertEqual(report['analyses'][0]['reason'],'baseline_missing')
        refs={'plan':[base],'calendar':[dict(calendar,complete=False)]}
        report=analyze(rows,config(),spec('variance'),references=refs)
        self.assertEqual(report['analyses'][0]['reason'],'period_incomplete')
        refs['calendar']=[calendar]
        report=analyze(rows,config(),spec('variance'),references=refs)
        self.assertEqual(Decimal(report['analyses'][0]['groups'][0]['delta']),Decimal('-10'))

    def test_zero_baseline_preserves_absolute_variance(self):
        refs={'plan':[record('0',scenario='Plan',snapshot='p1')],'calendar':[{'period':'2026-03-31','complete':True,'period_state':'closed'}]}
        result=analyze([record('10')],config(),spec('variance'),references=refs)['analyses'][0]
        self.assertEqual(result['outcome'],'pass')
        self.assertEqual(result['groups'][0]['delta'],'10')
        self.assertIsNone(result['groups'][0]['relative_delta'])
        self.assertEqual(result['groups'][0]['relative_outcome'],'not_evaluated')

    def test_drilldown_group_deltas_sum_to_total(self):
        rows=[record('40',region='secret-A'),record('60',region='secret-B')]
        plan=[record('45',region='secret-A',scenario='Plan',snapshot='p1'),record('65',region='secret-B',scenario='Plan',snapshot='p1')]
        refs={'plan':plan,'calendar':[{'period':'2026-03-31','complete':True,'period_state':'closed'}]}
        result=analyze(rows,config(),spec('variance',group_by=['region']),references=refs)
        self.assertEqual(sum(Decimal(g['delta']) for g in result['analyses'][0]['groups']),Decimal('-10'))
        self.assertNotIn('secret-',json.dumps(result))

    def test_only_analysis_with_invalid_prerequisite_skips(self):
        c=config();c['rules'].append(rule('allowed_values',{'field':'currency','values':['EUR']},id='other'))
        s=spec('summary');second=copy.deepcopy(s['analyses'][0]);second['id']='dependent';second['depends_on']=['other'];s['analyses'].append(second)
        result=analyze([record('10')],c,s)
        self.assertEqual([a['outcome'] for a in result['analyses']],['pass','not_evaluated'])

    def test_summary_known_population_statistics(self):
        result=analyze([record('1'),record('3')],config(),spec('summary'))['analyses'][0]['groups'][0]
        self.assertEqual(tuple(Decimal(result[k]) for k in ['total','mean','minimum','maximum','population_stddev']),tuple(map(Decimal,['4','2','1','3','1'])))

    def test_period_end_and_ambiguous_endpoint(self):
        rows=[record('100',period='2026-01-31'),record('120',period='2026-02-28'),record('140')]
        s=spec('period_end',expected_periods=['2026-01-31','2026-02-28','2026-03-31'])
        result=analyze(rows,config(),s)['analyses'][0]
        self.assertEqual(result['groups'][0]['value'],'140')
        self.assertEqual(analyze(rows+[rows[-1]],config(),s)['analyses'][0]['reason'],'ambiguous_period_endpoint')

    def test_production_analysis_is_bound_to_approved_bundle(self):
        c=config();s=spec('summary');rows=[record('10')]
        c,digest=approve(c)
        result=analyze(rows,c,s,mode='production',trusted_digests=[digest])
        self.assertEqual(result['analyses'][0]['reason'],'analysis_spec_not_approved')
        c.pop('approval');c['analysis']=s;c,digest=approve(c)
        result=analyze(rows,c,mode='production',trusted_digests=[digest])
        self.assertEqual(result['analyses'][0]['outcome'],'pass')
        c['analysis']['analyses'][0]['params']['expected_periods']=['2026-04-30']
        result=analyze(rows,c,mode='production',trusted_digests=[digest])
        self.assertEqual(result['tier1']['gate'],'blocked')

    def test_analysis_contract_rejects_unsafe_operators_and_unknown_params(self):
        for mutate in ['operator','params','depends']:
            s=spec()
            if mutate=='operator':s['analyses'][0]['operator']='eval'
            elif mutate=='params':s['analyses'][0]['params']['expression']='__import__("os")'
            else:s['analyses'][0]['depends_on']=[]
            with self.assertRaises(ConfigError):analyze([record('1')],config(),s)

    def test_draft_suggestions_do_not_infer_business_limits(self):
        rows=[{'id':'001','amount':10,'currency':'USD'},{'id':'002','amount':20,'currency':'USD'}]
        suggestions=suggest_rules(rows)
        c=suggestions['bundle']
        self.assertEqual(c['provenance']['kind'],'draft_proposal')
        self.assertNotIn('approval',c)
        self.assertTrue(all(not r['blocking'] and not r['required'] for r in c['rules']))
        self.assertEqual({r['operator'] for r in c['rules']},{'required_fields','types'})
        self.assertNotIn('USD',json.dumps(suggestions))
        self.assertEqual(evaluate(rows,c,mode='production')['gate'],'blocked')
        self.assertIsNone(suggest_rules([])['bundle'])


if __name__=='__main__':unittest.main()
