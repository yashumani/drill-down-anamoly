"""End-to-end fictional Python workflow, plus an OFFLINE MOCK adapter demonstration.

No credentials, provider SDK or external model calls. The demo adapter selects
existing facts; this does not verify a live model or free-form reasoning.
"""
import json
from pathlib import Path
from reporting_assurance import explain, load_bundle, read_csv

base = Path(__file__).resolve().parent
config = load_bundle((base / 'rules.json').read_text(encoding='utf-8'))
types = {field: spec['type'] for field, spec in config['rules'][1]['params']['fields'].items()}
rows = read_csv(base / 'reporting.csv', types=types)
controls = read_csv(base / 'controls.csv', types={field: kind for field, kind in types.items()
    if field not in ('id', 'level', 'loaded_at')})
options = dict(references={'controls': controls}, evaluation_time='2026-04-05T12:00:00Z',
    mode='production', trusted_digests=[(base / 'trusted-digest.txt').read_text().strip()],
    include_analysis=True)
local = explain(rows, config, **options)

class OfflineDemoAdapter:
    def select_evidence(self, packet):
        return dict(selection_version='1.0', evidence_digest=packet['evidence_digest'],
                    fact_ids=packet['mandatory_fact_ids'])

mock = explain(rows, config, adapter=OfflineDemoAdapter(), allow_adapter=True, **options)
assert local['deterministic']['tier1']['gate'] == 'pass'
assert local['deterministic'] == mock['deterministic']
assert mock['interpretation']['model_verification'] == 'not_verified'
assert mock['interpretation']['reason'] == 'adapter_selection_validated'
# This offline plan can be saved by the caller and replayed with --interpretation-plan.
selection = dict(selection_version='1.0', evidence_digest=local['evidence']['evidence_digest'],
                 fact_ids=local['evidence']['mandatory_fact_ids'])
print(json.dumps({'local': local, 'offline_mock': mock, 'selection': selection}, sort_keys=True))
