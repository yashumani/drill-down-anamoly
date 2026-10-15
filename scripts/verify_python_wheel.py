"""Build first, then prove the wheel in a clean environment without dependencies."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import tarfile
import venv
import zipfile

root = Path(__file__).resolve().parents[1]
wheel = next((root / 'python/dist').glob('*.whl'))
with zipfile.ZipFile(wheel) as archive:
    names = archive.namelist()
    assert 'reporting_assurance/schemas/rule-bundle-v1.json' in names
    assert 'reporting_assurance/schemas/report-v1.json' in names
    assert 'reporting_assurance/studio.html' in names
    assert 'reporting_assurance/schemas/record-tables-v1.json' in names
    assert 'reporting_assurance/schemas/explanation-report-v1.json' in names
    assert 'reporting_assurance/schemas/interpretation-selection-v1.json' in names
    assert not any('/tests/' in n or 'node_modules' in n for n in names)
with tarfile.open(next((root / 'python/dist').glob('*.tar.gz')), 'r:gz') as archive:
    source_names = archive.getnames()
    assert any(name.endswith('/docs/record-tables-v1.md') for name in source_names)
    assert any(name.endswith('/python/examples/run_tables.py') for name in source_names)
env = dict(os.environ)
env.pop('PYTHONPATH', None)
with tempfile.TemporaryDirectory(prefix='reporting-assurance-wheel-') as directory:
    base = Path(directory)
    venv.create(base / 'venv', with_pip=True)
    binary = base / 'venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    def run(*args):
        return subprocess.run([str(binary), *map(str, args)], cwd=base, env=env, check=True, text=True, capture_output=True)
    run('-m', 'pip', 'install', '--no-index', '--no-deps', wheel)
    metadata = json.loads(run('-I', '-c', "import importlib.metadata as m,json; import reporting_assurance; print(json.dumps({'requires': m.requires('multi-tier-reporting-assurance'), 'version': reporting_assurance.__version__, 'path': reporting_assurance.__file__}))").stdout)
    assert metadata['requires'] in (None, [])
    assert str(root / 'python/src') not in metadata['path']
    tests = run('-I', '-m', 'unittest', 'discover', '-s', root / 'python/tests', '-q')
    print(tests.stderr.strip())
    api = json.loads(run('-I', root / 'python/examples/run_api.py').stdout)
    args = ['--rules', root / 'python/examples/rules.json', '--csv', root / 'python/examples/reporting.csv',
            '--reference', 'controls=' + str(root / 'python/examples/controls.csv'), '--evaluation-time', '2026-04-05T12:00:00Z',
            '--mode', 'production', '--trusted-digest', (root / 'python/examples/trusted-digest.txt').read_text().strip()]
    cli = json.loads(run('-I', '-m', 'reporting_assurance', *args).stdout)
    assert api == cli and cli['gate'] == 'pass'
    entry = base / 'venv' / ('Scripts/reporting-assurance.exe' if os.name == 'nt' else 'bin/reporting-assurance')
    entry_result = subprocess.run([str(entry), *map(str,args)], cwd=base, env=env, check=True, capture_output=True, text=True)
    assert json.loads(entry_result.stdout) == api
    nested=json.loads(run('-I','-m','reporting_assurance',*args,'--include-analysis').stdout)
    assert nested['tier1']==api and nested['analyses'][0]['groups'][0]['total']=='100'
    assert nested['analyses'][0]['outcome']=='pass'
    explained=json.loads(run('-I','-m','reporting_assurance',*args,'--include-analysis','--explain').stdout)
    assert explained['deterministic']==nested
    assert explained['interpretation']['method']=='controlled_templates'
    assert not explained['interpretation']['adapter_called']
    example=json.loads(run('-I',root/'python/examples/run_explanation.py').stdout)
    assert example['local']==explained
    assert example['offline_mock']['deterministic']==nested
    assert example['offline_mock']['interpretation']['model_verification']=='not_verified'
    flat = json.loads(run('-I', root/'python/examples/run_tables.py').stdout)
    assert flat['summary'][0]['pass_count'] == 10 and flat['summary'][0]['gate'] == 'non_gating'
    assert flat['analysis_groups'][0]['total'] == '100.00'
    assert flat['check_diagnostics'] == []
    assert all(cell is None or type(cell) in (str, int, bool) for records in flat.values() for row in records for cell in row.values())
    # No Node/model/KNIME/dataframe runtime dependencies were installed or needed.
    print(json.dumps({'wheel':wheel.name, 'sha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),
                      'python':sys.version.split()[0], 'clean_install':True, 'api_cli_entrypoint_parity':True,
                      'runtime_dependencies':metadata['requires'] or []}, sort_keys=True))
