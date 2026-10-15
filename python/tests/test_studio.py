"""Actual loopback adapter tests; core executor itself still performs no network IO."""
import json
from pathlib import Path
import threading
import unittest
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from reporting_assurance.studio import create_server,process
from reporting_assurance import evaluate,read_csv,load_bundle,ConfigError

EXAMPLES=Path(__file__).resolve().parents[1]/'examples'
CSV=(EXAMPLES/'reporting.csv').read_text(encoding='utf-8')
RULES=(EXAMPLES/'rules.json').read_text(encoding='utf-8')
TYPES={'id':'string','period':'date','loaded_at':'datetime','amount':'decimal'}


class StudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=create_server();cls.base='http://127.0.0.1:'+str(cls.server.server_port)
        cls.worker=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.worker.start()

    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.worker.join(timeout=3)

    def request(self,payload,origin=None,host=None):
        headers={'Content-Type':'application/json','Origin':origin or self.base}
        if host:headers['Host']=host
        return urlopen(Request(self.base+'/api',data=json.dumps(payload).encode(),headers=headers),timeout=5)

    def test_static_studio_loads_offline_with_security_headers(self):
        with urlopen(self.base,timeout=5) as response:
            html=response.read().decode()
            self.assertIn('Rule Studio',html);self.assertIn('Preview never passes',html)
            self.assertIn("connect-src 'self'",response.headers['Content-Security-Policy'])
            self.assertEqual(response.headers['Cache-Control'],'no-store')
            self.assertNotIn('https://',html)

    def test_http_profile_and_draft_suggestions(self):
        payload={'operation':'profile','csv':CSV,'types':TYPES}
        with self.request(payload) as response:data=json.load(response)
        self.assertEqual(data['profile']['row_count'],2)
        self.assertNotIn('001',json.dumps(data))
        payload['operation']='suggest'
        with self.request(payload) as response:data=json.load(response)
        self.assertEqual(data['bundle']['provenance']['kind'],'draft_proposal')
        self.assertNotIn('approval',data['bundle'])
        self.assertTrue(all(not rule['blocking'] for rule in data['bundle']['rules']))

    def test_preview_has_api_parity_and_is_always_non_gating(self):
        controls=(EXAMPLES/'controls.csv').read_text(encoding='utf-8')
        payload={'operation':'preview','csv':CSV,'rules':RULES,'types':TYPES,'references':{'controls':controls},'evaluation_time':'2026-04-05T12:00:00Z'}
        with self.request(payload) as response:report=json.load(response)['report']
        config=load_bundle(RULES)
        types={f:s['type'] for f,s in config['rules'][1]['params']['fields'].items()}
        rows=read_csv(EXAMPLES/'reporting.csv',types=types)
        references={'controls':read_csv(EXAMPLES/'controls.csv',types={f:t for f,t in types.items() if f not in ('id','level','loaded_at')})}
        self.assertEqual(report,evaluate(rows,config,references=references,evaluation_time='2026-04-05T12:00:00Z'))
        self.assertEqual(report['gate'],'non_gating')

    def test_complete_profile_draft_preview_export_path(self):
        payload={'operation':'suggest','csv':CSV,'types':TYPES}
        with self.request(payload) as response:draft=json.load(response)['bundle']
        typed=next(r for r in draft['rules'] if r['operator']=='types')['params']['fields']
        self.assertEqual(typed['period']['type'],'date')
        editor=json.dumps(draft,indent=2)
        payload.update(operation='preview',rules=editor,evaluation_time='2026-04-05T12:00:00Z')
        with self.request(payload) as response:report=json.load(response)['report']
        self.assertEqual(report['gate'],'non_gating')
        self.assertEqual(report['outcome_counts'],{'pass':2})
        with self.request({'operation':'validate','rules':editor}) as response:export=json.load(response)
        self.assertEqual(export['bundle_digest'],report['bundle_digest'])
        self.assertEqual(load_bundle(editor),draft)

    def test_foreign_origin_and_host_are_rejected(self):
        for kw in [{'origin':'https://foreign.invalid'},{'origin':'http://localhost:5173'},{'host':'foreign.invalid'}]:
            with self.assertRaises(HTTPError) as caught:self.request({'operation':'profile','csv':CSV},**kw)
            self.assertEqual(caught.exception.code,403)

    def test_bad_rule_and_unsupported_fields_do_not_execute(self):
        for payload in [{'operation':'execute','code':'arbitrary'}, {'operation':'validate','rules':'{"unknown":true}'}, {'operation':'profile','csv':CSV,'url':'https://foreign.invalid'}]:
            with self.assertRaises(HTTPError) as caught:self.request(payload)
            self.assertEqual(caught.exception.code,400)
        with self.assertRaises(ConfigError):process({'operation':'profile','csv':'x'*(1048577)})

    def test_export_validation_matches_the_exact_contract(self):
        original=RULES+'\n\n'
        with self.request({'operation':'validate','rules':original}) as response:data=json.load(response)
        from reporting_assurance import bundle_digest
        self.assertTrue(data['valid']);self.assertEqual(data['bundle_digest'],bundle_digest(load_bundle(original)))


if __name__=='__main__':unittest.main()
