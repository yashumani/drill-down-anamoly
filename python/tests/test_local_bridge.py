"""Real loopback HTTP bridge tests. These are not actual browser verification."""
import http.client
import json
import subprocess
import sys
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from reporting_assurance import ConfigError, evaluate, read_csv, load_bundle
from reporting_assurance.studio import create_server, local_browser_origin
from test_studio import CSV, RULES, TYPES, EXAMPLES


class LocalBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.origin = 'http://localhost:5173'
        cls.server = create_server(allow_origins=[cls.origin])
        cls.base = 'http://127.0.0.1:' + str(cls.server.server_port)
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.worker.join(timeout=3)

    def preflight(self, origin=None, method='POST', headers='content-type'):
        return urlopen(Request(self.base + '/api', method='OPTIONS', headers={
            'Origin': origin or self.origin, 'Access-Control-Request-Method': method,
            'Access-Control-Request-Headers': headers}), timeout=5)

    def test_explicit_origin_preflight_has_no_credentials_or_wildcards(self):
        with self.preflight() as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.read(), b'')
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], self.origin)
            self.assertEqual(response.headers['Access-Control-Allow-Methods'], 'POST')
            self.assertEqual(response.headers['Access-Control-Allow-Headers'], 'Content-Type')
            self.assertEqual(response.headers['Vary'], 'Origin')
            self.assertIsNone(response.headers.get('Access-Control-Allow-Credentials'))

    def test_actual_preview_uses_the_same_executor_and_cannot_run_production(self):
        payload = dict(operation='preview', csv=CSV, rules=RULES, types=TYPES,
            references={'controls': (EXAMPLES / 'controls.csv').read_text(encoding='utf-8')},
            evaluation_time='2026-04-05T12:00:00Z')
        def request(value):
            return urlopen(Request(self.base + '/api', data=json.dumps(value).encode(),
                headers={'Origin': self.origin, 'Content-Type': 'application/json'}), timeout=5)
        with request(payload) as response:
            result = json.load(response)['report']
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], self.origin)
        self.assertEqual(result['outcome_counts'], {'pass': 10})
        rows = read_csv(EXAMPLES / 'reporting.csv', types=TYPES)
        controls = read_csv(EXAMPLES / 'controls.csv', types={'period':'date', 'amount':'decimal'})
        self.assertEqual(result, evaluate(rows, load_bundle(RULES), references={'controls':controls},
            evaluation_time='2026-04-05T12:00:00Z'))
        self.assertEqual(result['mode'], 'preview')
        self.assertEqual(result['gate'], 'non_gating')
        self.assertFalse(result['approval_valid_in_caller_trust'])
        for extra in [dict(mode='production'), dict(trusted_digests=['0' * 64]), dict(adapter='arbitrary')]:
            with self.assertRaises(HTTPError) as caught:
                request(dict(payload, **extra))
            self.assertEqual(caught.exception.code, 400)

    def test_other_origins_ports_methods_headers_and_hosts_remain_closed(self):
        for options in [dict(origin='http://localhost:5174'), dict(origin='https://remote.invalid'),
                        dict(origin='null'), dict(method='DELETE'), dict(headers='authorization')]:
            with self.assertRaises(HTTPError) as caught:
                self.preflight(**options)
            self.assertEqual(caught.exception.code, 403)
        with self.assertRaises(HTTPError) as caught:
            urlopen(Request(self.base + '/api', method='OPTIONS', headers={
                'Host': 'foreign.invalid', 'Origin': self.origin, 'Access-Control-Request-Method': 'POST'}), timeout=5)
        self.assertEqual(caught.exception.code, 403)

    def test_duplicate_origin_or_host_headers_are_rejected(self):
        for duplicate in ['Origin', 'Host']:
            connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
            try:
                connection.putrequest('OPTIONS', '/api')
                connection.putheader('Origin', self.origin)
                connection.putheader(duplicate, 'https://foreign.invalid')
                connection.putheader('Access-Control-Request-Method', 'POST')
                connection.endheaders()
                response = connection.getresponse()
                self.assertEqual(response.status, 403)
                self.assertIsNone(response.getheader('Access-Control-Allow-Origin'))
            finally:
                connection.close()

    def test_startup_origin_contract_rejects_nonlocal_urls_and_executable_input(self):
        for value in ['*', 'null', 'https://localhost:5173', 'http://192.168.0.2:5173',
                      'http://localhost:5173/path', 'http://localhost:5173?query=1',
                      'http://localhost:5173#fragment', 'http://user@localhost:5173',
                      'http://localhost:0', 'http://localhost:65536', 'http://127.0.0.1.evil:5173',
                      'http://[::1]:5173', False, []]:
            with self.subTest(value_type=type(value).__name__), self.assertRaises(ConfigError):
                create_server(allow_origins=[value])
        invalid_cli = subprocess.run([sys.executable, '-m', 'reporting_assurance', 'studio',
            '--allow-origin', 'https://remote.invalid'], capture_output=True, text=True)
        self.assertEqual(invalid_cli.returncode, 2)
        self.assertIn('Allowed origins must be exact HTTP', invalid_cli.stderr)
        self.assertNotIn('Traceback', invalid_cli.stderr)
        self.assertEqual(local_browser_origin('http://localhost:80'), 'http://localhost')
        self.assertEqual(local_browser_origin('http://127.0.0.1:5173'), 'http://127.0.0.1:5173')
        for invalid in [False, 'http://localhost:5173', ['http://localhost:5173'] * 9]:
            with self.assertRaises(ConfigError):
                create_server(allow_origins=invalid)
