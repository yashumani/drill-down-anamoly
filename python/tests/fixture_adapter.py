"""Explicit adapter from the independently authored synthetic oracle to v1 rules.

This is test code, not an additional executor. Rule evaluation and calculations
always use the installed reporting_assurance package. Replacements never append.
All constants below come from the fixture's declared catalog/context, not inferred
business boundaries. Synthetic controls have only their stated scope.
"""
import json
from decimal import Decimal
from pathlib import Path
from reporting_assurance import evaluate, load_bundle, read_csv
from reporting_assurance.analysis import analyze

PACK=Path(__file__).resolve().parent/'fixtures/industry-pack'
SEM=dict(period='period_id',scenario='scenario',currency='currency',unit='declared_unit',scale='amount_scale',snapshot='snapshot_id')


def rule(id,op,p,deps=()):return dict(id=id,operator=op,params=p,severity='critical',required=True,blocking=True,depends_on=list(deps))


def contract(*rules):
    raw=dict(schema_version='1.0',revision='fixture-adapter-v1',provenance=dict(author='synthetic_fixture_owner',source='independent synthetic pack; test-only declared rules',kind='draft_proposal'),rules=list(rules))
    return load_bundle(json.dumps(raw))


def check(rows,*rules,refs=None):return evaluate(rows,contract(*rules),references=refs,evaluation_time='2026-04-05T12:00:00Z')


def find(report,id):return next(item for item in report['results'] if item['id']==id)


