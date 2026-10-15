import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toMinor, toMajor, lineTotalMinor, totalsMinor, maskIp } from './money.js';
import { scanEicar, scanExecutableMagic, decodeUtf8Strict } from './uploadScan.js';
import { scrubForLogs } from './sanitize.js';
import { parseCsv } from '../routes/import.js';

describe('money (minor-unit math)', () => {
  it('converts without float drift', () => {
    assert.equal(toMinor(19.99), 1999);
    assert.equal(toMajor(1999), 19.99);
  });
  it('line total = qty × unit', () => {
    assert.equal(lineTotalMinor({ selected_quantity: 3, unit_cost: 10.5 }), 3150);
  });
  it('totals apply tax on integers', () => {
    const t = totalsMinor([{ selected_quantity: 2, unit_cost: 100 }], 0.18);
    assert.deepEqual(t, { subtotal: 20000, tax: 3600, total: 23600 });
  });
  it('rejects bad input', () => {
    assert.throws(() => lineTotalMinor({ selected_quantity: -1, unit_cost: 5 }));
    assert.throws(() => totalsMinor([{ selected_quantity: 1, unit_cost: 1 }], 2));
  });
});

describe('ip masking (GDPR)', () => {
  it('masks last IPv4 octet', () => {
    assert.equal(maskIp('203.0.113.42'), '203.0.113.0');
  });
  it('truncates IPv6 to /64', () => {
    assert.equal(maskIp('2001:db8:abcd:12::1'), '2001:db8:abcd:12::/64');
  });
});

describe('upload scanning', () => {
  it('flags MZ executables', () => {
    const r = scanExecutableMagic(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]));
    assert.equal(r.clean, false);
  });
  it('flags EICAR', () => {
    const s = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    assert.equal(scanEicar(new TextEncoder().encode('xx' + s)).clean, false);
  });
  it('passes clean PNG header', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(scanExecutableMagic(png).clean, true);
  });
  it('rejects non-UTF8 and strips BOM', () => {
    assert.throws(() => decodeUtf8Strict(new Uint8Array([0xff, 0xfe])));
    assert.equal(decodeUtf8Strict(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), 'A');
  });
});

describe('log scrubber', () => {
  it('redacts bearer tokens and passwords', () => {
    const out = scrubForLogs({ authorization: 'Bearer abc123', password: 's3cret' });
    assert.ok(!out.includes('abc123') && !out.includes('s3cret'));
  });
});

describe('csv parser', () => {
  it('handles quoted commas', () => {
    const r = parseCsv('a,b\n"x,1",2', 10);
    assert.deepEqual(r.columns, ['a', 'b']);
    assert.deepEqual(r.data, [{ a: 'x,1', b: '2' }]);
  });
});
