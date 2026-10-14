/**
 * Driver test for key reconciliation (secure-reconcile).
 *
 * Exercises the pure logic with a stub storage predicate — no R2, no network —
 * so the report counts and the prune behaviour are verified exactly.
 *
 * Run: node tests/reconcile.test.mjs
 */
import { classifyKey, collectReferences, stripKeys, reconcileOrder, MAX_REFS } from '../functions/api/reconcile/logic.mjs';

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// ── 1. Classification ───────────────────────────────────────────────────────
t('data URI is inline', classifyKey('data:image/png;base64,xxxx') === 'inline');
t('normal R2 key is r2', classifyKey('requests/abc/products/p1/uuid.png') === 'r2');
t('traversal is malformed', classifyKey('requests/../secret.png') === 'malformed');
t('newline is malformed', classifyKey('a/b\nc.png') === 'malformed');
t('empty is malformed', classifyKey('   ') === 'malformed');
t('non-string is malformed', classifyKey(null) === 'malformed');
t('oversized is malformed', classifyKey('x'.repeat(MAX_REFS * 3)) === 'malformed');

// ── 2. Reference collection + sources ───────────────────────────────────────
{
  const order = {
    attachedFiles: ['a.png', 'data:image/png;base64,z'],
    products: [
      { id: 'p1', attachedFiles: ['a.png', 'b.mp4'] },
      { id: 'p2' }
    ],
    manifest: { hash: 'h1' }
  };
  const refs = collectReferences(order);
  t('shared key reports both sources', refs.get('a.png').has('request') && refs.get('a.png').has('product:p1'));
  t('product-scoped source is labelled', refs.get('b.mp4').has('product:p1'));
}

// ── 3. All present ──────────────────────────────────────────────────────────
{
  const order = { attachedFiles: ['a.png'], products: [{ id: 'p1', attachedFiles: ['b.png'] }], manifest: { hash: 'h' } };
  const { report, nextOrder } = reconcileOrder(order, () => true);
  t('all present counts ok + inline', report.checked === 2 && report.ok === 2 && report.missing.length === 0);
  t('no prune when nothing missing', nextOrder === null && report.pruned.length === 0);
  t('manifest stays fresh', report.manifestStale === false);
}

// ── 4. Missing reference ────────────────────────────────────────────────────
{
  const order = {
    attachedFiles: ['gone.png'],
    products: [{ id: 'p1', attachedFiles: ['alive.png', 'gone.png'] }],
    manifest: { hash: 'h' }
  };
  const { report, nextOrder } = reconcileOrder(order, (k) => k === 'alive.png');
  t('missing counted once, sources unioned', report.missing.length === 1 && report.missing[0].key === 'gone.png');
  t('sources name both lists', report.missing[0].sources.includes('request') && report.missing[0].sources.includes('product:p1'));
  t('checked counts each physical key once', report.checked === 2 && report.ok === 1);
  t('prune strips the key from every list', !nextOrder.attachedFiles.includes('gone.png') && !nextOrder.products[0].attachedFiles.includes('gone.png'));
  t('surviving file is kept', nextOrder.products[0].attachedFiles.includes('alive.png'));
  t('manifest flagged stale after prune', report.manifestStale === true);
  t('pruned list echoes the key', report.pruned.includes('gone.png'));
}

// ── 5. Malformed + inline never hit storage ─────────────────────────────────
{
  let storageCalls = 0;
  const order = {
    attachedFiles: ['data:image/png;base64,aa', 'a/../b.png', 'ok.png'],
    products: [],
    manifest: null
  };
  const { report } = reconcileOrder(order, () => { storageCalls++; return true; });
  t('malformed and inline are excluded from storage', storageCalls === 1);
  t('malformed reported', report.malformed.length === 1 && report.malformed[0].key === 'a/../b.png');
  t('inline reported separately', report.inline === 1);
  t('checked is the full census', report.checked === 3);
  t('no manifest means not stale', report.manifestStale === false);
}

// ── 6. stripKeys is pure (input untouched) ──────────────────────────────────
{
  const order = { attachedFiles: ['dead.png', 'keep.png'], products: [{ id: 'p1', attachedFiles: ['dead.png'] }] };
  const out = stripKeys(order, new Set(['dead.png']));
  t('original order is not mutated', order.attachedFiles.length === 2 && order.products[0].attachedFiles.length === 1);
  t('stripped copy is new', out !== order && out.products[0] !== order.products[0]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
