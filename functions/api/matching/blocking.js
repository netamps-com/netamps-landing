/**
 * Stage-1 deterministic candidate generation ("blocking" in record-linkage
 * terms) for BUY → SELL best-match suggestions.
 *
 * Design: docs/buy-best-match-design.md.
 *
 * This module is PURE and has NO LLM and NO database access. Given a BUY line
 * and the SELL book, it returns the ranked shortlist the LLM is allowed to
 * re-rank. Two reasons it exists as its own module:
 *   1. It is the honest floor — if it returns nothing, the answer is "no
 *      comparable stock" and NO model is called (the empty state is a valid,
 *      explicit outcome, not a failure).
 *   2. It is the grounding surface for the LLM: the model may only re-order
 *      what this produces, so a hallucinated SELL order is structurally
 *      impossible.
 *
 * It reuses the catalog's fold/tokenize/Jaro-Winkler primitives — no new
 * similarity infrastructure. The exact order matcher (match.js) is untouched.
 */

import { fold, tokenize } from '../products/etl.js';
import { normalizeFold, jaroWinkler } from '../products/catalog.js';

export const BLOCK_LIMIT = 40;

// A SELL line scoring below this is never surfaced as a candidate at all. The
// rule from the design doc: a "closest match" with nothing in common is worse
// than an empty state. This is what makes `ASUS Laptop vs DELL server` return
// nothing instead of a confident-looking nonsense pairing.
export const BLOCK_MIN_SCORE = 0.28;

/** Jaccard overlap of two token lists, in [0,1]. */
export function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens || []);
  const B = new Set(bTokens || []);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Retrieval tokens for a line (category + details), stopword-filtered. */
export function lineTokens(line) {
  return tokenize(`${(line && line.category) || ''} ${(line && line.details) || ''}`);
}

/**
 * Deterministic similarity of one BUY line to one SELL line.
 * Returns { score: 0..1, signals: {...} } where every signal is explainable.
 */
export function blockScore(buyLine, sellLine) {
  const bt = buyLine.tokens || lineTokens(buyLine);
  const st = sellLine.tokens || lineTokens(sellLine);

  const tokenOverlap = jaccard(bt, st);
  const modelSim = jaroWinkler(
    normalizeFold((buyLine && buyLine.details) || ''),
    normalizeFold((sellLine && sellLine.details) || '')
  );
  const buyCat = normalizeFold((buyLine && buyLine.category) || '');
  const sellCat = normalizeFold((sellLine && sellLine.category) || '');
  const sameCategory = Boolean(buyCat) && buyCat === sellCat;
  const sameCatalog = Boolean(
    buyLine && sellLine && buyLine.catalogId && sellLine.catalogId &&
    buyLine.catalogId === sellLine.catalogId
  );

  let score = 0;
  if (sameCatalog) score += 0.45;
  if (sameCategory) score += 0.15;
  score += 0.30 * tokenOverlap;
  score += 0.25 * modelSim;
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    signals: { tokenOverlap, modelSim, sameCategory, sameCatalog },
  };
}

/**
 * Build the deterministic shortlist for a BUY line.
 *
 * @param {object} buyLine  { category, details, catalogId?, tokens? }
 * @param {Array}  sellLines [{ orderId, lineIdx, category, details, qty, catalogId?, tokens? }]
 * @param {{limit?:number, minScore?:number}} [opts]
 * @returns {Array} scored candidates, best first, capped at `limit`
 */
export function buildShortlist(buyLine, sellLines, opts = {}) {
  const limit = Number.isInteger(opts.limit) ? opts.limit : BLOCK_LIMIT;
  const minScore = Number.isFinite(opts.minScore) ? opts.minScore : BLOCK_MIN_SCORE;
  if (!buyLine || !Array.isArray(sellLines) || sellLines.length === 0) return [];

  const scored = [];
  for (const s of sellLines) {
    if (!s || !s.orderId) continue;
    const { score, signals } = blockScore(buyLine, s);
    if (score < minScore) continue;
    scored.push({
      orderId: s.orderId,
      lineIdx: Number.isInteger(s.lineIdx) ? s.lineIdx : 0,
      category: s.category ?? null,
      details: s.details ?? null,
      qty: Number.isInteger(s.qty) ? s.qty : null,
      blockScore: score,
      signals,
    });
  }

  scored.sort(
    (a, b) =>
      b.blockScore - a.blockScore ||
      String(a.orderId).localeCompare(String(b.orderId)) ||
      a.lineIdx - b.lineIdx
  );
  return scored.slice(0, limit);
}
