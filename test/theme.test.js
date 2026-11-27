import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FONTS_DIR = path.join(ROOT, 'public', 'fonts');
const EXPECTED_FONTS = [
  'proxima-nova-thin.otf',
  'proxima-nova-alt-light.otf',
  'proxima-nova-regular.otf',
  'proxima-nova-medium.otf',
  'proxima-nova-bold.otf',
  'proxima-nova-extrabold.otf',
  'proxima-nova-black.otf',
];

test('bundles the seven mapped Proxima Nova OTF assets in public/fonts', () => {
  assert.equal(fs.existsSync(FONTS_DIR), true, 'public/fonts directory should exist');
  const entries = fs.readdirSync(FONTS_DIR);

  for (const filename of EXPECTED_FONTS) {
    const filePath = path.join(FONTS_DIR, filename);
    assert.equal(fs.existsSync(filePath), true, `Missing font asset: ${filename}`);
    assert.ok(fs.statSync(filePath).size > 10_000, `Font asset looks empty/corrupt: ${filename}`);
  }

  const junk = entries.filter((name) => name === '.DS_Store' || name.startsWith('._'));
  assert.deepEqual(junk, [], 'public/fonts should not contain macOS metadata files');
});

test('configures index.html for the brand theme without external Google Fonts', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  assert.match(html, /<meta\s+name="theme-color"\s+content="#2C5B32"\s*\/?>/i);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/i);
  assert.doesNotMatch(html, /fonts\.gstatic\.com/i);
  assert.doesNotMatch(html, /Plus Jakarta Sans/i);
  assert.doesNotMatch(html, /#e94b2e/i);
});

