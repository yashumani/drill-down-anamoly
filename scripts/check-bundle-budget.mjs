import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../dist', import.meta.url).pathname;
const limits = {
  totalJavaScript: 1_800_000,
  largestJavaScript: 1_300_000,
  totalCss: 170_000,
};

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else output.push(path);
  }
  return output;
}

function display(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

let files;
try {
  files = await walk(root);
} catch (error) {
  console.error('Bundle budget requires an existing dist directory. Run npm run build first.');
  throw error;
}

const assets = await Promise.all(files.map(async (path) => ({
  path,
  name: relative(root, path),
  bytes: (await stat(path)).size,
})));
const javascript = assets.filter((asset) => asset.path.endsWith('.js'));
const css = assets.filter((asset) => asset.path.endsWith('.css'));
const totalJavaScript = javascript.reduce((sum, asset) => sum + asset.bytes, 0);
const totalCss = css.reduce((sum, asset) => sum + asset.bytes, 0);
const largestJavaScript = [...javascript].sort((left, right) => right.bytes - left.bytes)[0];

console.log('Production bundle inventory');
for (const asset of [...javascript, ...css].sort((left, right) => right.bytes - left.bytes)) {
  console.log(`- ${asset.name}: ${display(asset.bytes)}`);
}
console.log(`Total JavaScript: ${display(totalJavaScript)} / ${display(limits.totalJavaScript)}`);
console.log(`Largest JavaScript chunk: ${largestJavaScript ? `${largestJavaScript.name} · ${display(largestJavaScript.bytes)}` : 'none'} / ${display(limits.largestJavaScript)}`);
console.log(`Total CSS: ${display(totalCss)} / ${display(limits.totalCss)}`);

const failures = [];
if (totalJavaScript > limits.totalJavaScript) failures.push(`Total JavaScript exceeds budget by ${display(totalJavaScript - limits.totalJavaScript)}.`);
if (largestJavaScript && largestJavaScript.bytes > limits.largestJavaScript) failures.push(`${largestJavaScript.name} exceeds the per-chunk budget by ${display(largestJavaScript.bytes - limits.largestJavaScript)}.`);
if (totalCss > limits.totalCss) failures.push(`Total CSS exceeds budget by ${display(totalCss - limits.totalCss)}.`);

if (failures.length) {
  console.error('\nBundle budget failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nBundle budget passed.');
