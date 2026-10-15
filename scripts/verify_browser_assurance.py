"""Development-only native Chromium regression; core package never imports Playwright."""
import argparse
from datetime import datetime, timezone
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
import traceback
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python/src'))
from reporting_assurance.studio import Handler, create_server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'dist')
    parser.add_argument('--evidence-dir', type=Path, required=True)
    args = parser.parse_args()
    output = args.evidence_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if not (args.dist / 'index.html').is_file():
        parser.error('Build the existing app first with npm run build.')
    git = lambda *items: subprocess.check_output(['git', '-C', str(ROOT), *items], text=True).strip()
    identity = {'sha': git('rev-parse', 'HEAD'), 'branch': git('branch', '--show-current'), 'status': git('status', '--porcelain=v1')}
    result = {'source': identity, 'started_at_utc': datetime.now(timezone.utc).isoformat(),
              'checks': [], 'http': [], 'requests': [], 'console_errors': [], 'page_errors': [],
              'chromium_sandbox_enabled': True, 'request_interception': False,
              'user_profile_used': False, 'live_provider_verified': False, 'knime_verified': False}
    servers, threads = [], []
    browser = context = None
    page = None
    hold = None

    class Static(SimpleHTTPRequestHandler):
        def log_message(self, *unused):
            pass

    class Audited(Handler):
        def log_request(self, code='-', size='-'):
            result['http'].append({'method': self.command, 'path': self.path, 'status': code,
                                   'origin': self.headers.get('Origin')})

        def send(self, status, data, mime='application/json; charset=utf-8'):
            pending = getattr(self.server, 'test_response_hold', None)
            if not (pending and status == 200 and isinstance(data, dict) and 'report' in data
                    and self.request_origin() == pending['origin']):
                return super().send(status, data, mime)
            self.server.test_response_hold = None
            pending['entered'].set()
            try:
                if not pending['release'].wait(10):
                    result['hold_timeout'] = True
                try:
                    return super().send(status, data, mime)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass  # The edited React input aborts its pending fetch.
            finally:
                pending['finished'].set()

    def serve(server):
        servers.append(server)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        threads.append(thread)

    def record(name):
        result['checks'].append({'name': name, 'outcome': 'pass'})

    def preview(value):
        assert value['mode'] == 'preview' and value['gate'] == 'non_gating'
        assert value['approval_valid_in_caller_trust'] is False

    def pump_until(event):
        deadline = time.monotonic() + 10
        while not event.is_set() and time.monotonic() < deadline:
            page.wait_for_timeout(20)
        assert event.is_set(), 'Expected native Python response lifecycle was not reached'

    try:
        app = ThreadingHTTPServer(('127.0.0.1', 0), partial(Static, directory=str(args.dist.resolve())))
        serve(app)
        origin = 'http://127.0.0.1:' + str(app.server_port)
        # Never choose another port, terminate another process or relax policy on conflict.
        python = create_server(port=8765, allow_origins=[origin])
        python.RequestHandlerClass = Audited
        serve(python)
        result['origins'] = {'app': origin, 'python': 'http://127.0.0.1:8765'}
        examples = ROOT / 'python/examples'
        csv = (examples / 'reporting.csv').read_text(encoding='utf-8')
        rules = (examples / 'rules.json').read_text(encoding='utf-8')
        controls = (examples / 'controls.csv').read_text(encoding='utf-8')
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, chromium_sandbox=True)
            result['browser_version'] = browser.version
            context = browser.new_context(accept_downloads=True, viewport={'width': 1440, 'height': 1000})
            context.on('request', lambda request: result['requests'].append({'url': request.url, 'method': request.method}))
            page = context.new_page()
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: result['page_errors'].append(str(error)))
            page.on('console', lambda message: result['console_errors'].append(message.text) if message.type == 'error' else None)
            page.goto('http://127.0.0.1:8765', wait_until='networkidle')
            expect(page.locator('#facts')).to_be_hidden()
            page.locator('#profile').click()
            expect(page.locator('#facts b')).to_have_count(3)
            assert page.locator('#facts b').all_text_contents() == ['2', '10', '0']
            record('Studio native profile and hidden initial state')
            page.locator('#suggest').click()
            expect(page.locator('#message')).to_contain_text('Draft created for owner review.')
            draft = json.loads(page.locator('#rules').input_value())
            assert all(not rule['required'] and not rule['blocking'] for rule in draft['rules'])
            page.locator('#preview').click()
            expect(page.locator('#message')).to_contain_text('Preview evaluated:')
            preview(json.loads(page.locator('#report-json').text_content()))
            record('Studio draft remains optional and preview non-gating')
            page.locator('#csv').fill('\n'.join(csv.splitlines()[:2]) + '\n')
            expect(page.locator('#facts')).to_be_hidden()
            expect(page.locator('#facts b')).to_have_count(0)
            expect(page.locator('#evidence-details')).to_be_hidden()
            expect(page.locator('#message')).to_have_text('Inputs changed. Preview the current table and rules.')
            record('Studio edit removes visible counts and obsolete success status')
            page.locator('#csv-file').set_input_files(str(examples / 'reporting.csv'))
            expect(page.locator('#message')).to_contain_text('Opened CSV input.')
            page.locator('#rules-file').set_input_files(str(examples / 'rules.json'))
            expect(page.locator('#message')).to_contain_text('Opened rule JSON.')
            page.get_by_text('Reference controls and evaluation time', exact=True).click()
            page.locator('#controls').fill(controls)
            page.locator('#preview').click()
            expect(page.locator('#message')).to_contain_text('Preview evaluated:')
            value = json.loads(page.locator('#report-json').text_content())
            preview(value)
            assert value['outcome_counts'] == {'pass': 10}
            record('Studio native CSV/JSON imports run all ten checks without approval')
            snapshot = page.locator('#rules').input_value()
            with page.expect_download() as event:
                page.locator('#export').click()
            event.value.save_as(str(output / 'downloaded-rules.json'))
            assert (output / 'downloaded-rules.json').read_bytes() == snapshot.encode('utf-8')
            record('Studio browser download preserves exact validated JSON')
            page.screenshot(path=str(output / 'studio.png'), full_page=True)

            page.goto(origin, wait_until='networkidle')
            page.get_by_role('button', name=re.compile('^Data Quality')).first.click()
            page.get_by_text('Optional Python rule preview', exact=True).click()
            panel = page.get_by_label('Optional local Python assurance', exact=True)
            notice = panel.get_by_role('status')
            consent = panel.get_by_role('checkbox')
            run = panel.get_by_role('button', name='Run Python preview', exact=True)

            def file(kind, path):
                page.locator('#python-assurance-' + kind).set_input_files([])
                page.locator('#python-assurance-' + kind).set_input_files(str(path))
                expect(notice).to_have_text('File opened. The preview uses the selected original text and declared rule types.')

            def fixture():
                for kind, name in [('csv', 'reporting.csv'), ('rules', 'rules.json'), ('controls', 'controls.csv')]:
                    file(kind, examples / name)
                page.locator('#python-assurance-time').fill('2026-04-05T12:00:00Z')

            def response():
                expect(notice).to_have_text('Python preview evaluated the selected original CSV. Gate: non-gating.')
                value = json.loads(panel.locator('details pre').text_content())
                preview(value)
                return value

            before = len(result['http'])
            fixture()
            expect(run).to_be_disabled()
            assert len(result['http']) == before
            assert page.locator('#python-assurance-endpoint').evaluate('(node) => node.readOnly && node.value === "http://127.0.0.1:8765"')
            record('React fixed endpoint and no transfer before consent')
            consent.check()
            run.click()
            assert response()['outcome_counts'] == {'pass': 10}
            assert any(item['method'] == 'OPTIONS' and item['status'] == 204 and item['origin'] == origin for item in result['http'])
            record('React native CSP/CORS bridge executes ten Python checks')
            panel.screenshot(path=str(output / 'react-success.png'))
            page.locator('#python-assurance-time').fill('2026-04-05T13:00:00Z')
            expect(consent).not_to_be_checked()
            expect(run).to_be_disabled()
            assert panel.locator('details pre').count() == 0
            record('React edit clears a real prior report and confirmation')
            hold = {'origin': origin, 'entered': threading.Event(), 'release': threading.Event(), 'finished': threading.Event()}
            python.test_response_hold = hold
            consent.check()
            run.click()
            pump_until(hold['entered'])
            page.locator('#python-assurance-time').fill('2026-04-05T14:00:00Z')
            hold['release'].set()
            pump_until(hold['finished'])
            page.wait_for_timeout(100)
            expect(notice).to_have_text('Inputs changed. Confirm and run a new preview.')
            assert panel.locator('details pre').count() == 0
            expect(consent).not_to_be_checked()
            record('React native pending Python response cannot restore stale evidence')
            invalid = output / 'fictional-invalid-utf8.csv'
            invalid.write_bytes(b'id,amount\n001,\xff\n')
            page.locator('#python-assurance-csv').set_input_files(str(invalid))
            expect(notice).to_have_text('Could not open that file. Use UTF-8 text at or below 1 MiB.')
            consent.check()
            expect(run).to_be_disabled()
            record('React strict UTF-8 failure removes previous file availability')
            fixture()
            allowed = python.allowed_browser_origins
            python.allowed_browser_origins = frozenset()
            before = sum(item['method'] == 'POST' for item in result['http'])
            try:
                consent.check()
                run.click()
                expect(notice).to_contain_text('Local preview unavailable or rejected.')
                assert sum(item['method'] == 'POST' for item in result['http']) == before
                assert any(item['method'] == 'OPTIONS' and item['status'] == 403 for item in result['http'])
            finally:
                python.allowed_browser_origins = allowed
            record('React native CORS denies unlisted origin before POST')
            before = len(result['http'])
            for url in ('http://127.0.0.1:8766/api', 'http://127.0.0.1:8765/other'):
                rejected = page.evaluate('async url=>{try{await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});return false;}catch{return true;}}', url)
                assert rejected
            assert len(result['http']) == before
            record('React native CSP rejects other HTTP ports and paths')
            assert not result['page_errors'] and not result.get('hold_timeout')
            assert all(urlparse(item['url']).hostname == '127.0.0.1' for item in result['requests'])
            assert not any('assurance' in key.lower() or 'python' in key.lower() for key in page.evaluate('Object.keys(localStorage)'))
            record('No external requests, script errors or assurance persistence')
            context.close()
            browser.close()
            context = browser = None
        result['status'] = 'pass'
    except Exception as error:
        result['status'] = 'fail'
        result['failure'] = {'type': type(error).__name__, 'error': str(error), 'traceback': traceback.format_exc()}
        try:
            if page and not page.is_closed():
                page.screenshot(path=str(output / 'failure.png'), full_page=True)
        except Exception:
            pass
    finally:
        if hold:
            hold['release'].set()
        # In failures, sync_playwright's context has already closed browser resources.
        for server in servers:
            server.shutdown()
            server.server_close()
        for thread in threads:
            thread.join(timeout=3)
        result['all_owned_servers_closed'] = all(not thread.is_alive() for thread in threads)
        result['source_after'] = {'sha': git('rev-parse', 'HEAD'), 'branch': git('branch', '--show-current'), 'status': git('status', '--porcelain=v1')}
        assert result['source_after'] == identity, 'Source changed during browser acceptance'
        result['finished_at_utc'] = datetime.now(timezone.utc).isoformat()
        result['counts'] = {'pass': len(result['checks']), 'fail': int(result['status'] != 'pass')}
        result['source_script_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        (output / 'results.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, indent=2))
    return 0 if result['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())