class FixtureAdapter:
    def __init__(self,variant=None):
        self.catalog=json.loads((PACK/'domain_catalog.json').read_text())
        self.schemas={x['table']:x for x in json.loads((PACK/'table_schema_catalog.json').read_text())}
        self.context=json.loads((PACK/'run_context.json').read_text())
        self.replacement=next((v for v in json.loads((PACK/'variant_manifest.json').read_text()) if v['variant_id']==variant),None)
        if variant is not None and self.replacement is None:raise ValueError('unknown test variant')

    def load(self,path):
        source=path
        if self.replacement and self.replacement['replaces']==path:source=self.replacement['replacement_source']
        schema=self.schemas.get(path,{}).get('columns',{})
        types={f:('datetime' if s['type']=='timestamp_utc' else s['type']) for f,s in schema.items()}
        # Calendar is an explicitly typed reference, not a metric table.
        if path=='references/calendar.csv':types={'start_date':'date','end_date':'date','complete':'boolean'}
        return read_csv(PACK/source,types=types,null_token='')

    def normalized(self,rows,level='group'):
        return [dict(row,declared_unit='USD',declared_level=row.get('row_level',level)) for row in rows]

    def base_rules(self,path):
        schema=self.schemas[path]
        specs={f:dict(s,type='datetime' if s['type']=='timestamp_utc' else s['type']) for f,s in schema['columns'].items()}
        return [rule('fields','required_fields',{'fields':list(specs)}),rule('schema','types',{'fields':specs}),rule('composite_grain','unique',{'fields':schema['grain']})]

    def basic(self,domain,table):
        path=f'clean/{domain}/{table}.csv';rows=self.load(path)
        return check(rows,*self.base_rules(path))

    def coverage(self,domain,table='grouped_data'):
        path=f'clean/{domain}/{table}.csv';group=self.catalog[domain]['group']
        rows=self.load(path)
        if table=='reporting_aggregates':rows=[r for r in rows if r['row_level']=='group']
        fields=['period_id','scenario','snapshot_id',group]
        return check(rows,rule('expected_group_coverage','coverage',{'fields':fields,'reference':'roster'}),refs={'roster':self.load(f'clean/{domain}/coverage_roster.csv')})

    def reporting_checks(self,domain):
        path=f'clean/{domain}/reporting_aggregates.csv';rows=self.load(path);group=self.catalog[domain]['group']
        checks=self.base_rules(path)
        for id,field,values in [('currency_contract','currency',['USD']),('amount_scale_contract','amount_scale',['1']),('snapshot_selection','snapshot_id',['s1']),('scenario_selection','scenario',['Actual'])]:
            checks.append(rule(id,'allowed_values',dict(field=field,values=values)))
        expected=[[period,g,'group'] for period in self.context['periods'] for g in self.catalog[domain]['groups']]
        expected += [[period,'ALL','company'] for period in self.context['periods']]
        checks.append(rule('partition_freshness','freshness',dict(field='loaded_at',partition_by=['period_id',group,'row_level'],expected_partitions=expected,max_age_seconds=172800)))
        return check(rows,*checks)

    def reconciliation(self,domain,kind='independent_company_control',table='reporting_aggregates',with_currency_dependency=False):
        raw=self.load(f'clean/{domain}/{table}.csv');rows=self.normalized(raw)
        measure=self.catalog[domain]['measures'][0]
        if kind=='independent_company_control':
            controls=[dict(c,declared_unit='USD') for c in self.load(f'clean/{domain}/company_controls.csv') if c['metric']==measure]
            control_measure='expected_value';level='company';scope='independent'
        else:
            controls=[dict(c,declared_unit='USD') for c in self.load(f'clean/{domain}/reporting_aggregates.csv') if c['row_level']=='company']
            control_measure=measure;level='group';scope='internal'
        p=dict(measure=measure,control_measure=control_measure,reference='controls',group_by=[],semantic_fields=SEM,aggregation='sum',measure_kind='flow',control_scope=scope,row_level=dict(field='declared_level',value=level))
        rules=[]
        if with_currency_dependency:rules.append(rule('currency_contract','allowed_values',dict(field='currency',values=['USD'])))
        rules.append(rule(kind,'reconcile',p,['currency_contract'] if with_currency_dependency else []))
        return check(rows,*rules,refs={'controls':controls})

    def calculations(self,domain,operator='ratio_of_sums',quarter=False):
        path=f'clean/{domain}/reporting_aggregates.csv';rows=self.normalized(self.load(path));d=self.catalog[domain]
        p=dict(measure_kind='flow',group_by=[] if quarter or operator!='ratio_of_sums' else ['period_id'],semantic_fields=SEM,row_level=dict(field='declared_level',value='group' if quarter else 'company'),expected_periods=self.context['periods'])
        refs={}
        if operator=='ratio_of_sums':
            p['numerator']={'field':d['num']} if domain!='retail' else {'field':'net_sales','subtract_field':'cost_of_sales'}
            p['denominator']=d['den']
            if not quarter:p.update(reported_field=d['ratio'],tolerance='0.000001')
        elif operator=='variance':
            p.update(measure=d['measures'][0],baseline_measure='value',reference='plan',actual_scenario='Actual',baseline_scenario='Plan',actual_snapshot='s1',baseline_snapshot='p1',calendar_reference='calendar')
            refs['plan']=self.normalized(self.load(f'clean/{domain}/plan_baseline.csv'),level='company')
            refs['calendar']=self.load('references/calendar.csv')
        else:p['measure']=d['measures'][0]
        spec={'analysis_version':'1.0','analyses':[{'id':operator,'operator':operator,'params':p,'depends_on':['schema']}]}
        return analyze(rows,contract(*self.base_rules(path)),spec,references=refs,evaluation_time=self.context['run_at'])

    def balance(self):
        rows=self.normalized(self.load('clean/saas/period_end_balances.csv'),level='balance')
        controls=self.normalized(self.load('clean/saas/quarter_end_balance.csv'),level='balance')
        calendar={r['period_id']:r['end_date'] for r in self.load('references/calendar.csv')}
        controls=[dict(c,as_of_date=calendar[c['selected_month']]) for c in controls]
        sem=dict(SEM,period='as_of_date')
        p=dict(measure='arr',control_measure='arr',reference='quarter',group_by=[],semantic_fields=sem,aggregation='period_end',measure_kind='balance',control_scope='independent',row_level=dict(field='declared_level',value='balance'),period_field='as_of_date')
        return check(rows,rule('balance_time_aggregation','reconcile',p),refs={'quarter':controls})

    def source_lines(self):
        rows=self.normalized([r for r in self.load('clean/telecom/transaction_detail.csv') if r['period_id']=='2026-01'],level='detail')
        # The independent synthetic source ledger explicitly covers January s1 Actual only (README).
        controls=[dict(c,expected_value=Decimal(c['expected_value']),period_id='2026-01',scenario='Actual',snapshot_id='s1',declared_unit='USD') for c in self.load('clean/telecom/source_line_controls.csv')]
        p=dict(measure='service_revenue',control_measure='expected_value',reference='lines',group_by=['transaction_id'],semantic_fields=SEM,aggregation='sum',measure_kind='flow',control_scope='independent',row_level=dict(field='declared_level',value='detail'))
        return check(rows,rule('source_line_reconciliation','reconcile',p),refs={'lines':controls})


def normalized_oracle_status(status):
    # Both explanatory states remain unavailable, with distinct provenance reason codes.
    return {'pass':('pass','oracle_pass'),'fail':('fail','oracle_fail'),'unverified':('not_evaluated','oracle_evidence_unverified'),'skipped':('not_evaluated','oracle_prerequisite_skipped')}[status]
