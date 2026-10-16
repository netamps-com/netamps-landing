/**
 * Feed validation rules, verified without network access.
 * Run: node tests/feed.test.mjs
 *
 * The helpers below are local copies of the pure validators in
 * functions/api/feed.js, so the rules stay pinned even if the
 * endpoint itself is unreachable.
 */

import assert from 'node:assert/strict';

// Local copies of the feed validators.
function isHttpUrl(value) {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function statusClass(status) {
  if (Number.isInteger(status) && status >= 200 && status < 300) return 'ok';
  if (Number.isInteger(status) && status >= 400 && status < 500) return 'warn';
  if (Number.isInteger(status) && status >= 500 && status < 600) return 'error';
  return 'unknown';
}

function isValidTitle(title) {
  return typeof title === 'string' && title.length > 0 && title.length <= 140;
}

function withinLimit(arr, max) {
  return Array.isArray(arr) && arr.length <= max;
}

function isValidRate(rate) {
  if (!rate || typeof rate !== 'object') return false;
  return (
    Number.isInteger(rate.perMinute) && rate.perMinute >= 1 && rate.perMinute <= 10000 &&
    Number.isInteger(rate.burst) && rate.burst >= 1 && rate.burst <= 1000 &&
    Number.isInteger(rate.retryMax) && rate.retryMax >= 0 && rate.retryMax <= 10
  );
}

function isValidFormat(format) {
  return format === 'json' || format === 'xml';
}

function isValidScroll(scroll) {
  return scroll === undefined || typeof scroll === 'boolean';
}

function scrollDefault(scroll) {
  return scroll !== false;
}

const MEDIA_KINDS = new Set(['none', 'image', 'video', 'file']);

function isValidMedia(kind, url) {
  if (!MEDIA_KINDS.has(kind)) return false;
  if (kind === 'none') return true;
  return isHttpUrl(url) && url.length <= 2000;
}

function isValidTickerEntry(e) {
  if (!e || typeof e !== 'object') return false;
  if (typeof e.text !== 'string' || e.text.length === 0 || e.text.length > 140) return false;
  if (typeof e.tag === 'string' && e.tag.length > 40) return false;
  if (typeof e.url === 'string' && e.url.length > 500) return false;
  return true;
}

function isServableSrc(src) {
  if (typeof src !== 'string' || src.length === 0) return false;
  if (/^https?:\/\/.+/i.test(src)) return true;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  return false;
}

function parseFeedDate(value) {
  if (typeof value !== 'string') return NaN;
  const v = value.trim();
  if (!v) return NaN;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    const hh = m[4] === undefined ? 0 : parseInt(m[4], 10);
    const mi = m[5] === undefined ? 0 : parseInt(m[5], 10);
    const ss = m[6] === undefined ? 0 : parseInt(m[6], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh <= 23 && mi <= 59 && ss <= 59) {
      return new Date(yyyy, mm - 1, dd, hh, mi, ss).getTime();
    }
  }
  const native = Date.parse(v);
  return Number.isFinite(native) ? native : NaN;
}

function isExpired(ts, nowMs) {
  const ms = parseFeedDate(ts);
  if (!Number.isFinite(ms)) return false;
  return ms <= nowMs;
}

let pass = 0, fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
    console.log('  pass ' + name);
  } catch (err) {
    fail++;
    console.log('  FAIL ' + name + ' — ' + err.message);
  }
}

console.log('\nisHttpUrl');
t('https accepted', () => assert.equal(isHttpUrl('https://example.com/hook'), true));
t('http accepted', () => assert.equal(isHttpUrl('http://localhost:3000/x'), true));
t('ftp rejected', () => assert.equal(isHttpUrl('ftp://example.com/x'), false));
t('protocol-relative rejected', () => assert.equal(isHttpUrl('//example.com/x'), false));
t('empty rejected', () => assert.equal(isHttpUrl(''), false));
t('non-string rejected', () => assert.equal(isHttpUrl(null), false));

