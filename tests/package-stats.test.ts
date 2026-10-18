import assert from 'node:assert/strict';
import test from 'node:test';

import { firstKnownCount, knownCount, knownSize } from '../src/utils/packageStats.ts';

test('a provider sending -1 or nothing has no known count', () => {
    assert.equal(knownCount(-1), null);
    assert.equal(knownCount(undefined), null);
    assert.equal(knownCount(null), null);
    assert.equal(knownCount(Number.NaN), null);
    assert.equal(knownCount('12'), null);
});

test('zero and positive counts are real', () => {
    assert.equal(knownCount(0), 0);
    assert.equal(knownCount(1520), 1520);
});

test('the first known count wins, skipping unknown ones', () => {
    assert.equal(firstKnownCount(-1, 40), 40);
    assert.equal(firstKnownCount(undefined, -1), null);
    assert.equal(firstKnownCount(0, 40), 0);
});

test('a size of zero bytes is unknown', () => {
    assert.equal(knownSize(0), null);
    assert.equal(knownSize(-1), null);
    assert.equal(knownSize(2048), 2048);
});
