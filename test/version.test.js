import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpVersion, isValidVersion } from '../scripts/version.mjs';

test('validates semantic versions and generates the next release version', () => {
  assert.equal(isValidVersion('1.0.0'), true);
  assert.equal(isValidVersion('1.0'), false);
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
});
