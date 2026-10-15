"""Optional loopback-only rule authoring adapter. Core usage needs no server."""
import argparse
import csv
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
from .adapters import read_csv
from .contracts import ConfigError, load_bundle, bundle_digest
from .engine import evaluate
from .profiling import profile
from .suggestions import suggest_rules

MAX_BODY = 2 * 1024 * 1024
MAX_CSV_BYTES = 1024 * 1024


def parse_csv(text, types):
    if type(text) is not str or len(text.encode('utf-8')) > MAX_CSV_BYTES:
        raise ConfigError('studio_csv_limit')
    # Reuse the documented CSV adapter exactly; temporary input is removed before returning.
    with tempfile.TemporaryDirectory(prefix='reporting-assurance-studio-') as directory:
        path=Path(directory)/'input.csv'
        with path.open('w',encoding='utf-8',newline='') as handle:handle.write(text)
        return read_csv(path,types=types)


def process(payload):
    if type(payload) is not dict or not payload.keys() <= {'operation','csv','types','rules','references','evaluation_time'}:
        raise ConfigError('invalid_studio_request')
    operation=payload.get('operation')
    if operation not in ('profile','suggest','preview','validate'):
        raise ConfigError('unknown_studio_operation')
    if operation=='validate':
        config=load_bundle(payload.get('rules'))
        return {'valid':True,'bundle_digest':bundle_digest(config)}
    types=payload.get('types',{})
    if type(types) is not dict:raise ConfigError('invalid_csv_types')
    config=None
    if operation=='preview':
        config=load_bundle(payload.get('rules'))
        types=dict(types)
        for rule in config['rules']:
            if rule['operator']=='types':
                for field,spec in rule['params']['fields'].items():
                    if field in types and types[field]!=spec['type']:raise ConfigError('conflicting_csv_types')
                    types[field]=spec['type']
    rows=parse_csv(payload.get('csv'),types)
    if operation=='profile':return {'profile':profile(rows)}
    if operation=='suggest':
        proposal=suggest_rules(rows)
        if proposal['bundle']:
            for rule in proposal['bundle']['rules']:
                if rule['operator']=='types':
                    for field,spec in rule['params']['fields'].items():
                        if field in types:spec['type']=types[field]
            proposal['bundle']['provenance']['source']='observed runtime types plus caller-declared CSV types; owner review required'
        return proposal
    refs=payload.get('references',{})
    if type(refs) is not dict or len(refs)>32:raise ConfigError('reference_limit_or_shape')
    references={}
    for name,text in refs.items():
        if type(name) is not str or not name or len(name)>128 or type(text) is not str:raise ConfigError('invalid_studio_reference')
        try:header=next(csv.reader(io.StringIO(text)),[])
        except csv.Error:raise ConfigError('invalid_csv') from None
        ref_types={f:t for f,t in types.items() if f in header}
        for rule in config['rules']:
            if rule['operator']=='reconcile' and rule['params']['reference']==name:
                ref_types[rule['params']['control_measure']]='decimal'
        references[name]=parse_csv(text,ref_types)
    return {'report':evaluate(rows,config,references=references,evaluation_time=payload.get('evaluation_time') or None,mode='preview')}


class Handler(BaseHTTPRequestHandler):
    server_version='ReportingAssuranceStudio'
    sys_version=''

    def log_message(self,*args):
        # Do not log paths, data, request bodies, config values or source errors.
        pass

    def origin(self):return 'http://127.0.0.1:'+str(self.server.server_port)

    def send(self,status,data,mime='application/json; charset=utf-8'):
        body=data if type(data) is bytes else json.dumps(data,ensure_ascii=True,allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers();self.wfile.write(body)

    def allowed_host(self):return self.headers.get('Host')=='127.0.0.1:'+str(self.server.server_port)

    def do_GET(self):
        if not self.allowed_host():self.send(403,{'error':'host_rejected'});return
        if self.path!='/':self.send(404,{'error':'not_found'});return
        self.send(200,Path(__file__).with_name('studio.html').read_bytes(),'text/html; charset=utf-8')

    def do_POST(self):
        if not self.allowed_host() or self.headers.get('Origin')!=self.origin():
            self.send(403,{'error':'origin_rejected'});return
        if self.path!='/api':self.send(404,{'error':'not_found'});return
        if self.headers.get('Content-Type')!='application/json':self.send(415,{'error':'json_required'});return
        if self.headers.get('Transfer-Encoding'):self.send(400,{'error':'chunked_requests_unsupported'});return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=MAX_BODY:self.send(413,{'error':'studio_request_limit'});return
            self.connection.settimeout(10)
            body=self.rfile.read(length)
            if len(body)!=length:raise ConfigError('incomplete_request')
            def no_constant(_):raise ConfigError('invalid_json')
            def unique_pairs(pairs):
                value={}
                for key,item in pairs:
                    if key in value:raise ConfigError('duplicate_json_key')
                    value[key]=item
                return value
            payload=json.loads(body.decode('utf-8'),parse_constant=no_constant,object_pairs_hook=unique_pairs)
            result=process(payload)
            self.send(200,result)
        except ConfigError as exc:self.send(400,{'error':str(exc)})
        except (ValueError,TypeError,UnicodeError,RecursionError):self.send(400,{'error':'invalid_studio_request'})
        except (OSError,csv.Error):self.send(400,{'error':'input_unavailable_or_invalid'})


def create_server(port=0):
    """Only loopback; strict Host/Origin checks; no retained user state or URL fetching."""
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)


def main(argv=None):
    parser=argparse.ArgumentParser(prog='reporting-assurance studio',description='Local draft rule authoring. No production approval or model calls.')
    parser.add_argument('--port',type=int,default=0)
    args=parser.parse_args(argv)
    if not 0<=args.port<=65535:parser.error('Port must be between 0 and 65535')
    with create_server(args.port) as server:
        print('Rule Studio: http://127.0.0.1:'+str(server.server_port),flush=True)
        print('Draft previews only. Press Ctrl+C to stop.',flush=True)
        try:server.serve_forever()
        except KeyboardInterrupt:pass
    return 0
