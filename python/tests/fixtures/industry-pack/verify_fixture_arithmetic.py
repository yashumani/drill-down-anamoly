"""Offline test-data arithmetic audit only. Not the reporting-assurance engine."""
import csv,json,calendar,hashlib
from pathlib import Path
from decimal import Decimal as D
from datetime import date,datetime
P=Path(__file__).resolve().parent
checks=[]
def read(path):
 with (P/path).open(newline='') as f:return list(csv.DictReader(f))
def check(name,condition,detail=''):
 checks.append({'check':name,'passed':bool(condition),'detail':detail})
 if not condition: raise AssertionError(name+': '+detail)
def ratio(r,d):
 num=D(r['net_sales'])-D(r['cost_of_sales']) if d=='retail' else D(r[{'telecom':'disconnects','manufacturing':'good_units','saas':'recognized_revenue'}[d]])
 den=D(r[{'retail':'net_sales','telecom':'line_months','manufacturing':'units_started','saas':'paid_seat_months'}[d]])
 return num/den
spec={
 'telecom':('service_region',['service_revenue','line_months','disconnects'],'disconnect_rate',[1000,10,1]),
 'retail':('store_region',['net_sales','cost_of_sales','units_sold'],'gross_margin_rate',[1000,530,11]),
 'manufacturing':('plant',['production_cost','units_started','good_units'],'first_pass_yield',[1000,1000,900]),
 'saas':('customer_segment',['recognized_revenue','paid_seat_months','support_tickets'],'revenue_per_seat_month',[1000,10,8])}
now=datetime.fromisoformat('2026-04-05T12:00:00+00:00')
for domain,(g,measures,rate,totals) in spec.items():
 prefix=f'clean/{domain}/'; detail=read(prefix+'transaction_detail.csv'); groups=read(prefix+'grouped_data.csv'); reports=read(prefix+'reporting_aggregates.csv');controls=read(prefix+'company_controls.csv')
 check(domain+'_counts',len(detail)==12 and len(groups)==6 and len(reports)==9)
 check(domain+'_transaction_keys',len({(x['transaction_id'],x['snapshot_id']) for x in detail})==12)
 for i,r in enumerate(detail):
  check(f'{domain}_date_{i}',date.fromisoformat(r['event_date']).strftime('%Y-%m')==r['period_id'])
 for level,rows in [('detail',detail),('groups',groups),('reports',reports)]:
  for i,r in enumerate(rows):
   check(f'{domain}_{level}_context_{i}',r['currency']=='USD' and r['amount_scale']=='1' and r['scenario']=='Actual' and r['snapshot_id']=='s1')
   age=(now-datetime.fromisoformat(r['loaded_at'].replace('Z','+00:00'))).total_seconds()/3600
   check(f'{domain}_{level}_freshness_{i}',0<=age<=48)
 for r in groups:
  children=[x for x in detail if x['period_id']==r['period_id'] and x[g]==r[g]]
  for k in measures:check(f'{domain}_detail_group_{r["period_id"]}_{r[g]}_{k}',sum(D(x[k]) for x in children)==D(r[k]))
  check(f'{domain}_group_ratio_{r["period_id"]}_{r[g]}',abs(D(r[rate])-ratio(r,domain))<=D('0.000001'))
 for m in range(1,4):
  period=f'2026-{m:02}';parent=[x for x in reports if x['period_id']==period and x['row_level']=='company'];children=[x for x in reports if x['period_id']==period and x['row_level']=='group']
  check(f'{domain}_report_coverage_{period}',len(parent)==1 and len(children)==2 and {x[g] for x in children}=={x[g] for x in groups if x['period_id']==period})
  parent=parent[0]
  for k,t in zip(measures,totals):
   expected=D(t)*(m if k==measures[0] or (domain=='retail' and k=='cost_of_sales') else 1)
   check(f'{domain}_independent_hand_total_{period}_{k}',sum(D(x[k]) for x in detail if x['period_id']==period)==expected)
   check(f'{domain}_parent_child_{period}_{k}',D(parent[k])==sum(D(x[k]) for x in children)==expected)
   control=[x for x in controls if x['period_id']==period and x['metric']==k]
   check(f'{domain}_control_{period}_{k}',len(control)==1 and D(control[0]['expected_value'])==expected)
   for child in children:
    gr=next(x for x in groups if x['period_id']==period and x[g]==child[g]);check(f'{domain}_group_report_{period}_{child[g]}_{k}',D(gr[k])==D(child[k]))
  check(f'{domain}_report_ratio_{period}',abs(D(parent[rate])-ratio(parent,domain))<=D('0.000001'))
  baseline=[x for x in read(prefix+'plan_baseline.csv') if x['period_id']==period]
  check(f'{domain}_baseline_{period}',len(baseline)==1 and D(baseline[0]['value'])==1100*m and baseline[0]['snapshot_id']=='p1')
 for r in read(prefix+'source_line_controls.csv'):
  actual=next(x for x in detail if x['transaction_id']==r['transaction_id']);check(domain+'_line_control_'+r['transaction_id'],D(actual[r['metric']])==D(r['expected_value']))
