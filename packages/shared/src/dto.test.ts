/**
 * Money is integer satang everywhere. These tests exist because the failure
 * mode is silent: a rounding bug does not throw, it just makes a seller's
 * totals disagree with their own arithmetic, which they notice immediately.
 */
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { formatSatang, parseBahtToSatang } from './dto.ts';

describe('parseBahtToSatang', () => {
  test('parses whole baht', () => {
    assert.equal(parseBahtToSatang('45'), 4500);
  });

  test('parses one and two decimal places', () => {
    assert.equal(parseBahtToSatang('12.3'), 1230);
    assert.equal(parseBahtToSatang('12.30'), 1230);
    assert.equal(parseBahtToSatang('12.34'), 1234);
  });

  test('parses zero', () => {
    assert.equal(parseBahtToSatang('0'), 0);
    assert.equal(parseBahtToSatang('0.05'), 5);
  });

  test('tolerates thousands separators and surrounding space', () => {
    assert.equal(parseBahtToSatang(' 1,250.00 '), 125000);
  });

  test('refuses more than two decimal places rather than rounding', () => {
    // Silently rounding 12.345 would make the seller's stated price and the
    // stored price differ without anyone being told.
    assert.equal(parseBahtToSatang('12.345'), null);
  });

  test('refuses non-money input', () => {
    for (const bad of ['', 'abc', '-5', '1.2.3', '12,', '๔๕']) {
      assert.equal(parseBahtToSatang(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});

describe('formatSatang', () => {
  test('always shows two decimal places', () => {
    assert.equal(formatSatang(0), '0.00');
    assert.equal(formatSatang(5), '0.05');
    assert.equal(formatSatang(1230), '12.30');
    assert.equal(formatSatang(4500), '45.00');
  });

  test('round-trips with parseBahtToSatang', () => {
    for (const satang of [0, 1, 5, 99, 100, 1234, 45000, 404000, 12345678]) {
      assert.equal(
        parseBahtToSatang(formatSatang(satang).replace(/,/g, '')),
        satang,
        `round trip failed for ${satang}`,
      );
    }
  });
});
