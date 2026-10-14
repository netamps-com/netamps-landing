/**
 * Pure key-reconciliation logic — shared by the secure-reconcile endpoint and
 * the Node harness (tests/reconcile.test.mjs). No I/O: the caller supplies an
 * `exists(key)` predicate backed by R2.
 *
 * Purpose: an order's attachment references can point at objects that are no
 * longer in storage (deleted, moved, or never promoted). The gallery already
 * reports those as "unavailable"; this module is the operator tool that
 * verifies every reference and — explicitly, on request — prunes dead ones so
 * the record stops claiming files it cannot serve.
 *
 * Doctrine: report-first, prune-never-by-accident. A missing reference is
 * reported; it is only removed when the operator asks, and removal is audited.
 */

export const MAX_REFS = 500; // hard cap so one huge order can't stall a worker

/** Classify one reference. 'inline' = data: URI (never an R2 object). */
export function classifyKey(key) {
  if (typeof key !== 'string') return 'malformed';
  const k = key.trim();
  if (!k) return 'malformed';
  if (k.startsWith('data:')) return 'inline';
  if (k.length > 1024 || k.includes('..') || /[\r\n]/.test(k)) return 'malformed';
  return 'r2';
}

/**
 * Gather every reference on the order → Map<key, Set<source>>.
 * `sources` records where the key appeared so a prune is never blind about
 * which lists are being changed.
 */
export function collectReferences(order) {
  const map = new Map();
  const add = (key, source) => {
    const cls = classifyKey(key);
    if (cls === 'malformed') {
      const k = String(key).slice(0, 128);
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(source);
      return;
    }
    const k = String(key).trim();
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(source);
  };

  const top = Array.isArray(order?.attachedFiles) ? order.attachedFiles : [];
  for (const k of top.slice(0, MAX_REFS)) add(k, 'request');

  const products = Array.isArray(order?.products) ? order.products : [];
  for (const p of products) {
    if (!p || !Array.isArray(p.attachedFiles)) continue;
    const pid = p.id ? String(p.id) : 'unknown';
    for (const k of p.attachedFiles.slice(0, MAX_REFS)) add(k, `product:${pid}`);
  }
  return map;
}

/** Remove dead keys from the order's lists. Returns a NEW order (never mutates). */
export function stripKeys(order, deadSet) {
  const clean = (list) =>
    (Array.isArray(list) ? list : []).filter((k) => !deadSet.has(typeof k === 'string' ? k.trim() : String(k)));
  return {
    ...order,
    attachedFiles: clean(order.attachedFiles),
    products: (Array.isArray(order.products) ? order.products : []).map((p) =>
      p && Array.isArray(p.attachedFiles) ? { ...p, attachedFiles: clean(p.attachedFiles) } : p
    )
  };
}

/**
 * Reconcile one order.
 * @param {object} order  the parsed returns row
 * @param {(key:string)=>boolean} exists  storage predicate (R2 head across buckets)
 * @returns {{ report: object, nextOrder: object|null, dead: Set<string> }}
 */
export function reconcileOrder(order, exists) {
  const refs = collectReferences(order);
  const missing = [];
  const malformed = [];
  const dead = new Set();
  let ok = 0;
  let inline = 0;

  for (const [key, sources] of refs) {
    const cls = classifyKey(key);
    const src = Array.from(sources);
    if (cls === 'inline') { inline++; continue; }
    if (cls === 'malformed') { malformed.push({ key, sources: src }); continue; }
    if (exists(key)) { ok++; continue; }
    missing.push({ key, sources: src });
    dead.add(key);
  }

  const checked = ok + missing.length + malformed.length + inline;
  const pruned = dead.size > 0 ? Array.from(dead) : [];
  // Pruning changes the file set, so any stored manifest hash no longer
  // describes reality — flag it rather than silently lie.
  const manifestStale = dead.size > 0 && !!(order && order.manifest && order.manifest.hash);

  return {
    report: { checked, ok, missing, malformed, inline, pruned, manifestStale },
    nextOrder: dead.size > 0 ? stripKeys(order, dead) : null,
    dead
  };
}
