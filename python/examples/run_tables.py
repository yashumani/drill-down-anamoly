"""Fictional in-memory table input -> scalar record-table outputs; no framework."""
import json
from pathlib import Path
from reporting_assurance import analyze, load_bundle, normalize_records, report_to_record_tables

def run():
    config = load_bundle(Path(__file__).with_name('rules.json').read_text(encoding='utf-8'))
    common = dict(period='2026-03-31', scenario='Actual', currency='USD', unit='currency',
                  scale='1', snapshot='s1', level='detail', loaded_at='2026-04-04T12:00:00Z')
    source = [dict(common, id='001', amount='40.00'), dict(common, id='002', amount='60.00')]
    rows = normalize_records(source, types={'id': 'string', 'amount': 'decimal',
                                         'period': 'date', 'loaded_at': 'datetime'})
    # This control is fictional. A real caller establishes its independence.
    controls = normalize_records([dict(period='2026-03-31', scenario='Actual', currency='USD',
        unit='currency', scale='1', snapshot='s1', amount='100.00')], types={'amount': 'decimal'})
    verified = analyze(rows, config, references={'controls': controls},
                       evaluation_time='2026-04-05T12:00:00Z')
    tables = report_to_record_tables(verified, report_id='fictional-run-001')
    assert tables['summary'][0]['gate'] == 'non_gating'
    assert tables['summary'][0]['pass_count'] == 10
    assert tables['analysis_groups'][0]['total'] == '100.00'
    return tables

if __name__ == '__main__':
    print(json.dumps(run(), sort_keys=True, allow_nan=False))
