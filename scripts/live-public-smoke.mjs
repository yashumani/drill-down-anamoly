const DATASET_ID = 'v5c4-aqci';
const RESOURCE = `https://controllerdata.lacity.org/resource/${DATASET_ID}.json`;
const METADATA = `https://controllerdata.lacity.org/api/views/${DATASET_ID}`;
const REQUIRED_DIMENSIONS = [
  'department_name',
  'vendor_name',
  'government_activity',
  'fund_group_name',
  'fund_type',
  'fund_name',
  'account_name',
  'expenditure_type',
  'authority',
  'settlement_judgment',
];

function queryUrl(params) {
  const url = new URL(RESOURCE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function readJson(url, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'drill-down-anomaly-lab-live-smoke/0.2',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

const [countRows, latestRows, metadata, monthlyRows, departmentRows] = await Promise.all([
  readJson(queryUrl({
    '$select': 'count(*) as row_count',
    '$where': 'dollar_amount is not null',
  })),
  readJson(queryUrl({
    '$select': 'transaction_date, fiscal_year',
    '$where': 'transaction_date is not null',
    '$order': 'transaction_date DESC',
    '$limit': '1',
  })),
  readJson(METADATA),
  readJson(queryUrl({
    '$select': 'fiscal_year, fiscal_month_number, min(transaction_date) as period_start, max(transaction_date) as period_end, sum(dollar_amount) as amount, count(*) as transactions',
    '$where': 'dollar_amount is not null AND fiscal_year is not null AND fiscal_month_number is not null AND transaction_date is not null',
    '$group': 'fiscal_year, fiscal_month_number',
    '$limit': '5',
  })),
  readJson(queryUrl({
    '$select': 'department_name as value, sum(dollar_amount) as amount, count(*) as transactions',
    '$where': 'dollar_amount is not null AND department_name is not null',
    '$group': 'department_name',
    '$order': 'sum(dollar_amount) DESC',
    '$limit': '3',
  })),
]);

const rowCount = Number(countRows?.[0]?.row_count);
if (!Number.isFinite(rowCount) || rowCount < 1_000_000) {
  throw new Error(`Expected at least 1,000,000 live rows, received ${String(countRows?.[0]?.row_count)}`);
}

const apiFields = new Set((metadata?.columns ?? []).map((column) => column?.fieldName).filter(Boolean));
const missingDimensions = REQUIRED_DIMENSIONS.filter((field) => !apiFields.has(field));
if (missingDimensions.length) throw new Error(`Missing expected finance dimensions: ${missingDimensions.join(', ')}`);
if (!Array.isArray(latestRows) || !latestRows[0]?.transaction_date) throw new Error('Latest-period query returned no transaction date.');
if (!Array.isArray(monthlyRows) || monthlyRows.length === 0) throw new Error('Monthly aggregate query returned no rows.');
if (!Array.isArray(departmentRows) || departmentRows.length === 0) throw new Error('Department concentration query returned no rows.');

const monthlyTotal = monthlyRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
if (!Number.isFinite(monthlyTotal)) throw new Error('Monthly payment aggregation returned an invalid total.');

console.log(JSON.stringify({
  datasetId: DATASET_ID,
  rowCount,
  latestTransactionDate: latestRows[0].transaction_date,
  latestFiscalYear: latestRows[0].fiscal_year,
  sourceColumns: metadata?.columns?.length ?? 0,
  verifiedDimensions: REQUIRED_DIMENSIONS.length,
  monthlyAggregateRowsReturned: monthlyRows.length,
  dimensionAggregateRowsReturned: departmentRows.length,
  leadingDepartment: departmentRows[0]?.value ?? null,
  updatedAtEpoch: metadata?.rowsUpdatedAt ?? null,
}, null, 2));
