"""Real CLI processes against independent synthetic Actual/Plan/calendar CSV files."""
import copy
import csv
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from test_tier1 import bundle,rule
from test_analysis import spec


class CLIVarianceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.base=Path(self.temp.name)
        self.periods=['2026-01-31','2026-02-28','2026-03-31']

    def write_csv(self,name,rows):
        path=self.base/name
        with path.open('w',encoding='utf-8',newline='') as handle:
            writer=csv.DictWriter(handle,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
        return path

    def prepare(self,*,primary_complete=False,calendar_complete='true',missing_plan=False,budget_values=None):
        common={'scenario':'Actual','currency':'USD','unit':'currency','scale':'1','snapshot':'s1','level':'detail'}
        actual=[dict(period=p,**common,amount=str(a)) for p,a in zip(self.periods,[1000,2000,3000])]
        if primary_complete:
            for row in actual:row['complete']='true'
        budgets=budget_values or ['1100','2200','3300']
        plan=[dict(period=p,scenario='Plan',currency='USD',unit='currency',scale='1',snapshot='p1',budget=v) for p,v in zip(self.periods,budgets)]
        if missing_plan:plan=plan[:-1]
        calendar=[dict(period=p,period_state='closed',complete=calendar_complete) for p in self.periods]
        types={field:{'type':'string','nullable':False} for field in actual[0]}
        types['amount']['type']='decimal'
        if primary_complete:types['complete']['type']='boolean'
        config=bundle(rule('types',{'fields':types},id='types'),rule('unique',{'fields':['period']},id='grain'))
        analysis=spec('variance',baseline_measure='budget',expected_periods=self.periods)
        analysis['analyses'][0]['depends_on']=['types','grain'];config['analysis']=analysis
        self.write_csv('actual.csv',actual);self.write_csv('plan.csv',plan);self.write_csv('calendar.csv',calendar)
        return config

    def run_cli(self,config):
        (self.base/'rules.json').write_text(json.dumps(config),encoding='utf-8')
        completed=subprocess.run([sys.executable,'-m','reporting_assurance','--rules',str(self.base/'rules.json'),
            '--csv',str(self.base/'actual.csv'),'--reference','plan='+str(self.base/'plan.csv'),
            '--reference','calendar='+str(self.base/'calendar.csv'),'--include-analysis'],
            cwd=self.base,env=dict(os.environ),capture_output=True,text=True,timeout=20)
        self.assertEqual(completed.returncode,0,completed.stdout+completed.stderr)
        return json.loads(completed.stdout)

    def assert_quarter(self,report):
        result=report['analyses'][0]
        self.assertEqual(result['outcome'],'pass',result)
        self.assertEqual(result['groups'][0]['actual'],'6000')
        self.assertEqual(result['groups'][0]['baseline'],'6600')
        self.assertEqual(result['groups'][0]['delta'],'-600')

    def test_cli_reads_true_calendar_as_boolean(self):
        self.assert_quarter(self.run_cli(self.prepare()))

    def test_cli_reads_separate_baseline_measure_as_decimal(self):
        # Calendar conversion inherited from a primary field isolates the second reviewed defect.
        self.assert_quarter(self.run_cli(self.prepare(primary_complete=True)))

    def test_incomplete_or_invalid_calendar_never_passes_comparison(self):
        for value in ['false','TRUE','\\N']:
            with self.subTest(value=value):
                report=self.run_cli(self.prepare(calendar_complete=value))
                self.assertEqual(report['analyses'][0]['outcome'],'not_evaluated')
                self.assertEqual(report['analyses'][0]['reason'],'period_incomplete')

    def test_missing_plan_remains_unavailable(self):
        report=self.run_cli(self.prepare(missing_plan=True))
        self.assertEqual(report['analyses'][0]['reason'],'baseline_missing_or_incompatible')

    def test_invalid_baseline_numeric_value_is_not_coerced(self):
        report=self.run_cli(self.prepare(budget_values=['1100','bad-number','3300']))
        self.assertEqual(report['analyses'][0]['outcome'],'not_evaluated')
        self.assertEqual(report['analyses'][0]['reason'],'numeric_or_semantic_evidence_missing')


    def test_explicit_reference_schemas_are_consumed_by_real_cli(self):
        config=self.prepare()
        config['reference_types']={'plan':{'budget':'decimal','period':'string'},'calendar':{'complete':'boolean','period_state':'string','period':'string'}}
        self.assert_quarter(self.run_cli(config))

    def test_reference_type_edits_change_approval_digest(self):
        from reporting_assurance import bundle_digest,validate_bundle,ConfigError
        config=self.prepare()
        config['reference_types']={'calendar':{'period':'string'}}
        before=bundle_digest(config)
        config['reference_types']['calendar']['period']='date'
        self.assertNotEqual(bundle_digest(config),before)
        config['reference_types']['calendar']['complete']='string'
        with self.assertRaisesRegex(ConfigError,'conflicting_reference_types'):validate_bundle(config)

    def test_invalid_reference_schema_is_rejected(self):
        from reporting_assurance import validate_bundle,ConfigError
        for mapping in [[],{'plan':{}},{'plan':{'budget':'float'}},{'plan':{'budget':[]}}]:
            config=self.prepare();config['reference_types']=mapping
            with self.assertRaises(ConfigError):validate_bundle(config)

    def test_studio_uses_same_reference_native_types(self):
        from unittest.mock import patch
        from decimal import Decimal
        from reporting_assurance.studio import process
        config=self.prepare()
        payload={'operation':'preview','rules':json.dumps(config),'csv':(self.base/'actual.csv').read_text(),
                 'references':{'plan':(self.base/'plan.csv').read_text(),'calendar':(self.base/'calendar.csv').read_text()}}
        with patch('reporting_assurance.studio.evaluate',return_value={}) as evaluator:process(payload)
        references=evaluator.call_args.kwargs['references']
        self.assertIs(references['calendar'][0]['complete'],True)
        self.assertIsInstance(references['plan'][0]['budget'],Decimal)



if __name__=='__main__':unittest.main()
