"""Independent development-only JSON Schema validation; never needed at runtime."""
import json
from pathlib import Path
import sys
from jsonschema import Draft202012Validator

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'python/src'))
from reporting_assurance import load_bundle,evaluate,read_csv,analyze,explain
schemas=root/'python/src/reporting_assurance/schemas'
bundle_schema=json.loads((schemas/'rule-bundle-v1.json').read_text())
report_schema=json.loads((schemas/'report-v1.json').read_text())
analysis_schema=json.loads((schemas/'analysis-report-v1.json').read_text())
explanation_schema=json.loads((schemas/'explanation-report-v1.json').read_text())
selection_schema=json.loads((schemas/'interpretation-selection-v1.json').read_text())
for schema in [bundle_schema,report_schema,analysis_schema,explanation_schema,selection_schema]: Draft202012Validator.check_schema(schema)
config=load_bundle((root/'python/examples/rules.json').read_text())
Draft202012Validator(bundle_schema).validate(config)
rows=read_csv(root/'python/examples/reporting.csv',types={'amount':'decimal','period':'date','loaded_at':'datetime'})
report=evaluate(rows,config,evaluation_time='2026-04-05T12:00:00Z',diagnostic_limit=5)
Draft202012Validator(report_schema).validate(report)
analysis=analyze(rows,config,evaluation_time='2026-04-05T12:00:00Z')
Draft202012Validator(analysis_schema).validate(analysis)
explanation=explain(rows,config,evaluation_time='2026-04-05T12:00:00Z',include_analysis=True)
Draft202012Validator(explanation_schema).validate(explanation)
for additional in [explain(rows,config,selection={}),explain(rows,config,adapter=object()),
                   explain(rows,config,include_analysis=True,include_numeric_evidence=True)]:
    Draft202012Validator(explanation_schema).validate(additional)
selection=dict(selection_version='1.0',evidence_digest=explanation['evidence']['evidence_digest'],fact_ids=explanation['evidence']['mandatory_fact_ids'])
Draft202012Validator(selection_schema).validate(selection)
print('Independent JSON Schema validation: bundle + Tier 1 + Tier 2 + explanation + selection pass')
