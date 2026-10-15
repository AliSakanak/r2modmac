import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesProfileModStatus } from '../src/utils/profileModFilter.ts';

const state = { enabled: true, deprecated: false, outdated: true };

test('all lets every mod through', () => {
    assert.equal(matchesProfileModStatus('all', state), true);
    assert.equal(matchesProfileModStatus('all', { enabled: false, deprecated: true, outdated: false }), true);
});

test('enabled and disabled are opposites', () => {
    assert.equal(matchesProfileModStatus('enabled', state), true);
    assert.equal(matchesProfileModStatus('disabled', state), false);
    assert.equal(matchesProfileModStatus('disabled', { ...state, enabled: false }), true);
});

test('deprecated and outdated follow their own flag', () => {
    assert.equal(matchesProfileModStatus('deprecated', state), false);
    assert.equal(matchesProfileModStatus('deprecated', { ...state, deprecated: true }), true);
    assert.equal(matchesProfileModStatus('outdated', state), true);
    assert.equal(matchesProfileModStatus('outdated', { ...state, outdated: false }), false);
});
