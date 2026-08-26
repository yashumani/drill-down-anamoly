import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL;
const targetSha = process.env.TARGET_SHA;
const outputDir = path.resolve('ux-journey-live-verification');
const screenshotDir = path.join(outputDir, 'screenshots');
fs.mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];
const viewports = {
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  phone: { width: 390, height: 844 },
};
const safeName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function prepare(page, hash) {
  await page.goto(`${baseUrl}${hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(900);
}

async function audit(page, scenario, viewport, strictViewport = false) {
  const metrics = await page.evaluate(({ scenario, viewport, strictViewport }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01
        && rect.width > 0
        && rect.height > 0;
    };

    const selector = 'button, a[href], select, textarea, summary, input:not([type="hidden"]):not([type="file"]), [role="button"]';
    const elements = [...document.querySelectorAll(selector)].filter(visible);
    const controls = elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const label = (element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || element.tagName)
        .trim().replace(/\s+/g, ' ').slice(0, 90);
      return {
        index,
        label,
        tag: element.tagName.toLowerCase(),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        clippedText: element.scrollWidth > element.clientWidth + 3
          && ['hidden', 'clip'].includes(style.overflowX),
        horizontalClip: rect.left < -2 || rect.right > innerWidth + 2,
      };
    });

    const overlaps = [];
    for (let left = 0; left < elements.length; left += 1) {
      const a = elements[left];
      const ar = a.getBoundingClientRect();
      for (let right = left + 1; right < elements.length; right += 1) {
        const b = elements[right];
        if (a.contains(b) || b.contains(a)) continue;
        const br = b.getBoundingClientRect();
        const width = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
        const height = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
        if (width <= 3 || height <= 3) continue;
        const area = width * height;
        const smaller = Math.max(1, Math.min(ar.width * ar.height, br.width * br.height));
        if (area / smaller > 0.08) {
          overlaps.push({
            a: controls[left]?.label,
            b: controls[right]?.label,
            overlapRatio: Number((area / smaller).toFixed(3)),
          });
        }
      }
    }

    const keySelectors = [
      '.ow-topbar',
      '.deck-progress',
      '.deck-stage',
      '.deck-footer',
      '.analysis-journey',
      '.analysis-journey-steps',
      '.analysis-stage-page',
      '.exploration-control-bar',
      '.analysis-view-tabs',
    ];
    const keyRects = keySelectors.flatMap((keySelector) => [...document.querySelectorAll(keySelector)]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: keySelector,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          horizontalClip: rect.left < -2 || rect.right > innerWidth + 2,
          verticalClip: strictViewport && (rect.top < -2 || rect.bottom > innerHeight + 2),
        };
      }));

    const deckCopy = document.querySelector('.deck-copy');
    return {
      scenario,
      viewport,
      documentOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      bodyOverflowX: Math.max(0, document.body.scrollWidth - document.body.clientWidth),
      controls: controls.length,
      horizontalClips: controls.filter((item) => item.horizontalClip),
      croppedControls: controls.filter((item) => item.clippedText),
      overlaps,
      keyRects,
      keyHorizontalClips: keyRects.filter((item) => item.horizontalClip),
      keyVerticalClips: keyRects.filter((item) => item.verticalClip),
      deckCopyDisplay: deckCopy ? getComputedStyle(deckCopy).display : null,
      deckProgressCount: document.querySelectorAll('.deck-progress button').length,
      advancedStepCount: document.querySelectorAll('.analysis-journey-steps button').length,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
    };
  }, { scenario, viewport, strictViewport });

  const problems = [];
  if (metrics.documentOverflowX > 2 || metrics.bodyOverflowX > 2) problems.push(`horizontal document overflow ${Math.max(metrics.documentOverflowX, metrics.bodyOverflowX)}px`);
  if (metrics.horizontalClips.length) problems.push(`${metrics.horizontalClips.length} interactive control(s) clipped horizontally`);
  if (metrics.croppedControls.length) problems.push(`${metrics.croppedControls.length} interactive control label(s) cropped`);
  if (metrics.overlaps.length) problems.push(`${metrics.overlaps.length} overlapping interactive control pair(s)`);
  if (metrics.keyHorizontalClips.length) problems.push(`${metrics.keyHorizontalClips.length} key layout region(s) clipped horizontally`);
  if (strictViewport && metrics.keyVerticalClips.length) problems.push(`${metrics.keyVerticalClips.length} guided layout region(s) clipped vertically`);
  if (scenario.includes('quick-explain') && metrics.deckCopyDisplay === 'grid') problems.push('deck-copy still inherits the obsolete grid layout');
  if (scenario.startsWith('quick-') && metrics.deckProgressCount !== 5) problems.push(`expected 5 Quick Answer steps, found ${metrics.deckProgressCount}`);
  if (scenario.startsWith('advanced-') && metrics.advancedStepCount !== 5) problems.push(`expected 5 Advanced stages, found ${metrics.advancedStepCount}`);

  results.push({ ...metrics, problems });
  if (problems.length) failures.push({
    scenario,
    viewport,
    problems,
    overlaps: metrics.overlaps.slice(0, 12),
    clips: metrics.horizontalClips.slice(0, 12),
    croppedControls: metrics.croppedControls.slice(0, 12),
    keyVerticalClips: metrics.keyVerticalClips,
  });
}

async function capture(page, scenario, viewport) {
  await page.screenshot({
    path: path.join(screenshotDir, `${safeName(scenario)}-${viewport.width}x${viewport.height}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

async function runQuickJourney(viewportName, stages) {
  const viewport = viewports[viewportName];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await prepare(page, '#/quick');
  for (const stage of stages) {
    await page.locator('.deck-progress button').filter({ hasText: stage }).first().click();
    await page.waitForTimeout(450);
    const scenario = `quick-${safeName(stage)}`;
    await audit(page, scenario, viewport, viewport.width >= 1200);
    await capture(page, scenario, viewport);
  }
  await context.close();
}

async function runAdvancedJourney(viewportName, stages) {
  const viewport = viewports[viewportName];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await prepare(page, '#/analysis');
  for (const stage of stages) {
    await page.locator('.analysis-journey-steps button').filter({ hasText: stage }).first().click();
    await page.waitForTimeout(650);
    const scenario = `advanced-${safeName(stage)}`;
    await audit(page, scenario, viewport, false);
    await capture(page, scenario, viewport);
  }

  await page.locator('.analysis-journey-steps button').filter({ hasText: 'Explain' }).first().click();
  await page.waitForTimeout(350);
  for (const view of ['Single drivers', 'Combined patterns', 'Hierarchy']) {
    await page.locator('.analysis-view-tabs button').filter({ hasText: view }).first().click();
    await page.waitForTimeout(view === 'Hierarchy' ? 900 : 450);
    const scenario = `advanced-explain-${safeName(view)}`;
    await audit(page, scenario, viewport, false);
    await capture(page, scenario, viewport);
  }
  await context.close();
}

await runQuickJourney('laptop', ['Data', 'Goal', 'Detect', 'Explain', 'Share']);
await runAdvancedJourney('laptop', ['Scope', 'Detect', 'Explain', 'Validate', 'Share']);
await runQuickJourney('desktop', ['Detect', 'Explain']);
await runAdvancedJourney('desktop', ['Scope', 'Explain']);
await runQuickJourney('tablet', ['Goal', 'Detect', 'Share']);
await runAdvancedJourney('tablet', ['Scope', 'Explain', 'Share']);
await runQuickJourney('phone', ['Data', 'Goal', 'Detect', 'Explain', 'Share']);
await runAdvancedJourney('phone', ['Scope', 'Detect', 'Explain', 'Validate', 'Share']);

await browser.close();

const summary = {
  targetSha,
  liveUrl: baseUrl,
  checkedAt: new Date().toISOString(),
  scenarios: results.length,
  failedScenarios: failures.length,
  viewports,
  results,
  failures,
  verified: failures.length === 0,
};
fs.writeFileSync(path.join(outputDir, 'ux-journey-live-verification.json'), JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log(`Verified ${results.length} journey states with no control overlap, cropping, or horizontal overflow.`);