console.log('\nclampInt');
t('in-range passes through', () => assert.equal(clampInt(60, 1, 10000, 60), 60));
t('below min clamps', () => assert.equal(clampInt(0, 1, 10000, 60), 1));
t('above max clamps', () => assert.equal(clampInt(99999, 1, 10000, 60), 10000));
t('non-numeric falls back', () => assert.equal(clampInt('abc', 1, 10000, 60), 60));
t('numeric string parses', () => assert.equal(clampInt('5', 1, 10, 0), 5));

console.log('\nstatusClass');
t('200 is ok', () => assert.equal(statusClass(200), 'ok'));
t('201 is ok', () => assert.equal(statusClass(201), 'ok'));
t('404 is warn', () => assert.equal(statusClass(404), 'warn'));
t('500 is error', () => assert.equal(statusClass(500), 'error'));
t('503 is error', () => assert.equal(statusClass(503), 'error'));
t('0 is unknown', () => assert.equal(statusClass(0), 'unknown'));
t('3xx is unknown', () => assert.equal(statusClass(302), 'unknown'));

console.log('\nitem title rule');
t('140 chars valid', () => assert.equal(isValidTitle('a'.repeat(140)), true));
t('141 chars invalid', () => assert.equal(isValidTitle('a'.repeat(141)), false));
t('empty invalid', () => assert.equal(isValidTitle(''), false));
t('non-string invalid', () => assert.equal(isValidTitle(42), false));

console.log('\narray limits');
t('12 items fit', () => assert.equal(withinLimit(new Array(12).fill({}), 12), true));
t('13 items exceed', () => assert.equal(withinLimit(new Array(13).fill({}), 12), false));
t('12 channels fit', () => assert.equal(withinLimit(new Array(12).fill({}), 12), true));
t('13 channels exceed', () => assert.equal(withinLimit(new Array(13).fill({}), 12), false));

console.log('\nrate ranges');
t('defaults valid', () => assert.equal(isValidRate({ perMinute: 60, burst: 10, retryMax: 3 }), true));
t('perMinute 0 invalid', () => assert.equal(isValidRate({ perMinute: 0, burst: 10, retryMax: 3 }), false));
t('perMinute 10000 valid', () => assert.equal(isValidRate({ perMinute: 10000, burst: 10, retryMax: 3 }), true));
t('perMinute 10001 invalid', () => assert.equal(isValidRate({ perMinute: 10001, burst: 10, retryMax: 3 }), false));
t('burst 1000 valid', () => assert.equal(isValidRate({ perMinute: 60, burst: 1000, retryMax: 3 }), true));
t('burst 1001 invalid', () => assert.equal(isValidRate({ perMinute: 60, burst: 1001, retryMax: 3 }), false));
t('retryMax 0 valid', () => assert.equal(isValidRate({ perMinute: 60, burst: 10, retryMax: 0 }), true));
t('retryMax 10 valid', () => assert.equal(isValidRate({ perMinute: 60, burst: 10, retryMax: 10 }), true));
t('retryMax 11 invalid', () => assert.equal(isValidRate({ perMinute: 60, burst: 10, retryMax: 11 }), false));

console.log('\nschema format');
t('json valid', () => assert.equal(isValidFormat('json'), true));
t('xml valid', () => assert.equal(isValidFormat('xml'), true));
t('yaml invalid', () => assert.equal(isValidFormat('yaml'), false));

console.log('\nscroll switch');
t('true valid', () => assert.equal(isValidScroll(true), true));
t('false valid', () => assert.equal(isValidScroll(false), true));
t('absent defaults on', () => assert.equal(scrollDefault(undefined), true));
t('explicit off stays off', () => assert.equal(scrollDefault(false), false));
t('string invalid', () => assert.equal(isValidScroll('yes'), false));

