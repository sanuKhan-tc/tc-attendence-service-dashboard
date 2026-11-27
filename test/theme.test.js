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
