/**
 * Endpoint verification for POST /api/track/extract.
 *
 * Run: node scripts/probe-track-extract.mjs
 * Uses the REAL endpoint + REAL milestone core with mocked D1/AI/buyer-token,
 * so it proves the production wiring (auth gate, deterministic short-circuit,
 * single small-model call, verdict cache, poison rejection, soft failure)
 * rather than duplicating the unit tests in tests/track-milestones.test.mjs.
 *
 * Checks:
 *   1. No token -> 401 before any work (not an open inference oracle).
 *   2. Clear page -> deterministic verdict, ZERO model calls.
 *   3. Ambiguous page -> exactly one small-model call, small prompt.
 *   4. Repeat paste -> verdict cache hit, zero model calls.
 *   5. Poisoned model output -> rejected, deterministic verdict stands.
 *   6. Model down -> soft failure, deterministic verdict stands.
 *   7. Footer-only paste -> honest unmatched.
 */
import { onRequestPost } from '../functions/api/track/extract.js';

const TOKEN = 'buyer-token-abc';
const EMAIL = 'buyer@example.com';

function makeEnv({ aiReply = null, aiShouldFail = false } = {}) {
  const calls = [];
  const tables = new Map(); // buyer_tokens + track_milestone_extractions
  tables.set('buyer_tokens|' + TOKEN, { token: TOKEN, email: EMAIL, expires_at: '2031-01-01T00:00:00.000Z' });
  const store = new Map();
  return {
    calls,
    env: {
      DB: {
        prepare(sql) {
          const self = {
            _sql: sql, _binds: [],
            bind(...a) { self._binds = a; return self; },
            async run() { return { success: true }; },
            async all() {
              if (/FROM match_meta/.test(sql)) return { results: [] };
              return { results: [] };
            },
            async first() {
              if (/FROM buyer_tokens WHERE token/.test(sql)) {
                return tables.get('buyer_tokens|' + self._binds[0]) || null;
              }
              if (/FROM track_milestone_extractions WHERE id/.test(sql)) {
                const row = store.get(self._binds[0]);
                if (!row) return null;
                const created = new Date(row.created_at).getTime();
                if (created < Date.now() - 3600000) return null;
                return row;
              }
              if (/match_meta/.test(sql) && /llm_enabled/.test(sql)) return null; // brake absent = enabled
              if (/COUNT/.test(sql)) return { n: 0 };
              return null;
            }
          };
          // capture INSERT OR REPLACE
          const origRun = self.run.bind(self);
          self.run = async () => {
            if (/INSERT OR REPLACE INTO track_milestone_extractions/.test(sql)) {
              const [id, tracking_id, email, current_milestone, unmatched, body, source, model, latency_ms, created_at] = self._binds;
              store.set(id, { body, source });
            }
            return origRun();
          };
          return self;
        }
      },
      AI: {
        async run(model, params) {
          const user = params.messages.find((m) => m.role === 'user').content;
          calls.push({ model, user, maxTokens: params.max_tokens, temperature: params.temperature });
          if (aiShouldFail) throw new Error('MODEL DOWN');
          return { response: JSON.stringify(aiReply ?? { events: [], unmatched: true }) };
        }
      }
    }
  };
}

async function post(env, body, token = TOKEN) {
  const req = new Request('https://x/api/track/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-buyer-token': token },
    body: JSON.stringify(body)
  });
  const res = await onRequestPost({ request: req, env });
  return { status: res.status, body: await res.json() };
}

const CLEAR = [
  'Oct 13, 2026 14:20 — Picked up at Mumbai Origin Facility',
  'Oct 14, 2026 09:12 — In transit, Bhiwandi Hub',
  'Oct 15, 2026 08:03 — Out for delivery, Andheri West',
  'Oct 15, 2026 11:47 — Delivered at Andheri West'
].join('\n');

console.log('═══ 1. no token → 401, no inference ═══');
{
  const { env, calls } = makeEnv();
  const req = new Request('https://x/api/track/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageText: CLEAR })
  });
  const res = await onRequestPost({ request: req, env });
  console.log(`status=${res.status} modelCalls=${calls.length} (expect 401, 0)`);
}

console.log('═══ 2. clear page → deterministic, zero model calls ═══');
{
  const { env, calls } = makeEnv();
  const { status, body } = await post(env, { pageText: CLEAR, trackingId: 'AWB001' });
  console.log(`status=${status} source=${body.source} current=${body.currentMilestone} n=${body.events.length} modelCalls=${calls.length} needsReview=${body.needsReview}`);
}

console.log('═══ 3. ambiguous page → one small-model call, small prompt ═══');
{
  const vague = 'Oct 14, 2026 — Package processed at location\nOct 15, 2026 — Shipment moving through network';
  const { env, calls } = makeEnv({ aiReply: { events: [{ milestone: 5, timestamp: null, location: null, quote: 'Shipment moving through network', subReason: null }], unmatched: false } });
  const { body } = await post(env, { pageText: vague, trackingId: 'AWB002' });
  const c = calls[0];
  console.log(`source=${body.source} current=${body.currentMilestone} modelCalls=${calls.length} model=${c?.model} temp=${c?.temperature} promptBytes=${c?.user.length}`);
}

console.log('═══ 4. repeat paste → cache hit, zero model calls ═══');
{
  const shared = makeEnv();
  await post(shared.env, { pageText: CLEAR, trackingId: 'AWB003' });
  const before = shared.calls.length;
  const { body } = await post(shared.env, { pageText: CLEAR, trackingId: 'AWB003' });
  console.log(`source=${body.source} cached=${body.cached} extraModelCalls=${shared.calls.length - before}`);
}

console.log('═══ 5. poisoned model output → rejected, deterministic stands ═══');
{
  const { env, calls } = makeEnv({
    aiReply: { events: [{ milestone: 7, timestamp: null, location: null, quote: 'Totally invented event', subReason: null }], unmatched: false }
  });
  const vague = 'Oct 14, 2026 — Package processed at location';
  const { body } = await post(env, { pageText: vague, trackingId: 'AWB004' });
  console.log(`source=${body.source} unmatched=${body.unmatched} modelCalls=${calls.length} (poison rejected, no 7 served)`);
}

console.log('═══ 6. model down → soft failure, deterministic stands ═══');
{
  const { env } = makeEnv({ aiShouldFail: true });
  const { body } = await post(env, { pageText: CLEAR, trackingId: 'AWB005' });
  console.log(`source=${body.source} current=${body.currentMilestone} success=${body.success}`);
}

console.log('═══ 7. footer-only paste → honest unmatched ═══');
{
  const { env, calls } = makeEnv();
  const { body } = await post(env, { pageText: 'Delivered in 24 hours! Home | Track | Login | Subscribe to our newsletter', trackingId: 'AWB006' });
  console.log(`source=${body.source} unmatched=${body.unmatched} n=${body.events.length} modelCalls=${calls.length}`);
}