# Pin exact counterexamples independently of future validation code.
def v(id):
 record=next(x for x in json.loads((P/'variant_manifest.json').read_text()) if x['variant_id'].startswith(id+'_'));return read(record['replacement_source'])
check('V01_double_count',D(v('V01')[2]['service_revenue'])==2000 and D(v('V01')[0]['service_revenue'])+D(v('V01')[1]['service_revenue'])==1000)
r=v('V02');check('V02_offset_duplicate',r[0]['service_region']==r[1]['service_region']=='north' and D(r[0]['service_revenue'])+D(r[1]['service_revenue'])==1000)
r=v('V03')[2];check('V03_ratio',D(r['gross_margin_rate'])==D('.35') and ratio(r,'retail')==D('.47'))
check('V04_currency',v('V04')[1]['currency']=='EUR')
check('V05_scale',v('V05')[2]['amount_scale']=='1000')
check('V06_coverage',len([x for x in v('V06') if x['period_id']=='2026-03' and x['row_level']=='group'])==1)
try:date.fromisoformat(v('V07')[4]['event_date']);bad_date=False
except ValueError:bad_date=True
check('V07_date',bad_date)
check('V08_stale',(now-datetime.fromisoformat(v('V08')[0]['loaded_at'].replace('Z','+00:00'))).total_seconds()==96*3600)
check('V09_future',datetime.fromisoformat(v('V09')[0]['loaded_at'].replace('Z','+00:00'))>now)
check('V10_baseline',not any(x['period_id']=='2026-03' for x in v('V10')))
check('V11_snapshot',{x['snapshot_id'] for x in v('V11')}=={'s1','s2'} and D(v('V11')[-1]['revenue_per_seat_month'])==D('110'))
check('V12_open',v('V12')[2]['complete']=='false')
check('V13_balance',D(v('V13')[0]['arr'])==360 and D(read('clean/saas/quarter_end_balance.csv')[0]['arr'])==140 and D(read('clean/saas/period_end_balances.csv')[-1]['arr'])==140)
r=v('V14');check('V14_offset',D(r[0]['service_revenue'])==65 and D(r[1]['service_revenue'])==35 and sum(D(x['service_revenue']) for x in r if x['period_id']=='2026-01')==1000)
check('V15_missing_weight',v('V15')[2]['paid_seat_months']=='')
# Each variant replaces one whole table; other baseline files are untouched.
manifest=json.loads((P/'variant_manifest.json').read_text())
for x in manifest:
 check(x['variant_id']+'_replacement_header',list(read(x['replacement_source'])[0])==list(read(x['replaces'])[0]))
receipt={'audit':'standard_library_fixture_arithmetic_not_product_engine','run_clock':'2026-04-05T12:00:00Z','passed':True,'check_count':len(checks),'checks':checks,'limitations':'Toy-fixture consistency only. Not a run of reporting-assurance; expected statuses are authored scenarios, not implemented rule-engine output.'}
(P/'validation_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(f'PASS: {len(checks)} fixture arithmetic and integrity assertions; validation_receipt.json written')
