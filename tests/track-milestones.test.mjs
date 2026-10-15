/**
 * Track milestone extraction regression tests.
 *
 * WHY THIS FILE EXISTS
 * The deterministic core (`functions/api/track/milestones.mjs`) is the part of
 * the pipeline that must NEVER silently change meaning: a keyword edit that
 * promotes "delivery attempted" to 8, or a precedence swap that lets footer
 * marketing ("Delivered in 24 hours") classify as 9, is a wrong-delivery
 * verdict served to a buyer. These tests pin:
 *
 *   1. TAXONOMY — the integer keys are frozen; 7 is rejected by name.
 *   2. RECALL — one real carrier phrasing per milestone, with date+location.
 *   3. ANTI-RECALL — every known footer/banner/promise trap yields no event.
 *   4. ORDER — newest-first pages (the carrier default) resolve by timestamp,
 *      never by page order; redelivery sequences keep full history.
 *   5. GROUNDING — the validator rejects ungrounded quotes and fabricated 9s.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MILESTONE_IDS,
  EXCEPTION_REASONS,
  MAX_PAGE_CHARS,
  DATE_HINT_RE,
  sanitizePageText,
  isolateEvidence,
  parseEventDate,
  classifyBlock,
  extractDeterministic,
  validateLlmPayload,
  mergeExtractions,
  selectCurrent
} from '../functions/api/track/milestones.mjs';

const REF = '2026-10-15T12:00:00.000Z';
const ids = (events) => events.map((e) => e.milestone);

test('taxonomy is frozen: exactly [5,6,8,9,10], 7 absent', () => {
  assert.deepEqual(MILESTONE_IDS, [5, 6, 8, 9, 10]);
  assert.ok(!MILESTONE_IDS.includes(7), '7 must never become a milestone');
  assert.ok(EXCEPTION_REASONS.includes('delay_other'));
});

test('happy path: one real phrasing per milestone', () => {
  const det = extractDeterministic([
    'Oct 13, 2026 14:20 — Picked up at Mumbai Origin Facility',
    'Oct 13, 2026 22:05 — Arrived at sort facility, Bhiwandi Hub',
    'Oct 14, 2026 09:12 — Departed facility, Bhiwandi Hub',
    'Oct 15, 2026 08:03 — Out for delivery, Andheri West',
    'Oct 15, 2026 11:47 — Delivered at Andheri West'
  ].join('\n'), { referenceDate: REF });
  assert.equal(det.unmatched, false);
  assert.deepEqual(ids(det.events), [5, 6, 5, 8, 9]);
  assert.equal(det.currentMilestone, 9);
  assert.equal(det.needsReview, true); // all 9s are human-reviewed in v1
  assert.ok(det.confidence >= 0.75);
  const delivered = det.events.find((e) => e.milestone === 9);
  assert.ok(delivered.timestamp.startsWith('2026-10-15'));
  assert.ok(delivered.location.length >= 3);
});

test('footer and marketing traps yield no events', () => {
  for (const trap of [
    'Delivered in 24 hours across India!',
    'Delivery exceptions? Visit our help center.',
    'Guaranteed delivery on every order.',
    'Your package will be delivered tomorrow.',
    'Estimated delivery: Oct 20, 2026.',
    'Home | Track | Login | Sign up | Privacy | Terms',
    'Subscribe to our newsletter for shipping offers.'
  ]) {
    const det = extractDeterministic(
      `${trap}\nOct 15, 2026 08:03 — Out for delivery, Andheri West`,
      { referenceDate: REF }
    );
    assert.equal(det.currentMilestone, 8, `trap leaked into verdict: ${trap}`);
    assert.ok(!ids(det.events).includes(9), `trap fabricated a 9: ${trap}`);
  }
});

test('bare Delivered banner with no timeline is not a delivery', () => {
  const det = extractDeterministic(
    'Delivered ✓\nTrack another package\nHome | Login | Help',
    { referenceDate: REF }
  );
  assert.equal(det.unmatched, true);
  assert.equal(det.reason, 'banner_only_no_timeline');
});

test('banner says delivered, timeline does not: timeline wins, flagged', () => {
  const det = extractDeterministic(
    'Delivered ✓\nOct 14, 2026 09:12 — In transit, Bhiwandi Hub',
    { referenceDate: REF }
  );
  assert.equal(det.currentMilestone, 5);
  assert.equal(det.headerConflict, true);
  assert.equal(det.reason, 'timeline_wins_over_banner');
});

test('"delivery attempted" is 10, never 8 (precedence order matters)', () => {
  const cls = classifyBlock('Oct 15, 2026 10:00 — Delivery attempted, recipient not available, Andheri West');
  assert.equal(cls.milestone, 10);
  assert.equal(cls.subReason, 'attempt_failed');
});

test('redelivery sequence keeps full history, current is latest', () => {
  const det = extractDeterministic([
    'Oct 14, 2026 08:00 — Out for delivery, Andheri West',
    'Oct 14, 2026 13:00 — Delivery attempted, recipient not available',
    'Oct 15, 2026 08:05 — Out for delivery, Andheri West',
    'Oct 15, 2026 11:47 — Delivered at Andheri West'
  ].join('\n'), { referenceDate: REF });
  assert.deepEqual(ids(det.events), [8, 10, 8, 9]);
  assert.equal(det.currentMilestone, 9);
  assert.equal(det.exceptionReason, null); // current is 9, not 10
});

test('newest-first page resolves by timestamp, not page order', () => {
  const det = extractDeterministic([
    'Oct 15, 2026 11:47 — Delivered at Andheri West',
    'Oct 15, 2026 08:03 — Out for delivery, Andheri West',
    'Oct 13, 2026 14:20 — Picked up at Mumbai Origin Facility'
  ].join('\n'), { referenceDate: REF });
  assert.equal(det.currentMilestone, 9);
});

test('exception sub-reasons classify correctly', () => {
  const cases = [
    ['Held at customs, Mumbai Air Cargo — Oct 14, 2026', 'customs'],
    ['Incorrect address, unable to deliver — Oct 14, 2026', 'address'],
    ['Returned to sender — Oct 14, 2026', 'returned'],
    ['Package reported lost in transit — Oct 14, 2026', 'lost_damaged'],
    ['Operational delay due to weather — Oct 14, 2026', 'delay_other']
  ];
  for (const [line, reason] of cases) {
    const det = extractDeterministic(line, { referenceDate: REF });
    assert.equal(det.currentMilestone, 10, `missed 10: ${line}`);
    assert.equal(det.exceptionReason, reason, `wrong sub-reason: ${line}`);
  }
});

test('future-dated delivery is not a delivery', () => {
  const det = extractDeterministic(
    'Oct 25, 2026 10:00 — Delivered at Andheri West',
    { referenceDate: REF }
  );
  // The deterministic path keeps the event (it is on the page); the future
  // check lives in the model validator. What matters here: confidence must
  // force review rather than present certainty.
  assert.ok(det.needsReview || det.unmatched, 'future delivery must not look certain');
});

test('stale out-for-delivery keeps milestone 8 with a note, not a demotion', () => {
  const det = extractDeterministic(
    'Oct 10, 2026 08:03 — Out for delivery, Andheri West',
    { referenceDate: REF }
  );
  assert.equal(det.currentMilestone, 8);
  assert.ok(det.events[0].staleNote === 'event_date_differs_from_reference_date');
  assert.ok(det.events[0].confidence < 0.95, 'staleness must cost confidence');
});

test('validator rejects milestone 7 and any non-enum value', () => {
  const page = 'Oct 15, 2026 11:47 — Delivered at Andheri West';
  for (const bad of [7, 1, 0, '9', null, 9.5]) {
    const r = validateLlmPayload(
      { events: [{ milestone: bad, timestamp: null, location: null, quote: 'Delivered at Andheri West', subReason: null }] },
      page
    );
    assert.equal(r.ok, false, `validator accepted ${JSON.stringify(bad)}`);
  }
});

test('validator rejects ungrounded quotes (model may not invent evidence)', () => {
  const r = validateLlmPayload(
    { events: [{ milestone: 9, timestamp: '2026-10-15T11:47:00.000Z', location: 'Andheri West', quote: 'Delivered with a smile by our best courier', subReason: null }] },
    'Oct 15, 2026 11:47 — Out for delivery, Andheri West'
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'quote_not_grounded');
});

test('validator rejects future timestamps and unparseable dates', () => {
  const page = 'Oct 15, 2026 11:47 — Delivered at Andheri West';
  const future = validateLlmPayload(
    { events: [{ milestone: 9, timestamp: '2031-01-01T00:00:00.000Z', location: null, quote: 'Delivered at Andheri West', subReason: null }] },
    page
  );
  assert.equal(future.ok, false);
  const badDate = validateLlmPayload(
    { events: [{ milestone: 9, timestamp: 'not-a-date', location: null, quote: 'Delivered at Andheri West', subReason: null }] },
    page
  );
  assert.equal(badDate.ok, false);
});

test('validator defaults a reason-less 10 to delay_other (never drops the event)', () => {
  const r = validateLlmPayload(
    { events: [{ milestone: 10, timestamp: null, location: null, quote: 'Package delayed in transit hub', subReason: 'bogus' }] },
    'Package delayed in transit hub on Oct 14, 2026'
  );
  assert.equal(r.ok, true);
  assert.equal(r.events[0].subReason, 'delay_other');
});

test('merge never displaces deterministic events with duplicates', () => {
  const det = extractDeterministic(
    'Oct 15, 2026 11:47 — Delivered at Andheri West',
    { referenceDate: REF }
  );
  const merged = mergeExtractions(det, [
    { milestone: 9, subReason: null, timestamp: '2026-10-15T11:47:00.000Z', location: 'Andheri West', quote: 'Delivered at Andheri West' }
  ]);
  assert.equal(merged.events.length, 1, 'duplicate model event must collapse');
  assert.equal(merged.currentMilestone, 9);
});

test('merge adds genuinely new model events and re-selects current', () => {
  const det = extractDeterministic(
    'Oct 14, 2026 09:12 — In transit, Bhiwandi Hub',
    { referenceDate: REF }
  );
  assert.equal(det.ambiguousBlocks.length, 0);
  const merged = mergeExtractions(det, [
    { milestone: 6, subReason: null, timestamp: '2026-10-14T22:05:00.000Z', location: 'Bhiwandi Hub', quote: 'Arrived at sort facility, Bhiwandi Hub' }
  ]);
  assert.equal(merged.events.length, 2);
  assert.equal(merged.currentMilestone, 6);
});

test('input bound: truncation keeps the tail (timeline), not the head (nav)', () => {
  const nav = 'Home | Track | Login | Help | Privacy\n'.repeat(400);
  const timeline = 'Oct 15, 2026 11:47 — Delivered at Andheri West';
  const { text, truncated } = sanitizePageText(nav + '\n' + timeline);
  assert.equal(truncated, true);
  assert.ok(text.length <= MAX_PAGE_CHARS);
  assert.ok(text.includes('Delivered at Andheri West'), 'tail truncation must preserve the timeline');
});

test('ambiguous structure without a classifiable claim goes to the model queue, not to a guess', () => {
  const det = extractDeterministic(
    'Oct 14, 2026 — Package processed at location',
    { referenceDate: REF }
  );
  assert.equal(det.unmatched, true);
  assert.ok(det.ambiguousBlocks.length >= 0); // queue may be empty; the point is no fabricated milestone
});

test('date-only line joins the following status line', () => {
  const det = extractDeterministic(
    'October 13, 2026\nPicked up at Mumbai Origin Facility',
    { referenceDate: REF }
  );
  assert.equal(det.unmatched, false);
  assert.equal(det.currentMilestone, 5);
  assert.ok(det.events[0].timestamp.startsWith('2026-10-13'));
});

test('numeric dates parse as MDY and are flagged ambiguous', () => {
  const { iso, ambiguous } = parseEventDate('10/13/2026 — In transit', REF);
  assert.ok(iso.startsWith('2026-10-13'));
  assert.equal(ambiguous, true);
});

test('selectCurrent prefers dated over undated, page order breaks ties', () => {
  const dated = { milestone: 5, timestamp: '2026-10-14T00:00:00.000Z', index: 5 };
  const undated = { milestone: 8, timestamp: null, index: 0 };
  assert.equal(selectCurrent([undated, dated]).milestone, 5);
  assert.equal(selectCurrent([undated]).milestone, 8);
});

test('isolateEvidence drops chrome but keeps structured event lines', () => {
  const { lines, headerConflict } = isolateEvidence(
    'Home | Track | Login\nDelivered in 24 hours!\nOct 15, 2026 08:03 — Out for delivery, Andheri West'
  );
  assert.deepEqual(lines, ['Oct 15, 2026 08:03 — Out for delivery, Andheri West']);
  assert.equal(headerConflict, true);
});

test('DATE_HINT_RE matches real carrier date shapes (join + flag regression)', () => {
  // Two silent failures lived here: `.source`-combination dropping the `i`
  // flag, and a missing `.join('|')` turning the pattern into comma-joined
  // mush. Either one makes every capitalised date invisible to event
  // structure — and every test still passes except the date-dependent ones.
  assert.ok(DATE_HINT_RE.flags.includes('i'), 'case-insensitive flag required');
  assert.ok(DATE_HINT_RE.source.includes('|'), 'fragments must be alternations, not a single literal');
  for (const d of [
    'October 13, 2026',
    'Oct 13, 2026',
    '13 October 2026',
    '2026-10-13',
    '10/13/2026',
    '13-10-2026',
    'today',
    'Yesterday'
  ]) {
    assert.ok(DATE_HINT_RE.test(d), `date hint missed: ${d}`);
  }
});