test('declares all seven Proxima Nova @font-face weights pointing to existing public/fonts files', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const blocks = [...css.matchAll(/@font-face\s*\{([^}]+)\}/gi)].map((match) => match[1]);
  assert.ok(blocks.length >= 7, `Expected at least 7 @font-face declarations, found ${blocks.length}`);

  const declaredWeights = [];
  for (const block of blocks) {
    assert.match(block, /font-family:\s*['"]Proxima Nova['"]/i);
    assert.match(block, /font-display:\s*swap/i);
    assert.match(block, /format\(['"]opentype['"]\)/i);

    const weightMatch = block.match(/font-weight:\s*(\d+)/i);
    assert.ok(weightMatch, 'Each @font-face block must specify a numeric font-weight');
    declaredWeights.push(Number(weightMatch[1]));

    const urlMatch = block.match(/url\(['"]?(\/fonts\/[^'")]+)['"]?\)/i);
    assert.ok(urlMatch, 'Each @font-face block must reference a /fonts/ URL');
    const diskPath = path.join(ROOT, 'public', urlMatch[1].replace(/^\//, ''));
    assert.equal(fs.existsSync(diskPath), true, `Missing referenced font on disk: ${urlMatch[1]}`);
  }

  assert.deepEqual(
    declaredWeights.sort((a, b) => a - b),
    [250, 300, 400, 500, 700, 800, 900],
  );
});

test('defines all exact brand palette tokens and removes legacy colors', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  assert.ok(rootMatch, ':root block should exist in src/styles.css');
  const rootBlock = rootMatch[1].toLowerCase();

  for (const hex of ['#2c5b32', '#2b2b6b', '#e74c2d', '#ffffff', '#f8f9fb', '#1f2937', '#64748b', '#e2e8f0']) {
    assert.ok(rootBlock.includes(hex), `Expected ${hex} in :root tokens`);
  }

  assert.match(
    rootMatch[1],
    /--font-primary:\s*Calibri,\s*'Proxima Nova',\s*'Segoe UI',\s*Arial,\s*sans-serif;/,
  );
  assert.match(
    rootMatch[1],
    /--font-ui:\s*'Proxima Nova',\s*Calibri,\s*'Segoe UI',\s*Arial,\s*sans-serif;/,
  );

  for (const [label, content] of [['src/styles.css', css], ['src/App.jsx', app], ['index.html', html]]) {
    for (const retiredHex of ['#e94b2e', '#fb3b5e', '#fb5e49', '#00bb88']) {
      assert.equal(
        content.toLowerCase().includes(retiredHex),
        false,
        `Retired legacy hex ${retiredHex} still appears in ${label}`,
      );
    }
  }
});

test('resolves every CSS custom property referenced in styles.css and App.jsx', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');

  const defined = new Set(
    [...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]),
  );
  const referenced = new Set([
    ...[...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((match) => match[1]),
    ...[...app.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((match) => match[1]),
  ]);

  const missing = [...referenced].filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], `Undefined CSS custom properties: ${missing.join(', ')}`);
});

test('maps typography hierarchy sizes and interactive brand color roles', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

  assert.match(css, /font-family:\s*var\(--font-primary\);/);
  assert.match(css, /font-size:\s*16px;/);
  assert.match(css, /line-height:\s*1\.5;/);
  assert.match(css, /font-weight:\s*400;/);

  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  let depth = 0;
  let tokenStart = 0;
  let currentSelector = '';
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === '{') {
      if (depth === 0) {
        currentSelector = stripped.slice(tokenStart, i).replace(/\s+/g, ' ').trim();
        tokenStart = i + 1;
      }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        if (currentSelector && !currentSelector.startsWith('@')) {
          const body = stripped.slice(tokenStart, i);
          rules.set(currentSelector, `${rules.get(currentSelector) ?? ''}\n${body}`);
        }
        tokenStart = i + 1;
      }
    }
  }
  const ruleBody = (selector) => {
    const body = rules.get(selector);
    assert.ok(body, `Expected CSS rule for "${selector}"`);
    return body;
  };

  const heroTitle = ruleBody('.hero-title');
  assert.match(heroTitle, /font-family:\s*var\(--font-ui\);/);
  assert.match(heroTitle, /font-size:\s*32px;/);
  assert.match(heroTitle, /font-weight:\s*700;/);

  const sectionH2 = ruleBody('h1, h2');
  assert.match(sectionH2, /font-size:\s*26px;/);
  assert.match(sectionH2, /font-weight:\s*700;/);

  const calendarH3 = ruleBody('.calendar-heading h3');
  assert.match(calendarH3, /font-size:\s*22px;/);
  assert.match(calendarH3, /font-weight:\s*700;/);

  const chartH3 = ruleBody('.chart-heading h3');
  assert.match(chartH3, /font-size:\s*18px;/);
  assert.match(chartH3, /font-weight:\s*700;/);

  const kpiValue = ruleBody('.summary-card strong');
  assert.match(kpiValue, /font-family:\s*var\(--font-ui\);/);
  assert.match(kpiValue, /font-weight:\s*800;/);

  const primaryBtn = ruleBody('.primary-button');
  assert.match(primaryBtn, /background:\s*var\(--tc-green\);/);
  assert.match(primaryBtn, /color:\s*#ffffff;/);

  const btnShared = ruleBody('.reset-button, .primary-button');
  assert.match(btnShared, /font-family:\s*var\(--font-ui\);/);
  assert.match(btnShared, /font-weight:\s*500;/);

  const secondaryBtn = ruleBody('.reset-button');
  assert.match(secondaryBtn, /var\(--tc-blue\)/);

  const activeNav = ruleBody('.nav-link.active');
  assert.match(activeNav, /var\(--tc-green\)/);

  const activeTab = ruleBody('.tab.active');
  assert.match(activeTab, /background:\s*var\(--tc-green\);/);

  const inputFocus = ruleBody('input:focus, select:focus');
  assert.match(inputFocus, /border-color:\s*var\(--tc-green\);/);

  const brandBar = ruleBody('.brand-bar');
  assert.match(brandBar, /var\(--tc-saffron\)/);

  const linkRule = ruleBody('.footer-version');
  assert.match(linkRule, /color:\s*var\(--tc-blue\);/);
});
