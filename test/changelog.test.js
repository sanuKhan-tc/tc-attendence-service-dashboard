import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLog } from '../scripts/generate-changelog.mjs';

test('parses dated git subjects for the changelog page', () => {
  assert.deepEqual(parseGitLog([
    'abcdef1234567890\t2026-11-20\tAdd changelog page',
    '1234567890abcdef\t2026-11-19\tFix export pagination',
  ].join('\n')), [
    { hash: 'abcdef1234567890', shortHash: 'abcdef1', date: '2026-11-20', message: 'Add changelog page' },
    { hash: '1234567890abcdef', shortHash: '1234567', date: '2026-11-19', message: 'Fix export pagination' },
  ]);
});
