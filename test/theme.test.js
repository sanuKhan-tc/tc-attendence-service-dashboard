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
  assert.match(activeNav, /border-bottom-color:\s*var\(--tc-saffron\);/);
  assert.match(activeNav, /color:\s*var\(--tc-green\);/);

  const activeTab = ruleBody('.tab.active');
  assert.match(activeTab, /background:\s*var\(--tc-saffron\);/);
  assert.match(activeTab, /color:\s*#ffffff;/);

  const inactiveTab = ruleBody('.tab');
  assert.match(inactiveTab, /background:\s*var\(--tc-bg\);/);
  assert.match(inactiveTab, /color:\s*var\(--tc-text-secondary\);/);
  assert.match(inactiveTab, /display:\s*inline-flex;/);

  const inputFocus = ruleBody('input:focus, select:focus');
  assert.match(inputFocus, /border-color:\s*var\(--tc-green\);/);

  const brandBar = ruleBody('.brand-bar');
  assert.match(brandBar, /var\(--tc-saffron\)/);

  const linkRule = ruleBody('.footer-version');
  assert.match(linkRule, /color:\s*var\(--tc-blue\);/);
});

function hexToLuminance(hex) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const lumA = hexToLuminance(hexA);
  const lumB = hexToLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseTopLevelCss(css) {
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
  const tokens = new Map();
  for (const [, name, value] of (rules.get(':root') ?? '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens.set(name, value.trim());
  }
  const resolveColor = (value) => {
    const trimmed = value.trim();
    const varMatch = trimmed.match(/^var\((--[a-z0-9-]+)\)$/i);
    const resolved = varMatch ? tokens.get(varMatch[1]) : trimmed;
    assert.ok(resolved && /^#[0-9a-f]{3,6}$/i.test(resolved), `Expected resolvable hex color, got "${value}" -> "${resolved}"`);
    return resolved;
  };
  const propHex = (selector, prop) => {
    const body = rules.get(selector);
    assert.ok(body, `Expected CSS rule for "${selector}"`);
    const match = body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`, 'i'));
    assert.ok(match, `Expected "${prop}" in "${selector}"`);
    return resolveColor(match[1]);
  };
  return { rules, tokens, resolveColor, propHex };
}

test('maintains WCAG AA contrast (>= 4.5:1) for Saffron text tokens on all backgrounds', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const { propHex, resolveColor } = parseTopLevelCss(css);

  const saffronSoft = resolveColor('var(--tc-saffron-soft)');
  const pageBg = resolveColor('var(--tc-bg)');
  const cardBg = resolveColor('var(--tc-surface)');

  assert.ok(contrastRatio(propHex('.late-status', 'color'), saffronSoft) >= 4.5);
  assert.ok(contrastRatio(propHex('.metric-pill-alert', 'color'), saffronSoft) >= 4.5);
  assert.ok(contrastRatio(propHex('.hero-eyebrow', 'color'), pageBg) >= 4.5);
  assert.ok(contrastRatio(propHex('.hero-eyebrow', 'color'), cardBg) >= 4.5);
  assert.ok(contrastRatio(propHex('.changelog-entry time', 'color'), cardBg) >= 4.5);
});

test('maintains WCAG AA contrast (>= 4.5:1) for secondary small text on tinted surfaces', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const { propHex, resolveColor } = parseTopLevelCss(css);

  const blueSoft = resolveColor('var(--tc-blue-soft)');
  const saffronSoft = resolveColor('var(--tc-saffron-soft)');
  const greenSoft = resolveColor('var(--tc-green-soft)');
  const criticalHoverBg = propHex('.flagged-row-critical:hover', 'background');
  const comboboxActiveBg = propHex('.combobox-option.active', 'background');

  assert.ok(contrastRatio(propHex('.calendar-day.has-attendance small', 'color'), blueSoft) >= 4.5);
  assert.ok(contrastRatio(propHex('.flagged-row-critical .employee-cell small', 'color'), saffronSoft) >= 4.5);
  assert.ok(contrastRatio(propHex('.flagged-row-critical .employee-cell small', 'color'), criticalHoverBg) >= 4.5);
  assert.ok(contrastRatio(propHex('.combobox-option.active .combobox-option-text small, .combobox-option.selected .combobox-option-text small', 'color'), greenSoft) >= 4.5);
  assert.ok(contrastRatio(propHex('.combobox-option.active .combobox-option-text small, .combobox-option.selected .combobox-option-text small', 'color'), comboboxActiveBg) >= 4.5);
});

test('maintains WCAG 1.4.11 non-text contrast (>= 3.0:1) for Early checkout amber graphics', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const { resolveColor } = parseTopLevelCss(css);

  const amber = resolveColor('var(--tc-amber)');
  const trackBg = resolveColor('var(--tc-border)');
  const amberSoft = resolveColor('var(--tc-amber-soft)');

  assert.ok(contrastRatio(amber, trackBg) >= 3.0, `Expected amber ${amber} vs track ${trackBg} >= 3.0`);
  assert.ok(contrastRatio(amber, amberSoft) >= 3.0, `Expected amber ${amber} vs soft ${amberSoft} >= 3.0`);
});

test('keeps selected combobox avatar visually distinct from the selected option background', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const { propHex } = parseTopLevelCss(css);

  const optionBg = propHex('.combobox-option.selected', 'background');
  const avatarSel = '.combobox-option.active .combobox-avatar, .combobox-option.selected .combobox-avatar';
  const avatarBg = propHex(avatarSel, 'background');
  const avatarColor = propHex(avatarSel, 'color');

  assert.ok(contrastRatio(avatarBg, optionBg) >= 3.0, `Expected avatar bg ${avatarBg} vs option bg ${optionBg} >= 3.0`);
  assert.ok(contrastRatio(avatarColor, avatarBg) >= 4.5, `Expected avatar text ${avatarColor} vs avatar bg ${avatarBg} >= 4.5`);
});

test('lets .login-card h1 scale down with mobile heading rules', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const { rules } = parseTopLevelCss(css);
  const desktopLoginH1 = rules.get('.login-card h1') ?? '';

  assert.doesNotMatch(desktopLoginH1, /font-size\s*:/i, '.login-card h1 should inherit h1, h2 sizing so @media (max-width: 560px) scales it');
});

test('styles the three overview KPI cards with the three brand colors, saffron side-bordered filter card, and compact icon-bg-free layout', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const { rules, propHex } = parseTopLevelCss(css);

  const overviewAccents = new Set([
    propHex('.late-card', '--accent').toLowerCase(),
    propHex('.early-card', '--accent').toLowerCase(),
    propHex('.hours-card', '--accent').toLowerCase(),
  ]);
  assert.deepEqual(
    [...overviewAccents].sort(),
    ['#2b2b6b', '#2c5b32', '#e74c2d'],
    'The three overview KPI cards should use the three brand theme colors (#E74C2D, #2B2B6B, #2C5B32)',
  );

  const filterCard = rules.get('.filter-card') ?? '';
  assert.doesNotMatch(filterCard, /border-bottom\s*:/i);
  assert.match(filterCard, /border-left:\s*4px\s+solid\s+var\(--tc-saffron\);/i);

  const summaryCard = rules.get('.summary-card') ?? '';
  assert.doesNotMatch(summaryCard, /min-height\s*:/i, '.summary-card should not force excess vertical negative space via min-height');
  assert.match(summaryCard, /display:\s*grid;/i);
  assert.match(summaryCard, /grid-template-columns:\s*1fr\s+auto;/i);

  const summaryIcon = rules.get('.summary-icon') ?? '';
  assert.match(summaryIcon, /background:\s*transparent;/i);
  assert.doesNotMatch(summaryIcon, /var\(--accent-bg\)/i);

  const summaryHeading = rules.get('.summary-heading') ?? '';
  assert.match(summaryHeading, /font-size:\s*18px;/);
  assert.match(summaryHeading, /font-weight:\s*700;/);

  const summaryValue = rules.get('.summary-card strong') ?? '';
  assert.match(summaryValue, /margin-top:\s*0;/);
  assert.match(summaryValue, /font-size:\s*28px;/);

  const summaryCaption = rules.get('.summary-card small') ?? '';
  assert.match(summaryCaption, /grid-column:\s*1\s*\/\s*-1;/);
  assert.match(summaryCaption, /margin-top:\s*0;/);
});

test('renders the Not logged out / In office pill without a gray metric-pill wrapper', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
  assert.doesNotMatch(
    app,
    /className=\{`metric-pill[^`]*`\}[^>]*>[^<]*\{row\.lastOut \? [^}]+<span className="in-office">/,
    'In office / Not logged out pill should not be nested inside a gray .metric-pill wrapper',
  );
  assert.match(
    app,
    /row\.lastOut \? \(?\s*<span className=\{`metric-pill/,
  );
});

test('defines smooth, unhurried CSS motion tokens, gentle button clicks, and page/tab/content transitions with reduced-motion support', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
  const { rules, tokens } = parseTopLevelCss(css);

  assert.equal(tokens.get('--ease-out'), 'cubic-bezier(0.4, 0, 0.2, 1)');
  assert.ok(parseInt(tokens.get('--duration-fast') ?? '0', 10) >= 200, 'Fast transitions should be >= 200ms for smooth feel');
  assert.ok(parseInt(tokens.get('--duration-base') ?? '0', 10) >= 320, 'Base transitions should be >= 320ms for smooth feel');
  assert.ok(parseInt(tokens.get('--duration-page') ?? '0', 10) >= 420, 'Page transitions should be >= 420ms for smooth feel');

  for (const keyframe of ['tc-fade-up', 'tc-fade-in', 'tc-pop-in', 'tc-bar-grow', 'tc-fill-grow']) {
    assert.match(css, new RegExp(`@keyframes\\s+${keyframe}\\b`), `Expected @keyframes ${keyframe}`);
  }

  assert.match(rules.get('.page-transition') ?? '', /animation:\s*tc-fade-up\b/);
  assert.match(rules.get('.content-fade') ?? '', /animation:\s*tc-fade-in\b/);
  assert.match(rules.get('.content-rise') ?? '', /animation:\s*tc-fade-up\b/);
  assert.match(rules.get('.combobox-popover') ?? '', /animation:\s*tc-pop-in\b/);
  assert.match(css, /:active[^{]*\{[^}]*transform:\s*scale\(0\.985\)/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none\s*!important;/);

  assert.match(app, /<div className="page-transition" key=\{page\}>/);
  assert.match(app, /<tbody className="content-fade" key=\{`\$\{tab\}-\$\{pagination\.page\}-\$\{state\}`\}>/);
  assert.match(app, /className="calendar-grid calendar-days content-fade" key=\{month\}/);
});

test('renders flagged table toolbar without heading, saffron circular reset button, consistent blue export button, and flat shadow-free chrome', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'App.jsx'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const { rules, tokens } = parseTopLevelCss(css);

  assert.doesNotMatch(app, /<h2>Flagged staff<\/h2>/);
  assert.match(app, /className="flagged-toolbar"/);
  assert.match(app, /function FlagIcon\(/);
  assert.match(app, /<FlagIcon \/>[\s\S]*?<LateIcon \/>[\s\S]*?<EarlyIcon \/>[\s\S]*?<HoursIcon \/>/);
  assert.doesNotMatch(app, /Export Excel/);
  assert.doesNotMatch(app, /export-button-icon/);
  assert.match(app, /className="export-button"[\s\S]*?<ExportIcon \/>[\s\S]*?Export/);
  assert.match(app, /className="icon-reset-button"[^>]*aria-label="Reset filters"[^>]*><ResetIcon \/><\/button>/);

  const resetIconBtn = rules.get('.icon-reset-button') ?? '';
  assert.match(resetIconBtn, /border-radius:\s*50%;/);
  assert.match(resetIconBtn, /background:\s*var\(--tc-saffron\);/);
  assert.match(resetIconBtn, /color:\s*#ffffff;/);
  assert.doesNotMatch(resetIconBtn, /box-shadow\s*:/i);

  const exportBtn = rules.get('.export-button') ?? '';
  assert.match(exportBtn, /background:\s*var\(--tc-blue\);/);
  assert.match(exportBtn, /color:\s*#ffffff;/);
  assert.doesNotMatch(exportBtn, /box-shadow\s*:/i);

  assert.equal(tokens.get('--tc-shadow-sm'), 'none');
  assert.equal(tokens.get('--tc-shadow-md'), 'none');
  assert.equal(tokens.get('--tc-shadow-green'), 'none');
  assert.doesNotMatch(rules.get('.top-header') ?? '', /box-shadow\s*:/i);
  assert.doesNotMatch(rules.get('.tab.active') ?? '', /box-shadow\s*:/i);
  assert.doesNotMatch(rules.get('.combobox-popover') ?? '', /box-shadow\s*:/i);
});

test('uses neutral tabbed table header, dim saffron late icon bg, uniform rounded card corners, and rounded-square avatars', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const { rules } = parseTopLevelCss(css);

  const flaggedHeader = rules.get('.flagged-table thead th') ?? '';
  assert.doesNotMatch(flaggedHeader, /background:\s*var\(--tc-saffron\);/);
  assert.match(flaggedHeader, /box-shadow:\s*0\s+1px\s+0\s+var\(--tc-border\);/);

  const lateIcon = rules.get('.late-card .summary-icon') ?? '';
  assert.match(lateIcon, /background:\s*var\(--tc-saffron-soft\);/);

  assert.match(rules.get('.summary-card') ?? '', /border-radius:\s*16px;/);
  assert.match(rules.get('.calendar-card') ?? '', /border-radius:\s*16px;/);
  assert.match(rules.get('.chart-card') ?? '', /border-radius:\s*16px;/);
  assert.match(rules.get('.avatar') ?? '', /border-radius:\s*10px;/);
  assert.match(rules.get('.skeleton-avatar') ?? '', /border-radius:\s*10px;/);
  assert.doesNotMatch(css, /border-radius:\s*0\s+\d+px\s+0\s+\d+px;/, 'No asymmetric sharp-corner card/avatar radii should remain');
});
