/** Real local client/Python HTTP integration. No browser or live model verification. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { requestPythonPreview } from '../src/lib/pythonAssuranceClient.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = 'http://localhost:5173';
const python = process.env.REPORTING_ASSURANCE_TEST_PYTHON || 'python';
const child = spawn(python, ['-u', '-m', 'reporting_assurance', 'studio', '--port', '0', '--allow-origin', origin], {
  cwd: root, windowsHide: true, env: { ...process.env, PYTHONPATH: join(root, 'python', 'src') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;
let transfers = 0;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Local Python test server startup timed out')), 15_000);
    function finish(error, value) { clearTimeout(timeout); error ? reject(error) : resolve(value); }
    child.once('error', error => finish(error));
    child.once('exit', () => finish(new Error('Local Python test server exited: ' + stderr)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Rule Studio: (http:\/\/127\.0\.0\.1:[0-9]+)/);
      if (match) finish(null, match[1]);
    });
  });
  globalThis.location = { origin };
  // Node is not a browser and does not add Origin automatically. Send it explicitly
  // to exercise the actual server's configured allowlist; this is HTTP test code.
  let requestOrigin = origin;
  globalThis.fetch = (url, options) => {
    assert.equal(url, endpoint + '/api');
    transfers += 1;
    return originalFetch(url, { ...options, headers: { ...options.headers, Origin: requestOrigin } });
  };
  const rule = (id, operator, params) => ({ id, operator, params, severity: 'critical', required: true, blocking: true, depends_on: [] });
  const rules = JSON.stringify({ schema_version: '1.0', revision: 'fictional-local-bridge-v1',
    provenance: { author: 'fictional_owner', source: 'independent_http_precision_oracle', kind: 'draft_proposal' }, rules: [
      rule('fields', 'required_fields', { fields: ['id', 'amount'] }),
      rule('types', 'types', { fields: { id: { type: 'string', nullable: false }, amount: { type: 'decimal', nullable: false } } }),
      rule('grain', 'unique', { fields: ['id'] }),
      rule('amount_bound', 'range', { field: 'amount', min: '0', max: '9007199254740993.00010' }),
    ] });
  const csv = 'id,amount\r\n001,9007199254740993.00010\r\n002,0.00000\r\n';
  const input = { csv, rules, evaluationTime: '' };
  const clean = await requestPythonPreview(endpoint, input, { confirmed: true });
  assert.equal(clean.gate, 'non_gating');
  assert.equal(clean.approval_valid_in_caller_trust, false);
  assert.deepEqual(clean.outcome_counts, { pass: 4 });
  assert.equal(clean.row_count, 2);
  assert.ok(!JSON.stringify(clean).includes('9007199254740993'));
  const faulty = await requestPythonPreview(endpoint, { ...input, csv: csv.replace('.00010', '.00011') }, { confirmed: true });
  assert.deepEqual(faulty.outcome_counts, { pass: 3, fail: 1 });
  assert.equal(faulty.results.find(item => item.id === 'amount_bound').outcome, 'fail');
  const before = transfers;
  await assert.rejects(requestPythonPreview(endpoint, input, { confirmed: false }), /confirmation_required/);
  assert.equal(transfers, before);
  const preflight = await originalFetch(endpoint + '/api', { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null);
  requestOrigin = 'http://localhost:5174';
  await assert.rejects(requestPythonPreview(endpoint, input, { confirmed: true }), /local_python_rejected/);
  console.log(JSON.stringify({ local_http_bridge: 'pass', exact_decimal_boundary: 'pass', explicit_transfer_only: true,
    exact_origin_allowlist: 'pass', production_gate: 'unavailable', browser_verified: false, live_model_verified: false }));
} finally {
  globalThis.fetch = originalFetch;
  if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  if (child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([stopped, new Promise(resolve => { const timeout = setTimeout(resolve, 5000); timeout.unref(); })]);
  }
}
