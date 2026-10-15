"""Synthetic Tier 2 API and deterministic draft suggestions; no model or UI."""
import json
from pathlib import Path
from reporting_assurance import analyze, load_bundle, read_csv, suggest_rules

base=Path(__file__).resolve().parent
config=load_bundle((base/'rules.json').read_text(encoding='utf-8'))
types={f:s['type'] for f,s in config['rules'][1]['params']['fields'].items()}
rows=read_csv(base/'reporting.csv',types=types)
spec=config['analysis']
controls=read_csv(base/'controls.csv',types={f:t for f,t in types.items() if f not in ('id','level','loaded_at')})
report=analyze(rows,config,spec,references={'controls':controls},evaluation_time='2026-04-05T12:00:00Z')
assert report['analyses'][0]['groups'][0]['total']=='100'
assert report['tier1']['gate']=='non_gating'
print(json.dumps(report,sort_keys=True))
draft=suggest_rules(rows)
assert draft['bundle']['provenance']['kind']=='draft_proposal'
print(json.dumps(draft,sort_keys=True))
