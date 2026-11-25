// Fails CI on any high or critical npm advisory, except advisories listed in
// .github/audit-exceptions.json. Each exception carries a reason and a
// review-by date; an expired exception fails the gate so it cannot linger.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BLOCKING = new Set(['high', 'critical']);
const exceptionsPath = fileURLToPath(new URL('../.github/audit-exceptions.json', import.meta.url));

const exceptions = JSON.parse(readFileSync(exceptionsPath, 'utf8')).exceptions ?? [];
const today = new Date().toISOString().slice(0, 10);
let failed = false;

const allowed = new Map();
for (const entry of exceptions) {
  if (!entry.id || !entry.reason || !entry.reviewBy) {
    console.error(`::error::Audit exception is missing id, reason or reviewBy: ${JSON.stringify(entry)}`);
    failed = true;
    continue;
  }
  if (entry.reviewBy < today) {
    console.error(`::error::Audit exception ${entry.id} expired on ${entry.reviewBy}. Re-check the fix status, then renew or remove it.`);
    failed = true;
    continue;
  }
  allowed.set(entry.id, entry);
}

let raw;
try {
  raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = error.stdout;
  if (!raw) throw error;
}
const report = JSON.parse(raw);
if (report.error) {
  console.error(`::error::npm audit could not run: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(1);
}

// Collect each advisory once, from the package it is filed against.
const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
    const id = via.url?.split('/').pop() ?? String(via.source);
    if (!advisories.has(id)) advisories.set(id, { ...via, id, package: via.name ?? vulnerability.name });
  }
}

const used = new Set();
for (const advisory of advisories.values()) {
  const exception = allowed.get(advisory.id);
  if (exception) {
    used.add(advisory.id);
    console.log(`Accepted ${advisory.severity} ${advisory.id} in ${advisory.package} until ${exception.reviewBy}: ${exception.reason}`);
    continue;
  }
  console.error(`::error::${advisory.severity} ${advisory.id} in ${advisory.package} ${advisory.range}: ${advisory.title}`);
  failed = true;
}

for (const id of allowed.keys()) {
  if (!used.has(id)) console.log(`::notice::Audit exception ${id} no longer matches any advisory and can be removed.`);
}

if (failed) process.exit(1);
console.log(`No unaccepted high or critical advisories (${advisories.size} blocking-severity advisories checked).`);
