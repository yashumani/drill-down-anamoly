"""ILLUSTRATIVE / NOT TESTED IN KNIME. Python Script node, two inputs, one output.

Install the wheel in the node's selected Python environment. Input 0 is the
reporting table; input 1 is the independent control table. Provide rule_path,
evaluation_time and trusted_digest flow variables from a trusted workflow owner.
The upstream workflow must preserve decimal strings and identifier strings.
This intentionally uses an explicit small schema, not implicit pandas coercion.
"""
from decimal import Decimal
from pathlib import Path
import pandas as pd
import knime.scripting.io as knio
from reporting_assurance import load_bundle, evaluate

config = load_bundle(Path(knio.flow_variables['rule_path']).read_text(encoding='utf-8'))
rows = knio.input_tables[0].to_pandas().to_dict(orient='records')
controls = knio.input_tables[1].to_pandas().to_dict(orient='records')

def convert(records):
    output = []
    for original in records:
        # Adapt this schema deliberately for your workflow. Missing is None; 0 is preserved.
        row = {key: None if pd.isna(value) else value for key, value in original.items()}
        if row.get('amount') is not None:
            if not isinstance(row['amount'], str):
                raise ValueError('Supply amount as an exact decimal string upstream')
            row['amount'] = Decimal(row['amount'])
        output.append(row)
    return output

report = evaluate(convert(rows), config, references={'controls': convert(controls)},
                  evaluation_time=knio.flow_variables['evaluation_time'], mode='production',
                  trusted_digests=[knio.flow_variables['trusted_digest']])
knio.output_tables[0] = knio.Table.from_pandas(pd.DataFrame(report['results']))
# The workflow owner must route gate pass/fail/blocked explicitly; do not infer it from severity.
knio.flow_variables['reporting_assurance_gate'] = report['gate']
