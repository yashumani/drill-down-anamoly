"""Optional loopback-only rule authoring adapter. Core usage needs no server."""
import argparse
import csv
import io
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
from .adapters import read_csv, reference_csv_types
from .contracts import ConfigError, load_bundle, bundle_digest
from .engine import evaluate
from .profiling import profile
from .suggestions import suggest_rules

MAX_BODY = 2 * 1024 * 1024
MAX_CSV_BYTES = 1024 * 1024



def local_browser_origin(value):
    """Exact HTTP localhost/IPv4 loopback origins only; no DNS or URL fetching."""
    if type(value) is not str or len(value) > 128:
        raise ConfigError('invalid_local_browser_origin')
    match = re.fullmatch(r'http://(127\.0\.0\.1|localhost)(?::([1-9][0-9]{0,4}))?', value)
    if not match:
        raise ConfigError('invalid_local_browser_origin')
    port = int(match.group(2)) if match.group(2) else 80
    if not 1 <= port <= 65535:
        raise ConfigError('invalid_local_browser_origin')
    return 'http://' + match.group(1) + (':' + str(port) if port != 80 else '')


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
        ref_types=reference_csv_types(config,name,header,types)
        references[name]=parse_csv(text,ref_types)
    return {'report':evaluate(rows,config,references=references,evaluation_time=payload.get('evaluation_time') or None,mode='preview')}


class Handler(BaseHTTPRequestHandler):
    server_version='ReportingAssuranceStudio'
    sys_version=''

    def log_message(self,*args):
        # Do not log paths, data, request bodies, config values or source errors.
        pass

    def origin(self):
        port = self.server.server_port
        return 'http://127.0.0.1' + (':' + str(port) if port != 80 else '')

    def request_origin(self):
        values = self.headers.get_all('Origin', [])
        return values[0] if len(values) == 1 else None

    def allowed_origin(self):
        origin = self.request_origin()
        return origin == self.origin() or origin in self.server.allowed_browser_origins

    def send(self,status,data,mime='application/json; charset=utf-8'):
        body=data if type(data) is bytes else json.dumps(data,ensure_ascii=True,allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        origin = self.request_origin()
        if self.allowed_host() and origin in self.server.allowed_browser_origins:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            if self.command == 'OPTIONS':
                self.send_header('Access-Control-Allow-Methods', 'POST')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.send_header('Access-Control-Max-Age', '0')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers();self.wfile.write(body)

    def allowed_host(self):
        hosts = self.headers.get_all('Host', [])
        return len(hosts) == 1 and hosts[0] == self.origin()[len('http://'):]

    def do_OPTIONS(self):
        headers = {name.strip().lower() for name in self.headers.get('Access-Control-Request-Headers', '').split(',') if name.strip()}
        if (not self.allowed_host() or not self.allowed_origin() or self.path != '/api'
                or self.headers.get('Access-Control-Request-Method') != 'POST'
                or not headers <= {'content-type'}):
            self.send(403, {'error':'preflight_rejected'}); return
        self.send(204, b'')

    def do_GET(self):
        if not self.allowed_host():self.send(403,{'error':'host_rejected'});return
        if self.path!='/':self.send(404,{'error':'not_found'});return
        self.send(200,Path(__file__).with_name('studio.html').read_bytes(),'text/html; charset=utf-8')

    def do_POST(self):
        if not self.allowed_host() or not self.allowed_origin():
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


def create_server(port=0, *, allow_origins=()):
    """Only loopback; cross-origin access stays closed unless explicitly configured.

    Each allowed origin is an exact local HTTP browser origin. This is not local
    process authentication. No credentials/cookies, remote origins or wildcards.
    """
    if type(allow_origins) not in (list, tuple) or len(allow_origins) > 8:
        raise ConfigError('invalid_local_browser_origin')
    origins = frozenset(local_browser_origin(origin) for origin in allow_origins)
    server = ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.allowed_browser_origins = origins
    return server


def main(argv=None):
    parser=argparse.ArgumentParser(prog='reporting-assurance studio',description='Local draft rule authoring. No production approval or model calls.')
    parser.add_argument('--port',type=int,default=0)
    parser.add_argument('--allow-origin', action='append', default=[], metavar='HTTP_LOOPBACK_ORIGIN',
                        help='Explicitly allow one local browser app origin; default cross-origin access stays closed')
    args=parser.parse_args(argv)
    if not 0<=args.port<=65535:parser.error('Port must be between 0 and 65535')
    try:
        server = create_server(args.port, allow_origins=args.allow_origin)
    except ConfigError:
        parser.error('Allowed origins must be exact HTTP localhost or 127.0.0.1 browser origins.')
    except OSError:
        parser.error('Local port unavailable; choose another --port.')
    with server:
        print('Rule Studio: http://127.0.0.1:'+str(server.server_port),flush=True)
        if server.allowed_browser_origins:
            print('Allowed local browser origins: '+', '.join(sorted(server.allowed_browser_origins)),flush=True)
        print('Draft previews only. Press Ctrl+C to stop.',flush=True)
        try:server.serve_forever()
        except KeyboardInterrupt:pass
    return 0