console.log('\nmedia attachments');
t('none needs no url', () => assert.equal(isValidMedia('none', ''), true));
t('image needs http url', () => assert.equal(isValidMedia('image', 'https://cdn.example.com/a.jpg'), true));
t('video needs http url', () => assert.equal(isValidMedia('video', 'https://cdn.example.com/a.mp4'), true));
t('file needs http url', () => assert.equal(isValidMedia('file', 'https://cdn.example.com/a.pdf'), true));
t('image rejects empty url', () => assert.equal(isValidMedia('image', ''), false));
t('video rejects javascript url', () => assert.equal(isValidMedia('video', 'javascript:alert(1)'), false));
t('unknown kind rejected', () => assert.equal(isValidMedia('audio', 'https://cdn.example.com/a.mp3'), false));

console.log('\nticker entries');
t('valid entry', () => assert.equal(isValidTickerEntry({ tag: 'ITAD', text: 'Pickup done', url: 'https://netamps.com/returns' }), true));
t('empty text invalid', () => assert.equal(isValidTickerEntry({ tag: 'ITAD', text: '', url: '' }), false));
t('141-char text invalid', () => assert.equal(isValidTickerEntry({ tag: 'x', text: 'a'.repeat(141), url: '' }), false));
t('non-object invalid', () => assert.equal(isValidTickerEntry(null), false));

console.log('\nservable sources (landing)');
t('https allowed', () => assert.equal(isServableSrc('https://cdn.example.com/a.jpg'), true));
t('same-origin cdn allowed', () => assert.equal(isServableSrc('/api/cdn/feed/abc123.jpg'), true));
t('protocol-relative rejected', () => assert.equal(isServableSrc('//evil.example.com/a.jpg'), false));
t('javascript rejected', () => assert.equal(isServableSrc('javascript:alert(1)'), false));
t('data uri rejected', () => assert.equal(isServableSrc('data:image/png;base64,AAA'), false));
t('bare relative rejected', () => assert.equal(isServableSrc('feed/a.jpg'), false));
t('empty rejected', () => assert.equal(isServableSrc(''), false));

console.log('\ndisplay-until dates');
const NOW = new Date('2026-10-17T12:00:00Z').getTime();
t('ISO past parses', () => assert.equal(Number.isFinite(parseFeedDate('2026-10-10T09:00:00Z')), true));
t('ISO future parses', () => assert.equal(Number.isFinite(parseFeedDate('2026-12-01T00:00:00Z')), true));
t('YYYY-MM-DD parses', () => assert.equal(Number.isFinite(parseFeedDate('2026-10-10')), true));
t('DD/MM/YYYY day-first', () => assert.equal(parseFeedDate('13/10/2026'), new Date(2026, 9, 13).getTime()));
t('DD-MM-YYYY with time', () => assert.equal(parseFeedDate('13-10-2026 09:30'), new Date(2026, 9, 13, 9, 30).getTime()));
t('ambiguous falls back US-style', () => assert.equal(parseFeedDate('10/13/2026'), Date.parse('10/13/2026')));
t('garbage is NaN', () => assert.equal(Number.isNaN(parseFeedDate('not a date')), true));
t('empty is NaN', () => assert.equal(Number.isNaN(parseFeedDate('')), true));
t('non-string is NaN', () => assert.equal(Number.isNaN(parseFeedDate(null)), true));
t('past date expired', () => assert.equal(isExpired('2026-10-10T09:00:00Z', NOW), true));
t('future date live', () => assert.equal(isExpired('2026-12-01T00:00:00Z', NOW), false));
t('past DD/MM/YYYY expired', () => assert.equal(isExpired('10/10/2026', NOW), true));
t('empty never expires', () => assert.equal(isExpired('', NOW), false));
t('garbage never expires', () => assert.equal(isExpired('soon-ish', NOW), false));

console.log(`\n${fail === 0 ? 'FEED_PASS' : 'FEED_FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
